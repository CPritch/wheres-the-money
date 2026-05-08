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
  hash, cos, sin,
  instancedArray, instanceIndex,
  storage,
  deltaTime, time,
  shapeCircle,
} from 'three/tsl';
import type { Map as MapLibreMap, LngLatLike } from 'maplibre-gl';
import type { FlowBundle } from './types.js';

const NUM_PARTICLES = 5000;
const MAX_LADS = 16;      // padded to power-of-two for alignment
const SPEED = 80;         // pixels/second
const MAX_LIFE = 3.5;     // seconds per particle lifetime
const SPREAD_R = 12;      // pixel spread radius on spawn

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
    this.camera = new THREE.OrthographicCamera(0, this.width, 0, this.height, 0.1, 100);
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
  }

  private buildCompute(): void {
    const N = NUM_PARTICLES;
    const speed = uniform(SPEED);
    const maxLife = uniform(MAX_LIFE);
    const spreadR = uniform(SPREAD_R);
    const { positions, ages, ladStorage, centroidStorage } = this;

    // Init: assign each particle a random age offset and position near its centroid.
    // Use two independent hash calls (different seeds) instead of hash(vec2) to
    // avoid TypeScript's scalar return-type assumption on the hash() overload.
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

    // Update: advance age, move particle, or respawn at centroid.
    this.computeUpdate = Fn(() => {
      const i = instanceIndex;
      const pos = positions.element(i);
      const age = ages.element(i);

      // Stable per-particle direction: mostly upward with ±23° spread
      const hDir = hash(float(i).add(float(0.7)));
      const pertAngle = hDir.sub(0.5).mul(0.8);
      const dx = sin(pertAngle);
      const dy = cos(pertAngle).negate(); // negative = up the screen

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
        pos.x.addAssign(dx.mul(speed).mul(deltaTime));
        pos.y.addAssign(dy.mul(speed).mul(deltaTime));
      });
    })().compute(N);
  }

  private buildMesh(): void {
    const { positions, ages } = this;

    const age = ages.element(instanceIndex);
    const fadeIn = age.div(0.15).clamp(0, 1);
    const fadeOut = age.sub(0.85).div(0.15).clamp(0, 1).oneMinus();
    const opacityNode = fadeIn.mul(fadeOut).mul(shapeCircle());

    const material = new THREE.SpriteNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    material.positionNode = positions.toAttribute();
    material.colorNode = vec3(0.49, 0.51, 1.0); // #7c83ff
    material.opacityNode = opacityNode;
    material.scaleNode = uniform(vec2(8, 8)); // 8×8 px sprite → 4 px radius glow
    material.alphaToCoverage = false;

    const sprite = new THREE.Sprite(material);
    (sprite as any).count = NUM_PARTICLES;
    sprite.frustumCulled = false;
    this.scene.add(sprite);
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

    this.updateCentroids();
    this.renderer.compute(this.computeInit);
    this.ready = true;
  }

  updateCentroids(): void {
    if (!this.map || !this.centroidLngLats.length) return;
    for (let i = 0; i < this.centroidLngLats.length && i < MAX_LADS; i++) {
      const pt = this.map.project(this.centroidLngLats[i] as LngLatLike);
      this.centroidData[i * 2] = pt.x;
      this.centroidData[i * 2 + 1] = pt.y;
    }
    this.centroidAttr.needsUpdate = true;
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
    this.camera.bottom = height;
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
