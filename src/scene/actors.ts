import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Item, ItemKind, Player } from "../game/types";
import { mat, PAL } from "./palette";

function part(geo: THREE.BufferGeometry, color: number, rough = 0.8, metal = 0) {
  const m = new THREE.Mesh(geo, mat(color, rough, metal));
  m.castShadow = true;
  return m;
}

/** The attendant: bellhop uniform, pillbox hat, one arm that always points where you aim. */
export class AttendantView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private reachArm = new THREE.Group();
  private idleArm = new THREE.Group();
  private legs = new THREE.Group();
  private squash = 0;

  constructor() {
    const torso = part(new THREE.CapsuleGeometry(0.25, 0.32, 6, 16), PAL.uniform);
    const belt = part(new THREE.TorusGeometry(0.25, 0.04, 8, 24), PAL.uniformTrim, 0.4, 0.6);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = -0.06;
    const head = part(new THREE.SphereGeometry(0.2, 20, 14), PAL.skin);
    head.position.y = 0.46;
    const hat = part(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 20), PAL.uniform);
    hat.position.set(0.02, 0.64, 0);
    hat.rotation.z = -0.15;
    const band = part(new THREE.TorusGeometry(0.15, 0.025, 6, 20), PAL.uniformTrim, 0.4, 0.6);
    band.rotation.x = Math.PI / 2;
    band.position.copy(hat.position).y -= 0.04;
    for (const side of [-1, 1]) {
      const eye = part(new THREE.SphereGeometry(0.025, 8, 6), 0x2a2020);
      eye.position.set(side * 0.07, 0.48, 0.18);
      this.body.add(eye);
    }
    this.body.add(torso, belt, head, hat, band);

    const arm = () => {
      const a = part(new THREE.CapsuleGeometry(0.07, 0.34, 4, 10), PAL.uniform);
      a.position.y = 0.22;
      const hand = part(new THREE.SphereGeometry(0.08, 10, 8), PAL.skin);
      hand.position.y = 0.44;
      const g = new THREE.Group();
      g.add(a, hand);
      return g;
    };
    this.reachArm.add(arm());
    this.reachArm.position.set(0.18, 0.12, 0.12);
    this.idleArm.add(arm());
    this.idleArm.position.set(-0.18, 0.12, -0.08);
    for (const side of [-1, 1]) {
      const leg = part(new THREE.CapsuleGeometry(0.09, 0.36, 4, 10), 0x2f3446);
      leg.position.set(side * 0.1, -0.24, 0);
      this.legs.add(leg);
    }
    this.legs.position.y = -0.22;
    this.body.add(this.reachArm, this.idleArm, this.legs);
    this.root.add(this.body);
  }

  /** Visible recoil: a quick squash along the throw direction. */
  kick(strength = 1) {
    this.squash = Math.min(1, this.squash + strength);
  }

  update(p: Player, t: number, dt: number, motion: number) {
    this.root.position.set(p.pos.x, p.pos.y, 0);
    const aimAngle = Math.atan2(p.aim.y, p.aim.x);
    this.reachArm.rotation.z = aimAngle - Math.PI / 2;
    // Facing follows the aim horizontally, so the reaching arm reads clearly.
    const facing = p.aim.x < -0.1 ? -1 : 1;
    this.root.scale.x = THREE.MathUtils.lerp(this.root.scale.x, facing, Math.min(1, dt * 10));
    if (facing < 0) this.reachArm.rotation.z = Math.PI - aimAngle - Math.PI / 2;
    const onRail = !!p.rail;
    this.idleArm.rotation.z = onRail ? 0.4 : 0.9 + Math.sin(t * 1.3) * 0.2 * motion;
    const vx = p.vel.x * facing;
    this.body.rotation.z = THREE.MathUtils.lerp(
      this.body.rotation.z,
      -vx * 0.06 * motion,
      Math.min(1, dt * 4),
    );
    this.legs.rotation.z = THREE.MathUtils.lerp(
      this.legs.rotation.z,
      vx * 0.12 * motion + Math.sin(t * 0.9) * 0.08 * motion,
      Math.min(1, dt * 4),
    );
    this.body.position.y = onRail ? 0 : Math.sin(t * 1.1) * 0.03 * motion;
    this.squash = Math.max(0, this.squash - dt * 4);
    const s = this.squash * 0.22 * motion;
    this.body.scale.set(1 + s, 1 - s, 1 + s * 0.5);
  }
}

const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, r);

function cushion() {
  const g = new THREE.Group();
  const pad = part(rbox(0.66, 0.6, 0.3, 0.13), PAL.cushion, 0.95);
  const tuft = part(new THREE.SphereGeometry(0.04, 8, 6), PAL.button);
  tuft.position.z = 0.15;
  g.add(pad, tuft);
  return { g, slosh: null };
}

