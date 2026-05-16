/**
 * GPU particle system: Three.js WebGPURenderer with TSL compute shaders.
 *
 * Each particle is assigned to one of five flow targets (HMRC, water, energy,
 * council tax, unaccounted) in proportion to per-LAD flow estimates. Particles
 * travel from their LAD centroid to the target's screen position, then respawn.
 *
 * WebGPU primary; Three.js auto-falls back to WebGL2.
 */

import * as THREE from 'three/webgpu';
import {
  Fn, If, uniform,
  float, int, vec2, vec3,
  positionLocal, uv,
  hash, cos, sin,
  instancedArray, instanceIndex,
  storage,
  deltaTime, time,
} from 'three/tsl';
import type { Map as MapLibreMap, LngLatLike } from 'maplibre-gl';
import type { FlowBundle, FlowMeta, FlowType, LayerToggles } from './types.js';
import { FLOW_COLORS, FLOW_TYPES, isLayerEffectivelyOff } from './types.js';

const NUM_PARTICLES = 8_000;
const MAX_LADS = 16;
const NUM_TARGETS = 5;
const MAX_LIFE = 4.0;    // seconds per particle journey
const SPREAD_R = 6;      // pixel spawn scatter radius at centroid
const PARTICLE_PX = 5;   // base sprite size in CSS pixels
const STREAK_W = 0.55;   // perpendicular-to-motion scale — thin
const STREAK_L = 2.4;    // along-motion scale — distinct streak

export class ParticleSystem {
  private renderer: InstanceType<typeof THREE.WebGPURenderer>;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;

  // GPU-only per-particle state (written by compute shaders)
  private positions: any;     // vec3[N] — current pixel position
  private ages: any;          // float[N] — 0→1 lifecycle
  private targetIdxBuf: any;  // float[N] — which target (0-4)
  private spawnPosBuf: any;   // vec2[N] — centroid snapshot at spawn

  // CPU→GPU: per-particle LAD assignment
  private ladIdxData!: Float32Array;
  private ladIdxAttr!: THREE.StorageBufferAttribute;
  private ladIdxStorage: any;

  // CPU→GPU: LAD centroid screen positions (updated every frame for map pan)
  private centroidData!: Float32Array;
  private centroidAttr!: THREE.StorageBufferAttribute;
  private centroidStorage: any;

  // CPU→GPU: flow thresholds — vec4 per LAD: (t0, t1, t2, t3) cumulative fractions
  private flowThreshData!: Float32Array;
  private flowThreshAttr!: THREE.StorageBufferAttribute;
  private flowThreshStorage: any;

  // CPU→GPU: target node screen positions (5 entries, updated on resize)
  private targetPosData!: Float32Array;
  private targetPosAttr!: THREE.StorageBufferAttribute;
  private targetPosStorage: any;

  // CPU→GPU: target colors (one vec4 per flow type, set once)
  private targetColorData!: Float32Array;
  private targetColorAttr!: THREE.StorageBufferAttribute;
  private targetColorStorage: any;


  private computeInit: any;
  private computeUpdate: any;

  private map: MapLibreMap | null = null;
  private centroidLngLats: [number, number][] = [];
  private cachedTargetPixels: [number, number][] = [];
  private ready = false;

  width: number;
  height: number;

  constructor(canvas: HTMLCanvasElement) {
    this.width = canvas.clientWidth || window.innerWidth;
    this.height = canvas.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGPURenderer({ canvas, alpha: true, antialias: false });
    this.scene = new THREE.Scene();
    // y=0 at bottom, y=height at top (standard OpenGL convention)
    this.camera = new THREE.OrthographicCamera(0, this.width, this.height, 0, 0.1, 100);
    this.camera.position.z = 1;
  }

  async init(): Promise<void> {
    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.setClearColor(0x000000, 0);
    await this.renderer.init();

    this.buildBuffers();
    this.buildCompute();
    this.buildMesh();

    this.renderer.setAnimationLoop(() => this.frame());
    console.info('[ParticleSystem] backend:', this.backendName);
  }

