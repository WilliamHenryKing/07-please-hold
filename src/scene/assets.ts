import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { type GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

// Sourced texture sets (see assets.manifest.json). Colour maps are sRGB; normal, ARM
// (R = ambient occlusion, G = roughness, B = metalness) and data maps stay linear.

const manager = new THREE.LoadingManager();
const loader = new THREE.TextureLoader(manager);
const cache = new Map<string, THREE.Texture>();
const base = `${import.meta.env.BASE_URL}textures/`;

let resolveReady: () => void = () => {};
/** Resolves once every texture requested so far has loaded (or failed). */
export const assetsReady = new Promise<void>((resolve) => {
  resolveReady = resolve;
});
manager.onLoad = () => resolveReady();
manager.onError = (url) => console.warn(`texture failed: ${url}`);

const lateLoader = new THREE.TextureLoader();

/**
 * Load a texture. Critical maps count toward the arrival veil; `late` maps (not visible at
 * arrival, such as the night-side city lights) start only after the veil has lifted.
 */
export function tex(
  path: string,
  colour: boolean,
  repeat = 1,
  flipY = true,
  late = false,
): THREE.Texture {
  const key = `${path}|${repeat}|${flipY}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const onLoad = (loaded: THREE.Texture) => {
    loaded.flipY = flipY;
    loaded.needsUpdate = true;
  };
  let t: THREE.Texture;
  if (late) {
    t = new THREE.Texture();
    void assetsReady.then(() =>
      lateLoader.load(base + path, (img) => {
        t.image = img.image;
        onLoad(t);
      }),
    );
  } else t = loader.load(base + path, onLoad);
  t.flipY = flipY;
  t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
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

/**
 * The room's image-based light: Poly Haven's "Anniversary Lounge" HDRI, pre-filtered to a
 * PMREM so rough leather gets soft fill and brass gets believable warm reflections.
 */
export function loadEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  new HDRLoader(manager).load(`${base}env/anniversary_lounge_512.hdr`, (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const env = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = env;
    hdr.dispose();
    pmrem.dispose();
  });
}

const gltf = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);

/** Load a meshopt-compressed glTF from public/models/ (counted toward the arrival veil). */
export function loadModel(name: string): Promise<GLTF> {
  return gltf.loadAsync(`${import.meta.env.BASE_URL}models/${name}`);
}
