import * as THREE from "three";
import type { Preview } from "../game/predict";
import type { Vec } from "../game/types";
import { PAL } from "./palette";

const MAX = 90;

function dots(color: number, size: number) {
  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(size, 8, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
    MAX,
  );
  mesh.count = 0;
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  return mesh;
}

/** Dotted trajectory guides plus a soft ring on whatever is in reach. */
export class Guides {
  readonly group = new THREE.Group();
  private main = dots(PAL.aim, 0.045);
  private recoil = dots(PAL.recoil, 0.04);
  private ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.58, 40),
    new THREE.MeshBasicMaterial({
      color: PAL.good,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    }),
  );
  private m = new THREE.Matrix4();

  constructor() {
    this.ring.renderOrder = 6;
    this.group.add(this.main, this.recoil, this.ring);
  }

  private fill(mesh: THREE.InstancedMesh, pts: Vec[], t: number, motion: number) {
    // Resample along the polyline at an even spacing, marching slowly to show direction.
    const spacing = 0.28;
    let n = 0;
    let carry = (t * 0.6 * motion) % spacing;
    for (let i = 1; i < pts.length && n < MAX; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!a || !b) continue;
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      let d = spacing - carry;
      while (d <= seg && n < MAX) {
        const k = d / seg;
        const fade = 1 - n / 40;
        const s = Math.max(0.25, fade);
        this.m.makeScale(s, s, s).setPosition(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 0.3);
        mesh.setMatrixAt(n++, this.m);
        d += spacing;
      }
      carry = seg - (d - spacing);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(preview: Preview, reach: { pos: Vec; radius: number } | null, t: number, motion: number) {
    this.fill(this.main, preview.main, t, motion);
    this.fill(this.recoil, preview.recoil, t, motion);
    this.ring.visible = !!reach;
    if (reach) {
      const pulse = 1 + Math.sin(t * 5) * 0.06 * motion;
      const s = (reach.radius / 0.54) * pulse;
      this.ring.position.set(reach.pos.x, reach.pos.y, 0.35);
      this.ring.scale.set(s, s, 1);
    }
  }
}