  private buildBuffers(): void {
    const N = NUM_PARTICLES;

    // Per-particle GPU state
    this.positions = instancedArray(N, 'vec3');
    this.ages      = instancedArray(N, 'float');
    this.targetIdxBuf = instancedArray(N, 'float');
    this.spawnPosBuf  = instancedArray(N, 'vec2');

    // Per-particle LAD index (CPU writes once, GPU reads)
    this.ladIdxData = new Float32Array(N);
    // @ts-ignore — StorageBufferAttribute is WebGPU-only, @types/three lags the API
    this.ladIdxAttr = new THREE.StorageBufferAttribute(this.ladIdxData, 1);
    this.ladIdxStorage = storage(this.ladIdxAttr, 'float', N);

    // LAD centroid positions in screen space
    this.centroidData = new Float32Array(MAX_LADS * 2);
    // @ts-ignore
    this.centroidAttr = new THREE.StorageBufferAttribute(this.centroidData, 2);
    this.centroidStorage = storage(this.centroidAttr, 'vec2', MAX_LADS);

    // Flow thresholds per LAD (4 cumulative fractions, stored as vec4)
    this.flowThreshData = new Float32Array(MAX_LADS * 4);
    // @ts-ignore
    this.flowThreshAttr = new THREE.StorageBufferAttribute(this.flowThreshData, 4);
    this.flowThreshStorage = storage(this.flowThreshAttr, 'vec4', MAX_LADS);

    // Target node pixel positions (5 targets × 2 floats)
    this.targetPosData = new Float32Array(NUM_TARGETS * 2);
    // @ts-ignore
    this.targetPosAttr = new THREE.StorageBufferAttribute(this.targetPosData, 2);
    this.targetPosStorage = storage(this.targetPosAttr, 'vec2', NUM_TARGETS);

    // Target colors (5 targets × 4 floats RGBA)
    this.targetColorData = new Float32Array(NUM_TARGETS * 4);
    // @ts-ignore
    this.targetColorAttr = new THREE.StorageBufferAttribute(this.targetColorData, 4);
    this.targetColorStorage = storage(this.targetColorAttr, 'vec4', NUM_TARGETS);

    FLOW_TYPES.forEach((ft: FlowType, i: number) => {
      const [r, g, b] = FLOW_COLORS[ft];
      this.targetColorData[i * 4 + 0] = r;
      this.targetColorData[i * 4 + 1] = g;
      this.targetColorData[i * 4 + 2] = b;
      this.targetColorData[i * 4 + 3] = 1;
    });
    this.targetColorAttr.needsUpdate = true;

  }

  private buildCompute(): void {
    const N = NUM_PARTICLES;
    const maxLife  = uniform(MAX_LIFE);
    const spreadR  = uniform(SPREAD_R);
    const { positions, ages, targetIdxBuf, spawnPosBuf,
            ladIdxStorage, centroidStorage, flowThreshStorage } = this;
    const targetPosStorage = this.targetPosStorage;

    // Assign target bucket using If/ElseIf chain on cumulative thresholds.
    // r is in [0,1); t0…t3 are cumulative fractions summing toward 1.
    const assignTarget = (storageEl: any, r: any, thresh: any) => {
      If(r.lessThan(thresh.x), () => {
        storageEl.assign(float(0));
      }).ElseIf(r.lessThan(thresh.y), () => {
        storageEl.assign(float(1));
      }).ElseIf(r.lessThan(thresh.z), () => {
        storageEl.assign(float(2));
      }).ElseIf(r.lessThan(thresh.w), () => {
        storageEl.assign(float(3));
      }).Else(() => {
        storageEl.assign(float(4));
      });
    };

    // --- Init: assign LAD, target, spawn position, staggered age ---
    this.computeInit = Fn(() => {
      const i = instanceIndex;
      const ladIdx = int(ladIdxStorage.element(i));
      const centroid = centroidStorage.element(ladIdx);
      const thresh   = flowThreshStorage.element(ladIdx);

      // Stagger initial ages so particles distribute along paths immediately
      ages.element(i).assign(hash(float(i)));

      // Pick target based on flow thresholds
      const r0 = hash(float(i).add(float(17)));
      assignTarget(targetIdxBuf.element(i), r0, thresh);

      // Spawn at centroid + small random scatter
      const spawnAngle = hash(float(i).add(float(42))).mul(Math.PI * 2);
      const spawnR     = hash(float(i).add(float(83))).mul(spreadR);
      const sx = centroid.x.add(cos(spawnAngle).mul(spawnR));
      const sy = centroid.y.add(sin(spawnAngle).mul(spawnR));
      spawnPosBuf.element(i).assign(vec2(sx, sy));
      positions.element(i).assign(vec3(sx, sy, float(0)));
    })().compute(N);

    // --- Update: advance age, interpolate position, or respawn ---
    this.computeUpdate = Fn(() => {
      const i = instanceIndex;
      const age    = ages.element(i);
      const ladIdx = int(ladIdxStorage.element(i));

      age.addAssign(deltaTime.div(maxLife));

      If(age.greaterThanEqual(float(1.0)), () => {
        // Respawn: re-pick target, capture fresh centroid as spawn origin
        const centroid = centroidStorage.element(ladIdx);
        const thresh   = flowThreshStorage.element(ladIdx);

        const rSpawn = hash(float(i).add(time));
        assignTarget(targetIdxBuf.element(i), rSpawn, thresh);

        const spawnAngle = hash(float(i).add(time.mul(float(1.7)))).mul(Math.PI * 2);
        const spawnR     = hash(float(i).add(time.mul(float(2.3)))).mul(spreadR);
        const sx = centroid.x.add(cos(spawnAngle).mul(spawnR));
        const sy = centroid.y.add(sin(spawnAngle).mul(spawnR));
        spawnPosBuf.element(i).assign(vec2(sx, sy));
        positions.element(i).assign(vec3(sx, sy, float(0)));
        age.assign(float(0));
      }).Else(() => {
        // Smooth travel from spawn to target using smoothstep easing
        const tgtIdx = int(targetIdxBuf.element(i));
        const spawn  = spawnPosBuf.element(i);
        const tgt    = targetPosStorage.element(tgtIdx);

        // smoothstep: t² × (3 − 2t) — ease in and out
        const t      = age.clamp(0, 1);
        const eased  = t.mul(t).mul(float(3).sub(t.mul(float(2))));

        const px = spawn.x.add(tgt.x.sub(spawn.x).mul(eased));
        const py = spawn.y.add(tgt.y.sub(spawn.y).mul(eased));
        positions.element(i).assign(vec3(px, py, float(0)));
      });
    })().compute(N);
  }