function plant() {
  const g = new THREE.Group();
  const pot = part(new THREE.CylinderGeometry(0.26, 0.19, 0.36, 18), PAL.pot, 0.9);
  pot.position.y = -0.2;
  const rim = part(new THREE.TorusGeometry(0.26, 0.04, 8, 20), PAL.pot, 0.9);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.02;
  g.add(pot, rim);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = part(new THREE.SphereGeometry(0.09, 10, 8), PAL.leaf, 0.7);
    leaf.scale.set(0.8, 3.2, 0.5);
    const lean = 0.5 + (i % 3) * 0.2;
    leaf.position.set(Math.cos(a) * 0.14, 0.2, Math.sin(a) * 0.14);
    leaf.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
    g.add(leaf);
  }
  return { g, slosh: null };
}

function tray() {
  const g = new THREE.Group();
  const base = part(rbox(0.78, 0.07, 0.52, 0.03), PAL.tray, 0.5, 0.3);
  const plate = part(new THREE.CylinderGeometry(0.17, 0.15, 0.03, 20), 0xffffff, 0.4);
  plate.position.set(-0.14, 0.05, 0);
  const egg = part(new THREE.SphereGeometry(0.07, 12, 10), PAL.egg, 0.5);
  egg.scale.set(1, 1.3, 1);
  egg.position.set(-0.14, 0.13, 0);
  const toast = part(rbox(0.2, 0.2, 0.05, 0.03), PAL.toast, 0.9);
  toast.position.set(0.2, 0.15, 0);
  toast.rotation.z = 0.2;
  const cup = part(new THREE.CylinderGeometry(0.07, 0.06, 0.12, 14), 0xffffff, 0.4);
  cup.position.set(0.24, 0.1, -0.16);
  g.add(base, plate, egg, toast, cup);
  g.rotation.x = 0.55;
  return { g, slosh: null };
}

/** Covered tea: a stylised, contained liquid whose surface tilts as the flask accelerates. */
function flask() {
  const g = new THREE.Group();
  const shell = part(new THREE.CylinderGeometry(0.17, 0.19, 0.48, 20, 1, true), PAL.flask, 0.5);
  (shell.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  const cap = part(
    new THREE.SphereGeometry(0.18, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    PAL.uniform,
    0.5,
  );
  cap.position.y = 0.24;
  const knob = part(new THREE.SphereGeometry(0.05, 10, 8), PAL.brass, 0.3, 0.8);
  knob.position.y = 0.42;
  const bottom = part(new THREE.CylinderGeometry(0.19, 0.19, 0.04, 20), PAL.flask, 0.5);
  bottom.position.y = -0.24;
  const window = new THREE.Mesh(
    new THREE.CylinderGeometry(0.176, 0.176, 0.26, 20, 1, true, -0.9, 1.8),
    new THREE.MeshStandardMaterial({
      color: 0xcfe6ee,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
    }),
  );
  const slosh = new THREE.Group();
  const tea = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.2, 20),
    mat(PAL.tea, 0.3, 0, 0.25),
  );
  tea.position.y = -0.1;
  slosh.add(tea);
  g.add(shell, cap, knob, bottom, window, slosh);
  return { g, slosh };
}

const BUILDERS: Record<ItemKind, () => { g: THREE.Group; slosh: THREE.Group | null }> = {
  cushion,
  plant,
  tray,
  flask,
};

export class ItemView {
  readonly root = new THREE.Group();
  private spin = new THREE.Group();
  private slosh: THREE.Group | null;
  private lastVel = new THREE.Vector2();
  private tilt = new THREE.Vector2();
  private tiltVel = new THREE.Vector2();

  constructor(kind: ItemKind) {
    const { g, slosh } = BUILDERS[kind]();
    this.slosh = slosh;
    this.spin.add(g);
    this.root.add(this.spin);
  }

  update(item: Item, dt: number, motion: number) {
    this.root.position.set(item.pos.x, item.pos.y, item.placed ? -0.05 : 0);
    // Free items tumble gently with their speed; held and placed items settle upright.
    const settled = item.held || item.placed;
    const target = settled ? 0 : this.spin.rotation.z - item.vel.x * dt * 1.2 * motion;
    this.spin.rotation.z = settled
      ? THREE.MathUtils.lerp(this.spin.rotation.z, 0, Math.min(1, dt * 6))
      : target;
    if (!this.slosh || dt <= 0) return;
    const ax = (item.vel.x - this.lastVel.x) / dt;
    const ay = (item.vel.y - this.lastVel.y) / dt;
    this.lastVel.set(item.vel.x, item.vel.y);
    // Damped spring: the tea leans away from acceleration, then settles.
    this.tiltVel.x += (-this.tilt.x * 40 - ax * 0.02 - this.tiltVel.x * 5) * dt;
    this.tiltVel.y += (-this.tilt.y * 40 - ay * 0.01 - this.tiltVel.y * 5) * dt;
    this.tilt.addScaledVector(this.tiltVel, dt);
    this.tilt.clampScalar(-0.6, 0.6);
    this.slosh.rotation.z = this.tilt.x * motion;
    this.slosh.scale.y = 1 + this.tilt.y * 0.8 * motion;
  }
}
