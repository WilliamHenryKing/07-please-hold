import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Item, ItemKind } from "../game/types";
import { mat, PAL } from "./palette";
import { cushionModel } from "./props";
import { surfaces } from "./surfaces";

function part(geo: THREE.BufferGeometry, look: number | THREE.Material, rough = 0.8, metal = 0) {
  const m = new THREE.Mesh(geo, typeof look === "number" ? mat(look, rough, metal) : look);
  m.castShadow = true;
  return m;
}

const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, r);

function cushion() {
  const g = new THREE.Group();
  g.add(cushionModel(PAL.cushion));
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
  const knob = part(new THREE.SphereGeometry(0.05, 14, 10), surfaces().brass);
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
  private spinRate = 0;

  constructor(kind: ItemKind) {
    const { g, slosh } = BUILDERS[kind]();
    this.slosh = slosh;
    this.spin.add(g);
    this.root.add(this.spin);
  }

  /** Set it spinning: thrown things tumble, bounces flip and boost the spin. */
  spinUp(rate: number, flip = false) {
    this.spinRate = (flip ? -this.spinRate : this.spinRate) + rate;
    this.spinRate = THREE.MathUtils.clamp(this.spinRate, -9, 9);
  }

  update(item: Item, dt: number, motion: number) {
    this.root.position.set(item.pos.x, item.pos.y, item.placed ? -0.05 : 0);
    // Free items tumble with their spin; held and placed items settle upright.
    const settled = item.held || item.placed;
    if (settled) {
      this.spinRate = 0;
      this.spin.rotation.z = THREE.MathUtils.lerp(this.spin.rotation.z, 0, Math.min(1, dt * 6));
    } else {
      this.spinRate *= Math.max(0, 1 - dt * 0.25);
      this.spin.rotation.z += (this.spinRate - item.vel.x * 0.3) * dt * motion;
    }
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