  private buildMesh(): void {
    const { positions, ages, targetIdxBuf, spawnPosBuf } = this;
    const targetPosStorage   = this.targetPosStorage;
    const targetColorStorage = this.targetColorStorage;
    const i = instanceIndex;

    const age     = ages.element(i);
    const fadeIn  = age.div(0.15).clamp(0, 1);
    const fadeOut = age.sub(0.85).div(0.15).clamp(0, 1).oneMinus();
    const lifetimeFade = fadeIn.mul(fadeOut);

    // Solid disc with a soft outer edge — flat-top until ~60% of the radius,
    // then a smoothstep falloff to the rim. Reads as a printed ink mark on paper.
    const radial = uv().sub(vec2(0.5)).length().mul(2.0).clamp(0, 1);
    const t      = radial.sub(float(0.55)).div(float(0.45)).clamp(0, 1);
    const glow   = float(1.0).sub(t.mul(t).mul(float(3).sub(t.mul(float(2)))));

    const tgtIdx    = int(targetIdxBuf.element(i));
    const flowColor = targetColorStorage.element(tgtIdx);

    // flowColor.w is the enabled flag: 1.0 = visible, 0.0 = disabled (fades to invisible)
    const opacityNode = lifetimeFade.mul(glow).mul(flowColor.w);

    // Deepen the ink slightly for higher contrast against the cream ground
    const colorNode = flowColor.rgb.mul(float(0.85));

    // Streak direction: normalize (target − spawn) for each particle
    const spawn   = spawnPosBuf.element(i);
    const tgtPos  = targetPosStorage.element(tgtIdx);
    const rawDir  = tgtPos.sub(spawn);
    const len     = rawDir.length().max(float(1.0));
    const dirX    = rawDir.x.div(len);
    const dirY    = rawDir.y.div(len);

    // Stretch quad: thin perpendicular, long along motion direction
    const sx    = positionLocal.x.mul(STREAK_W);
    const sy    = positionLocal.y.mul(STREAK_L);
    const rotX  = sx.mul(dirY).add(sy.mul(dirX));
    const rotY  = sx.mul(dirX.negate()).add(sy.mul(dirY));
    // @ts-ignore — TSL swizzle nodes type as vec3 but are treated as scalars at runtime
    const streakOffset = vec3(rotX, rotY, float(0));

    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    material.positionNode = streakOffset.add(positions.toAttribute());
    material.colorNode    = colorNode;
    material.opacityNode  = opacityNode;
    material.alphaToCoverage = false;

    const geometry = new THREE.PlaneGeometry(PARTICLE_PX, PARTICLE_PX);
    const mesh = new THREE.InstancedMesh(geometry, material, NUM_PARTICLES);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  setData(
    bundle: FlowBundle,
    map: MapLibreMap,
    centroidLngLats: [number, number][],
    targetPixels: [number, number][],
  ): void {
    this.map = map;
    this.centroidLngLats = centroidLngLats;

    const lads  = bundle.lads;
    const total = lads.reduce((s, l) => s + l.total_payroll_estimate_gbp, 0);
    const N     = NUM_PARTICLES;

    // Proportional particle allocation per LAD
    const counts = lads.map(l =>
      Math.max(5, Math.round(N * l.total_payroll_estimate_gbp / total))
    );
    let rem = N;
    for (let i = 0; i < counts.length - 1; i++) {
      counts[i] = Math.min(counts[i], rem - (counts.length - 1 - i));
      rem -= counts[i];
    }
    counts[counts.length - 1] = Math.max(1, rem);

    let idx = 0;
    for (let ladIdx = 0; ladIdx < lads.length; ladIdx++) {
      for (let j = 0; j < counts[ladIdx]; j++) {
        this.ladIdxData[idx++] = ladIdx;
      }
    }
    this.ladIdxAttr.needsUpdate = true;

    // Upload flow thresholds
    for (let i = 0; i < lads.length && i < MAX_LADS; i++) {
      const [t0, t1, t2, t3] = lads[i].flow_thresholds;
      this.flowThreshData[i * 4 + 0] = t0;
      this.flowThreshData[i * 4 + 1] = t1;
      this.flowThreshData[i * 4 + 2] = t2;
      this.flowThreshData[i * 4 + 3] = t3;
    }
    this.flowThreshAttr.needsUpdate = true;

    this.updateCentroids();
    this.updateTargetPositions(targetPixels);
    this.renderer.compute(this.computeInit);
    this.ready = true;
  }

  updateCentroids(): void {
    if (!this.map || !this.centroidLngLats.length) return;
    for (let i = 0; i < this.centroidLngLats.length && i < MAX_LADS; i++) {
      const pt = this.map.project(this.centroidLngLats[i] as LngLatLike);
      // Convert MapLibre pixel coords (y=0 at top) to camera space (y=0 at bottom)
      this.centroidData[i * 2]     = pt.x;
      this.centroidData[i * 2 + 1] = this.height - pt.y;
    }
    this.centroidAttr.needsUpdate = true;
  }

  updateTargetPositions(htmlPixels: [number, number][]): void {
    // htmlPixels: [x, y] in HTML coordinates (y=0 at top)
    // Convert to camera space (y=0 at bottom)
    this.cachedTargetPixels = htmlPixels;
    for (let i = 0; i < htmlPixels.length && i < NUM_TARGETS; i++) {
      this.targetPosData[i * 2]     = htmlPixels[i][0];
      this.targetPosData[i * 2 + 1] = this.height - htmlPixels[i][1];
    }
    this.targetPosAttr.needsUpdate = true;
  }

  private frame(): void {
    if (!this.ready) return;
    this.updateCentroids();
    this.renderer.compute(this.computeUpdate);
    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.width  = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.right = width;
    this.camera.top   = height;
    this.camera.updateProjectionMatrix();
    if (this.cachedTargetPixels.length) {
      this.updateTargetPositions(this.cachedTargetPixels);
    }
  }

  /** Update which targets are visible. Disabled targets fade their particles to opacity 0. */
  updateToggles(effectiveToggles: LayerToggles, flowMeta: Record<string, FlowMeta>): void {
    if (!this.ready) return;
    FLOW_TYPES.forEach((ft: FlowType, i: number) => {
      const confidence = flowMeta[ft]?.confidence ?? 'measured';
      const enabled = !isLayerEffectivelyOff(effectiveToggles[ft], confidence);
      this.targetColorData[i * 4 + 3] = enabled ? 1.0 : 0.0;
    });
    this.targetColorAttr.needsUpdate = true;
  }

  get backendName(): string {
    // @ts-ignore
    return this.renderer.backend?.constructor?.name ?? 'unknown';
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }
}
