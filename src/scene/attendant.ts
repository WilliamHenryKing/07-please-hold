import * as THREE from "three";
import type { Player } from "../game/types";
import { loadModel, type SceneAssets, tex, withSceneAssets } from "./assets";
import { PAL } from "./palette";
import { surfaces } from "./surfaces";

// Model units → world: the rig is ~2.1 tall; the attendant should stand about 1.1.
const SCALE = 0.52;
const CENTRE_Y = 1.0;

export type Gesture = "throw" | "hit" | "cheer";

/**
 * The attendant: KayKit's CC0 "Rogue" rig repainted as a bellhop (red wool tunic, gold braid,
 * brass buckle) with a pillbox hat and brass buttons. Base pose loops a weightless float;
 * throws, knocks and finished tasks play one-shot gestures; one arm always reaches along the
 * aim so the throw direction reads at a glance.
 */
export class AttendantView {
  readonly root = new THREE.Group();
  readonly ready: Promise<void>;
  private rig = new THREE.Group();
  private inner = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private clips = new Map<string, THREE.AnimationAction>();
  private base: THREE.AnimationAction | null = null;
  private bones = new Map<string, THREE.Bone>();
  private squash = 0;
  private yaw = 0;
  private lean = 0;
  private disposed = false;
  private finished = (event: { action: THREE.AnimationAction }) => {
    if (this.disposed) return;
    if (event.action !== this.base) event.action.fadeOut(0.25);
    this.base?.reset().fadeIn(0.25).play();
  };

  constructor(private assets: SceneAssets) {
    this.inner.scale.setScalar(SCALE);
    this.inner.position.y = -CENTRE_Y * SCALE;
    this.rig.add(this.inner);
    this.root.add(this.rig);
    this.ready = this.load();
  }

  private async load() {
    const gltf = await loadModel("bellhop.glb", this.assets);
    this.assets.assertAlive();
    withSceneAssets(this.assets, () => {
      const lib = surfaces();
      // glTF UVs run top-down, so this texture must not be flipped on upload.
      const atlas = tex("character/bellhop_atlas.webp", true, 1, false);
      atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
      // Wool-like body: soft sheen, rough, woven detail from the uniform cloth's normal map.
      const cloth = lib.cloth(0xffffff);
      const skinMat = new THREE.MeshPhysicalMaterial({
        map: atlas,
        roughness: 0.62,
        sheen: 0.35,
        sheenRoughness: 0.7,
        sheenColor: new THREE.Color(0xffe3d0),
        normalMap: cloth.normalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
      });
      this.assets.resources.material(skinMat);
      this.assets.resources.release(cloth);
      gltf.scene.traverse((o) => {
        if (o instanceof THREE.SkinnedMesh) {
          o.material = skinMat;
          o.castShadow = true;
          o.frustumCulled = false;
        }
        if (o instanceof THREE.Bone) this.bones.set(o.name, o);
      });
      this.model = gltf.scene;
      this.inner.add(gltf.scene);
      this.dress(lib);
      this.mixer = new THREE.AnimationMixer(gltf.scene);
      for (const clip of gltf.animations) this.clips.set(clip.name, this.mixer.clipAction(clip));
      this.base = this.clips.get("Jump_Idle") ?? null;
      this.base?.play();
      this.mixer.addEventListener("finished", this.finished);
      this.assets.resources.tree(this.root);
    });
  }

