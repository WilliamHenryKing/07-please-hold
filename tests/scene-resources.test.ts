import { afterEach, describe, expect, test } from "bun:test";
import * as THREE from "three";
import { type GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { assetsForBuild, SceneAssets, tex, withSceneAssets } from "../src/scene/assets";
import { SceneResources } from "../src/scene/resources";
import { surfaces } from "../src/scene/surfaces";

const originalTextureLoad = THREE.TextureLoader.prototype.load;
const originalHdrLoad = HDRLoader.prototype.loadAsync;
const originalParse = GLTFLoader.prototype.parseAsync;
const originalFetch = globalThis.fetch;
const owners: SceneAssets[] = [];
const assetOwner = () => {
  const owner = new SceneAssets();
  owners.push(owner);
  return owner;
};
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  THREE.TextureLoader.prototype.load = originalTextureLoad;
  HDRLoader.prototype.loadAsync = originalHdrLoad;
  GLTFLoader.prototype.parseAsync = originalParse;
  globalThis.fetch = originalFetch;
});

function pendingTextures() {
  const requests: { texture: THREE.Texture; finish(): void; fail(error: unknown): void }[] = [];
  THREE.TextureLoader.prototype.load = (_url, loaded, _progress, error) => {
    const texture = new THREE.Texture<HTMLImageElement>();
    requests.push({ texture, finish: () => loaded?.(texture), fail: (value) => error?.(value) });
    return texture;
  };
  return requests;
}

