import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { type GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { SceneResources } from "./resources";

export const aborted = () => new DOMException("Scene disposed", "AbortError");
let building: SceneAssets | null = null;

/** Scope synchronous mesh/material builders; async loaders capture their owner explicitly. */
export function withSceneAssets<T>(assets: SceneAssets, build: () => T): T {
  const previous = building;
  building = assets;
  try {
    assets.assertAlive();
    return build();
  } finally {
    building = previous;
  }
}

export function assetsForBuild(): SceneAssets {
  if (!building) throw new Error("Scene builder has no asset owner");
  return building;
}

/** One view's critical jobs, deferred maps and resources, including late results after abort. */
export class SceneAssets {
  readonly resources = new SceneResources();
  private lifetime = new AbortController();
  private textures = new Map<string, THREE.Texture>();
  private geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  private jobs: Promise<unknown>[] = [];
  private deferred: (() => void)[] = [];
  private startedDeferred = false;
  private loader = new THREE.TextureLoader();
  get signal() {
    return this.lifetime.signal;
  }

  assertAlive() {
    if (this.signal.aborted) throw aborted();
  }

  wait<T>(promise: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const cancel = () => reject(aborted());
      if (this.signal.aborted) cancel();
      else this.signal.addEventListener("abort", cancel, { once: true });
      promise.then(
        (value) => {
          this.signal.removeEventListener("abort", cancel);
          if (this.signal.aborted) reject(aborted());
          else resolve(value);
        },
        (error: unknown) => {
          this.signal.removeEventListener("abort", cancel);
          reject(error);
        },
      );
    });
  }

  private track<T>(promise: Promise<T>, critical = true) {
    const job = this.wait(promise);
    // A file may fail before the model finishes; readiness reports the same failure.
    void job.catch((error: unknown) => {
      if (!critical && !this.signal.aborted) console.warn("Optional scene map unavailable", error);
    });
    if (critical) this.jobs.push(job);
    return job;
  }

  async ready() {
    let count = 0;
    while (count < this.jobs.length) {
      const batch = this.jobs.slice(count);
      count = this.jobs.length;
      await this.wait(Promise.all(batch));
    }
    this.assertAlive();
  }

  /** Share CPU-authored shell templates inside this view, never across GPU lifetimes. */
  geometry(template: THREE.BufferGeometry) {
    let geometry = this.geometries.get(template);
    if (!geometry) {
      geometry = this.resources.retain(template.clone());
      this.geometries.set(template, geometry);
    }
    return geometry;
  }

  tex(path: string, colour: boolean, repeat: number, flipY: boolean, late: boolean) {
    this.assertAlive();
    const key = `${path}|${colour}|${repeat}|${flipY}`;
    const existing = this.textures.get(key);
    if (existing) return existing;
    const placeholder = late ? this.resources.retain(new THREE.Texture()) : null;
    const load = () => {
      let resolve: (texture: THREE.Texture) => void = () => {};
      let reject: (error: unknown) => void = () => {};
      const result = new Promise<THREE.Texture>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const source = this.loader.load(
        `${import.meta.env.BASE_URL}textures/${path}`,
        (loaded) => {
          this.resources.retain(loaded);
          if (this.signal.aborted) {
            reject(aborted());
            return;
          }
          const texture = placeholder ?? loaded;
          if (placeholder) placeholder.image = loaded.image;
          texture.flipY = flipY;
          texture.needsUpdate = true;
          resolve(texture);
        },
        undefined,
        reject,
      );
      this.resources.retain(source);
      this.track(result, !late);
      return source;
    };
    const texture = placeholder ?? load();
    texture.flipY = flipY;
    texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.anisotropy = 8;
    this.textures.set(key, texture);
    if (late) {
      if (this.startedDeferred) load();
      else this.deferred.push(load);
    }
    return texture;
  }

  beginDeferred() {
    if (this.signal.aborted || this.startedDeferred) return;
    this.startedDeferred = true;
    for (const load of this.deferred.splice(0)) load();
  }

  model(name: string): Promise<GLTF> {
    this.assertAlive();
    const url = `${import.meta.env.BASE_URL}models/${name}`;
    const job = (async () => {
      const response = await fetch(url, { signal: this.signal });
      if (!response.ok) throw new Error(`${name}: ${response.status}`);
      const bytes = await response.arrayBuffer();
      this.assertAlive();
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.parseAsync(bytes, url.slice(0, url.lastIndexOf("/") + 1));
      this.resources.tree(gltf.scene);
      this.assertAlive();
      return gltf;
    })();
    return this.track(job);
  }

  environment(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.assertAlive();
    const job = new HDRLoader()
      .loadAsync(`${import.meta.env.BASE_URL}textures/env/anniversary_lounge_512.hdr`)
      .then((hdr) => {
        this.resources.own(hdr);
        this.assertAlive();
        const pmrem = new THREE.PMREMGenerator(renderer);
        try {
          hdr.mapping = THREE.EquirectangularReflectionMapping;
          const target = this.resources.own(pmrem.fromEquirectangular(hdr));
          scene.environment = target.texture;
        } finally {
          this.resources.release(hdr);
          pmrem.dispose();
        }
      });
    return this.track(job);
  }

  dispose() {
    this.lifetime.abort();
    this.deferred.length = 0;
    this.textures.clear();
    this.geometries.clear();
    this.resources.dispose();
  }
}

/** Colour maps are sRGB; normal, ARM and other data maps stay linear. */
export function tex(path: string, colour: boolean, repeat = 1, flipY = true, late = false) {
  return assetsForBuild().tex(path, colour, repeat, flipY, late);
}

export interface PbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  arm: THREE.Texture;
}
export function pbrSet(color: string, normal: string, arm: string, repeat = 1): PbrSet {
  return {
    map: tex(color, true, repeat),
    normalMap: tex(normal, false, repeat),
    arm: tex(arm, false, repeat),
  };
}
export function loadModel(name: string, assets: SceneAssets) {
  return assets.model(name);
}
export function loadEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  assets: SceneAssets,
) {
  return assets.environment(renderer, scene);
}