  /** Pillbox hat on the head bone; brass buttons down the tunic on the chest bone. */
  private dress(lib: ReturnType<typeof surfaces>) {
    const head = this.bones.get("head");
    if (head) {
      const hat = new THREE.Group();
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.44, 0.34, 40),
        lib.cloth(PAL.uniform),
      );
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.05, 10, 40), lib.brass);
      band.rotation.x = Math.PI / 2;
      band.position.y = -0.1;
      const top = new THREE.Mesh(
        new THREE.TorusGeometry(0.4, 0.03, 8, 40),
        lib.cloth(PAL.uniformTrim),
      );
      top.rotation.x = Math.PI / 2;
      top.position.y = 0.17;
      for (const m of [crown, band, top]) m.castShadow = true;
      hat.add(crown, band, top);
      hat.position.set(0.08, 0.92, 0.02);
      hat.rotation.z = -0.18;
      head.add(hat);
    }
    const chest = this.bones.get("chest");
    if (chest) {
      for (const [y, z] of [
        [0.02, 0.44],
        [-0.18, 0.46],
      ]) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), lib.brass);
        b.position.set(0, y ?? 0, z ?? 0);
        b.castShadow = true;
        chest.add(b);
      }
    }
  }

  /** Visible recoil or impact: a quick squash along `dir` (world space). */
  kick(strength = 1, dir: { x: number; y: number } = { x: 0, y: 1 }) {
    if (this.disposed) return;
    this.squash = Math.min(1, this.squash + strength);
    const a = Math.atan2(dir.y, dir.x);
    this.rig.rotation.z = a;
    this.inner.rotation.z = -a;
  }

  /** One-shot body language: throw, knocked, or a small cheer. */
  gesture(kind: Gesture) {
    if (this.disposed) return;
    const name = kind === "throw" ? "Throw" : kind === "hit" ? "Hit_A" : "Cheer";
    const action = this.clips.get(name);
    if (!action || !this.base) return;
    for (const clip of this.clips.values()) if (clip !== this.base) clip.stop();
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
    action.timeScale = kind === "throw" ? 1.6 : 1.2;
    this.base.fadeOut(0.12);
    action.fadeIn(0.12).play();
  }

  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpP = new THREE.Quaternion();

  /** Swing one arm so the hand points along the aim (after the animation has posed it). */
  private reach(aim: { x: number; y: number }, strength: number) {
    const side = aim.x >= 0 ? "l" : "r";
    const upper = this.bones.get(`upperarm${side}`);
    const lower = this.bones.get(`lowerarm${side}`);
    const hand = this.bones.get(`hand${side}`);
    if (!upper || !lower || !hand || !upper.parent) return;
    // Straighten the elbow most of the way, then aim the whole arm.
    lower.quaternion.slerp(new THREE.Quaternion(), 0.8 * strength);
    this.root.updateMatrixWorld(true);
    upper.getWorldPosition(this.tmpA);
    hand.getWorldPosition(this.tmpB);
    const current = this.tmpB.sub(this.tmpA).normalize();
    const desired = new THREE.Vector3(aim.x, aim.y, 0.35).normalize();
    const delta = this.tmpQ.setFromUnitVectors(current, desired);
    const world = upper.getWorldQuaternion(new THREE.Quaternion());
    const target = delta.multiply(world);
    upper.parent.getWorldQuaternion(this.tmpP);
    const local = this.tmpP.invert().multiply(target);
    upper.quaternion.slerp(local, strength);
  }

  update(p: Player, _t: number, dt: number, motion: number) {
    if (this.disposed) return;
    this.root.position.set(p.pos.x, p.pos.y, 0);
    // Face the camera, turned a little toward the aim; lean with drift.
    const yawTarget = THREE.MathUtils.clamp(p.aim.x, -1, 1) * 0.55;
    this.yaw = THREE.MathUtils.lerp(this.yaw, yawTarget, Math.min(1, dt * 6));
    this.lean = THREE.MathUtils.lerp(this.lean, -p.vel.x * 0.07 * motion, Math.min(1, dt * 4));
    if (this.model) {
      this.model.rotation.y = this.yaw;
      this.model.rotation.z = this.lean;
    }
    if (this.mixer) {
      this.mixer.update(motion < 1 ? 0 : dt);
      this.reach(p.aim, p.holding || p.rail ? 1 : 0.7);
    }
    this.squash = Math.max(0, this.squash - dt * 4);
    // Springy: flattens along the hit, bulges across it, with a little overshoot.
    const k = this.squash;
    const s = Math.sin(k * Math.PI * 1.5) * k * 0.3 * motion;
    this.rig.scale.set(1 - s, 1 + s * 0.6, 1 + s * 0.3);
  }

  resetMotion() {
    this.squash = this.yaw = this.lean = 0;
    this.rig.rotation.z = this.inner.rotation.z = 0;
    this.rig.scale.setScalar(1);
    this.mixer?.stopAllAction();
    this.base?.reset().setEffectiveWeight(1).play();
    this.mixer?.setTime(0);
    if (this.model) this.model.rotation.set(0, 0, 0);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer?.removeEventListener("finished", this.finished);
    this.mixer?.stopAllAction();
    if (this.model) this.mixer?.uncacheRoot(this.model);
    this.clips.clear();
    this.bones.clear();
    this.mixer = this.base = null;
    this.model = null;
    this.root.clear();
  }
}
