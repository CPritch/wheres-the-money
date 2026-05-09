/**
 * GPU particle system: Three.js WebGPURenderer with TSL compute shaders.
 * Particles spawn at LAD centroids and animate straight off-screen (upward).
 * Counts are proportional to each district's total payroll estimate.
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
import type { FlowBundle } from './types.js';

const NUM_PARTICLES = 5000;
const MAX_LADS = 16;      // padded to power-of-two for alignment
const SPEED = 140;        // pixels/second base — tight, energetic upward flow
const MAX_LIFE = 3.0;     // seconds per particle lifetime
const SPREAD_R = 8;       // pixel spread radius on spawn — coherent stream root
const SPREAD_ANGLE = 0.18; // radians (±~5°) — narrow stream, not air drift
const PARTICLE_PX = 6;    // base sprite size in CSS pixels (before streak stretch)
const STREAK_W = 0.55;    // perpendicular-to-motion scale — thin
const STREAK_L = 2.8;     // along-motion scale — long enough to read as a beam
                          // when many overlap in a tight stream

// Choropleth palette (matches Map.svelte's fill-color stops). Particle color is
// looked up per source LAD so each stream glows the colour of its own district.
const PAY_MIN = 100_000_000;
const PAY_MAX = 355_000_000;
const PAY_MID = (PAY_MIN + PAY_MAX) / 2;
const COLOR_LOW  = [0x0e / 255, 0x10 / 255, 0x42 / 255]; // #0e1042
const COLOR_MID  = [0x3d / 255, 0x45 / 255, 0xc0 / 255]; // #3d45c0
const COLOR_HIGH = [0x7c / 255, 0x83 / 255, 0xff / 255]; // #7c83ff

export class ParticleSystem {
  private renderer: InstanceType<typeof THREE.WebGPURenderer>;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;

  // GPU-only storage (written exclusively by compute shaders)
  private positions: any; // instancedArray vec3[N]
  private ages: any;      // instancedArray float[N]

  // CPU→GPU storage (filled from JS, read by GPU)
  private ladData!: Float32Array;
  private ladAttr!: THREE.StorageBufferAttribute;
  private ladStorage: any;

  private centroidData!: Float32Array;
  private centroidAttr!: THREE.StorageBufferAttribute;
  private centroidStorage: any;

  private colorData!: Float32Array;
  private colorAttr!: THREE.StorageBufferAttribute;
  private colorStorage: any;

  // Per-LAD centroid delta in pixels since last frame. Compute shader adds this
  // to in-flight particles so they track the map as it pans/zooms instead of
  // freezing in their previous screen positions.
  private prevCentroidData!: Float32Array;
  private deltaData!: Float32Array;
  private deltaAttr!: THREE.StorageBufferAttribute;
  private deltaStorage: any;
  private firstCentroidUpdate = true;

  private computeInit: any;
  private computeUpdate: any;

  private map: MapLibreMap | null = null;
  private centroidLngLats: [number, number][] = [];
  private ready = false;

  width: number;
  height: number;

  constructor(canvas: HTMLCanvasElement) {
    this.width = canvas.clientWidth || window.innerWidth;
    this.height = canvas.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGPURenderer({ canvas, alpha: true, antialias: false });
    this.scene = new THREE.Scene();
    // Standard Three convention: top > bottom. World y=0 = bottom of screen,
    // y=height = top. We flip MapLibre's pixel.y when feeding coords (it has y=0 at top).
    // Required so triangle winding stays correct and FrontSide isn't back-face-culled.
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

    this.positions = instancedArray(N, 'vec3'); // (x, y, 0)
    this.ages = instancedArray(N, 'float');

    this.ladData = new Float32Array(N);
    // @ts-ignore — StorageBufferAttribute is WebGPU-only, @types/three lags the API
    this.ladAttr = new THREE.StorageBufferAttribute(this.ladData, 1);
    this.ladStorage = storage(this.ladAttr, 'float', N);

    this.centroidData = new Float32Array(MAX_LADS * 2);
    // @ts-ignore
    this.centroidAttr = new THREE.StorageBufferAttribute(this.centroidData, 2);
    this.centroidStorage = storage(this.centroidAttr, 'vec2', MAX_LADS);

    // Per-LAD glow colour. Pad to vec4 because WebGPU storage buffers align vec3
    // to 16 bytes — using 4 components avoids any padding ambiguity.
    this.colorData = new Float32Array(MAX_LADS * 4);
    // @ts-ignore
    this.colorAttr = new THREE.StorageBufferAttribute(this.colorData, 4);
    this.colorStorage = storage(this.colorAttr, 'vec4', MAX_LADS);

    // Centroid delta buffer (per-LAD pixel shift since last frame). Compute
    // shader applies this to in-flight particles to track map pan/zoom.
    this.prevCentroidData = new Float32Array(MAX_LADS * 2);
    this.deltaData = new Float32Array(MAX_LADS * 2);
    // @ts-ignore
    this.deltaAttr = new THREE.StorageBufferAttribute(this.deltaData, 2);
    this.deltaStorage = storage(this.deltaAttr, 'vec2', MAX_LADS);
  }

  private buildCompute(): void {
    const N = NUM_PARTICLES;
    const speed = uniform(SPEED);
    const maxLife = uniform(MAX_LIFE);
    const spreadR = uniform(SPREAD_R);
    const spreadAngle = uniform(SPREAD_ANGLE);
    const { positions, ages, ladStorage, centroidStorage, deltaStorage } = this;

    // Init: assign each particle a random age offset and position near its centroid.
    // Two independent hash calls (different seeds) instead of hash(vec2) avoids
    // TypeScript's scalar return-type assumption on the hash() overload.
    this.computeInit = Fn(() => {
      const i = instanceIndex;
      const ladIdx = ladStorage.element(i);
      const centroid = centroidStorage.element(int(ladIdx));

      ages.element(i).assign(hash(float(i)));

      const angle = hash(float(i).add(float(42))).mul(Math.PI * 2);
      const r = hash(float(i).add(float(83))).mul(spreadR);
      positions.element(i).assign(vec3(
        centroid.x.add(cos(angle).mul(r)),
        centroid.y.add(sin(angle).mul(r)),
        float(0),
      ));
    })().compute(N);

    // Update: advance age, move particle (with slight upward acceleration over
    // life so it reads as an electric stream rather than air drift), or respawn.
    this.computeUpdate = Fn(() => {
      const i = instanceIndex;
      const pos = positions.element(i);
      const age = ages.element(i);

      // Stable per-particle direction: tight ~±5° spread → coherent upward stream.
      // Camera convention: world y=0 at bottom, y=height at top → +y is up the screen.
      const hDir = hash(float(i).add(float(0.7)));
      const pertAngle = hDir.sub(0.5).mul(spreadAngle);
      const dx = sin(pertAngle);
      const dy = cos(pertAngle); // positive = up the screen

      // Velocity ramps from 0.7× at birth to 1.4× at end-of-life — gives the
      // stream visible momentum and a sparky "shooting upward" feel.
      const velScale = age.mul(float(0.7)).add(float(0.7));

      age.addAssign(deltaTime.div(maxLife));

      If(age.greaterThanEqual(float(1.0)), () => {
        const ladIdx = ladStorage.element(i);
        const centroid = centroidStorage.element(int(ladIdx));

        // Two independent hashes seeded by (i, time) give different values each respawn
        const spawnAngle = hash(float(i).add(time)).mul(Math.PI * 2);
        const spawnR = hash(float(i).add(time.mul(float(1.7)))).mul(spreadR);

        pos.assign(vec3(
          centroid.x.add(cos(spawnAngle).mul(spawnR)),
          centroid.y.add(sin(spawnAngle).mul(spawnR)),
          float(0),
        ));
        age.assign(float(0));
      }).Else(() => {
        pos.x.addAssign(dx.mul(speed).mul(deltaTime).mul(velScale));
        pos.y.addAssign(dy.mul(speed).mul(deltaTime).mul(velScale));

        // Track per-LAD map movement so in-flight particles don't freeze in
        // their previous screen position when the user pans/zooms.
        const trackLadIdx = ladStorage.element(i);
        const delta = deltaStorage.element(int(trackLadIdx));
        pos.x.addAssign(delta.x);
        pos.y.addAssign(delta.y);
      });
    })().compute(N);
  }

  private buildMesh(): void {
    const { positions, ages, ladStorage, colorStorage } = this;
    const i = instanceIndex;

    const age = ages.element(i);
    const fadeIn = age.div(0.15).clamp(0, 1);
    const fadeOut = age.sub(0.85).div(0.15).clamp(0, 1).oneMinus();
    const lifetimeFade = fadeIn.mul(fadeOut);

    // Soft radial glow: bright core, smooth gaussian-ish falloff to transparent
    // at the quad edge. Reads as a neon spark rather than a hard-edged disc.
    const radial = uv().sub(vec2(0.5)).length().mul(2.0).clamp(0, 1);
    const glow = float(1.0).sub(radial).pow(2.2);
    const opacityNode = lifetimeFade.mul(glow);

    // Look up the source LAD's colour from the per-LAD palette buffer.
    // Boost it for additive saturation — overlapping particles bloom toward white
    // at high density (more money → brighter glow).
    const ladIdx = ladStorage.element(i);
    const ladColor = colorStorage.element(int(ladIdx));
    const colorNode = ladColor.rgb.mul(float(1.6));

    // Per-particle direction — must use the SAME formula as buildCompute() so
    // the streak's long axis aligns with the actual flight direction.
    const hDir = hash(float(i).add(float(0.7)));
    const pertAngle = hDir.sub(0.5).mul(SPREAD_ANGLE);
    const dirX = sin(pertAngle);
    const dirY = cos(pertAngle); // motion direction (mostly +Y / up the screen)

    // Stretch the local quad: thin perpendicular to motion, long along it.
    // Then rotate so the stretched Y axis aligns with the motion direction.
    // Math: rotated = scaledX * perp + scaledY * dir, where perp = (dirY, -dirX).
    const sx = positionLocal.x.mul(STREAK_W);
    const sy = positionLocal.y.mul(STREAK_L);
    const rotX = sx.mul(dirY).add(sy.mul(dirX));
    const rotY = sx.mul(dirX.negate()).add(sy.mul(dirY));
    const streakOffset = vec3(rotX, rotY, float(0));

    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    // World vertex = per-instance particle position + rotated/stretched local offset.
    material.positionNode = streakOffset.add(positions.toAttribute());
    material.colorNode = colorNode;
    material.opacityNode = opacityNode;
    material.alphaToCoverage = false;

    // Base 6×6 quad in world units. Stretching turns it into a ~3.3×16.8 px streak.
    // Many overlapping streaks in a tight stream visually merge into a glowing beam.
    const geometry = new THREE.PlaneGeometry(PARTICLE_PX, PARTICLE_PX);
    const mesh = new THREE.InstancedMesh(geometry, material, NUM_PARTICLES);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  setData(bundle: FlowBundle, map: MapLibreMap, centroidLngLats: [number, number][]): void {
    this.map = map;
    this.centroidLngLats = centroidLngLats;

    const lads = bundle.lads;
    const total = lads.reduce((s, l) => s + l.total_payroll_estimate_gbp, 0);
    const N = NUM_PARTICLES;

    // Proportional particle counts, clamped to N total
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
        this.ladData[idx++] = ladIdx;
      }
    }
    this.ladAttr.needsUpdate = true;

    // Per-LAD glow colour, interpolated through the same 3-stop palette as the
    // choropleth so the stream and the tile underneath visually match.
    for (let i = 0; i < lads.length && i < MAX_LADS; i++) {
      const rgb = paletteAt(lads[i].total_payroll_estimate_gbp);
      this.colorData[i * 4 + 0] = rgb[0];
      this.colorData[i * 4 + 1] = rgb[1];
      this.colorData[i * 4 + 2] = rgb[2];
      this.colorData[i * 4 + 3] = 1;
    }
    this.colorAttr.needsUpdate = true;

    this.updateCentroids();
    this.renderer.compute(this.computeInit);
    this.ready = true;
  }

  updateCentroids(): void {
    if (!this.map || !this.centroidLngLats.length) return;
    const useDelta = !this.firstCentroidUpdate;
    for (let i = 0; i < this.centroidLngLats.length && i < MAX_LADS; i++) {
      const pt = this.map.project(this.centroidLngLats[i] as LngLatLike);
      const newX = pt.x;
      // Flip Y: MapLibre's pt.y has 0 at top, our camera has 0 at bottom.
      const newY = this.height - pt.y;

      if (useDelta) {
        this.deltaData[i * 2]     = newX - this.prevCentroidData[i * 2];
        this.deltaData[i * 2 + 1] = newY - this.prevCentroidData[i * 2 + 1];
      } else {
        this.deltaData[i * 2]     = 0;
        this.deltaData[i * 2 + 1] = 0;
      }

      this.prevCentroidData[i * 2]     = newX;
      this.prevCentroidData[i * 2 + 1] = newY;
      this.centroidData[i * 2]     = newX;
      this.centroidData[i * 2 + 1] = newY;
    }
    this.firstCentroidUpdate = false;
    this.centroidAttr.needsUpdate = true;
    this.deltaAttr.needsUpdate = true;
  }

  private frame(): void {
    if (!this.ready) return;
    this.updateCentroids();
    this.renderer.compute(this.computeUpdate);
    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.right = width;
    this.camera.top = height;  // standard convention: top = max y, bottom stays 0
    this.camera.updateProjectionMatrix();
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

// Two-segment lerp through (LOW → MID → HIGH) keyed by payroll. Mirrors the
// MapLibre paint expression so each LAD's particle stream matches its tile.
function paletteAt(payroll: number): [number, number, number] {
  if (payroll <= PAY_MID) {
    const t = clamp01((payroll - PAY_MIN) / (PAY_MID - PAY_MIN));
    return [
      lerp(COLOR_LOW[0], COLOR_MID[0], t),
      lerp(COLOR_LOW[1], COLOR_MID[1], t),
      lerp(COLOR_LOW[2], COLOR_MID[2], t),
    ];
  }
  const t = clamp01((payroll - PAY_MID) / (PAY_MAX - PAY_MID));
  return [
    lerp(COLOR_MID[0], COLOR_HIGH[0], t),
    lerp(COLOR_MID[1], COLOR_HIGH[1], t),
    lerp(COLOR_MID[2], COLOR_HIGH[2], t),
  ];
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