describe("instance assets and resources", () => {
  test("surface and texture caches belong to their view; retirement preserves shared maps", () => {
    pendingTextures();
    const first = assetOwner();
    const second = assetOwner();
    const a = withSceneAssets(first, surfaces);
    const b = withSceneAssets(second, surfaces);
    expect(withSceneAssets(first, surfaces)).toBe(a);
    expect(a.quilt).not.toBe(b.quilt);
    expect(a.quilt.map).not.toBe(b.quilt.map);
    const unique = withSceneAssets(first, () => a.pad(0xffffff));
    const piece = new THREE.Mesh(new THREE.BoxGeometry(), unique);
    let material = 0;
    let shared = 0;
    let map = 0;
    unique.addEventListener("dispose", () => material++);
    a.quilt.addEventListener("dispose", () => shared++);
    unique.normalMap?.addEventListener("dispose", () => map++);
    first.resources.retire(piece);
    first.resources.retire(piece);
    expect([material, shared, map]).toEqual([1, 0, 0]);
    first.dispose();
    expect([material, shared, map]).toEqual([1, 1, 1]);
    expect(() => withSceneAssets(second, surfaces)).not.toThrow();
  });

  test("a critical failed texture rejects readiness; a late completion after abort is released", async () => {
    const requests = pendingTextures();
    const failed = assetOwner();
    withSceneAssets(failed, () => tex("critical.webp", true));
    const failure = new Event("error");
    requests[0]?.fail(failure);
    await expect(failed.ready()).rejects.toBe(failure);
    const canceled = assetOwner();
    const texture = withSceneAssets(canceled, () => tex("later.webp", true));
    let released = 0;
    texture.addEventListener("dispose", () => released++);
    const ready = canceled.ready();
    canceled.dispose();
    await expect(ready).rejects.toHaveProperty("name", "AbortError");
    requests[1]?.finish();
    expect(released).toBe(1);
  });

  test("optional night maps start after warmup and their failure preserves the live bundle", async () => {
    const requests = pendingTextures();
    const owner = assetOwner();
    const texture = withSceneAssets(owner, () => tex("night.webp", true, 1, true, true));
    let released = 0;
    texture.addEventListener("dispose", () => released++);
    await owner.ready();
    expect(requests).toHaveLength(0);
    owner.beginDeferred();
    owner.beginDeferred();
    expect(requests).toHaveLength(1);
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      requests[0]?.fail(new Error("optional map unavailable"));
      await Promise.resolve();
      await Promise.resolve();
      await owner.ready();
      expect(owner.signal.aborted).toBe(false);
      expect(released).toBe(0);
    } finally {
      console.warn = originalWarn;
    }
  });

  test("late HDR is disposed before it can build a PMREM on a closed renderer", async () => {
    let finish: (texture: THREE.DataTexture) => void = () => {};
    HDRLoader.prototype.loadAsync = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const owner = assetOwner();
    const scene = new THREE.Scene();
    const ready = owner.environment({} as THREE.WebGLRenderer, scene);
    owner.dispose();
    await expect(ready).rejects.toHaveProperty("name", "AbortError");
    const hdr = new THREE.DataTexture();
    let released = 0;
    hdr.addEventListener("dispose", () => released++);
    finish(hdr);
    await Promise.resolve();
    await Promise.resolve();
    expect(released).toBe(1);
    expect(scene.environment).toBeNull();
  });

  test("a model finishing its parse after teardown releases geometry/material/skeleton", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response(new Uint8Array([1])))) as unknown as typeof fetch;
    let finish: (gltf: GLTF) => void = () => {};
    let parsed: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      parsed = resolve;
    });
    GLTFLoader.prototype.parseAsync = () =>
      new Promise((resolve) => {
        finish = resolve;
        parsed();
      });
    const owner = assetOwner();
    const ready = owner.model("late.glb");
    await started;
    owner.dispose();
    await expect(ready).rejects.toHaveProperty("name", "AbortError");
    const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const bone = new THREE.Bone();
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    const skeletonDisposed = { count: 0 };
    const oldDispose = mesh.skeleton.dispose.bind(mesh.skeleton);
    mesh.skeleton.dispose = () => {
      skeletonDisposed.count++;
      oldDispose();
    };
    let geometry = 0;
    let material = 0;
    mesh.geometry.addEventListener("dispose", () => geometry++);
    mesh.material.addEventListener("dispose", () => material++);
    const scene = new THREE.Group();
    scene.add(mesh);
    finish({
      scene,
      scenes: [scene],
      animations: [],
      cameras: [],
      asset: { version: "2.0" },
      userData: {},
    } as unknown as GLTF);
    await Promise.resolve();
    await Promise.resolve();
    expect([geometry, material, skeletonDisposed.count]).toEqual([1, 1, 1]);
  });

  test("shared CPU shell templates get independent GPU geometries and nested asset scopes restore", () => {
    const first = assetOwner();
    const second = assetOwner();
    const template = new THREE.BoxGeometry();
    const a = first.geometry(template);
    expect(first.geometry(template)).toBe(a);
    expect(second.geometry(template)).not.toBe(a);
    let released = 0;
    let templateReleased = 0;
    a.addEventListener("dispose", () => released++);
    template.addEventListener("dispose", () => templateReleased++);
    withSceneAssets(first, () => {
      expect(assetsForBuild()).toBe(first);
      expect(() =>
        withSceneAssets(second, () => {
          throw new Error("builder failed");
        }),
      ).toThrow();
      expect(assetsForBuild()).toBe(first);
    });
    first.resources.retire(new THREE.Mesh(a, new THREE.MeshStandardMaterial()));
    expect(released).toBe(0);
    first.dispose();
    expect([released, templateReleased]).toEqual([1, 0]);
    template.dispose();
  });

  test("shader uniforms, instanced buffers and late decoded images release exactly once", () => {
    const owner = new SceneResources();
    let closed = 0;
    const texture = new THREE.Texture();
    texture.source.data = { close: () => closed++ };
    const material = new THREE.ShaderMaterial({
      uniforms: { maps: { value: [texture, [texture]] } },
    });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 2);
    let instance = 0;
    let map = 0;
    mesh.addEventListener("dispose", () => instance++);
    texture.addEventListener("dispose", () => map++);
    owner.tree(mesh);
    owner.dispose();
    owner.dispose();
    expect([instance, map, closed]).toEqual([1, 1, 1]);
    const late = texture.clone();
    owner.own(late);
    owner.own(late);
    expect(closed).toBe(1);
  });
});
