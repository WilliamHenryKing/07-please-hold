import * as THREE from "three";
import type { RoomDef, Vec } from "../game/types";
import { BACK_Z } from "./roomShell";

function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  if (x) {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(40,24,16,0.55)");
    g.addColorStop(0.6, "rgba(40,24,16,0.18)");
    g.addColorStop(1, "rgba(40,24,16,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

const DUST = 90;
const TRAIL = 36;

/**
 * Room air: soft contact shadows cast straight back onto the quilting, a little warm dust
 * drifting in the lamp light, and a faint trail behind anything moving quickly.
 */
export class Atmosphere {
  readonly group = new THREE.Group();
  private blobMat = new THREE.MeshBasicMaterial({
    map: blobTexture(),
    transparent: true,
    depthWrite: false,
  });
  private blobs: THREE.Mesh[] = [];
  private dust: THREE.Points;
  private dustSeeds: { x: number; y: number; z: number; s: number }[] = [];
  private trail = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 6, 4),
    new THREE.MeshBasicMaterial({
      color: 0xfff1dc,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
    TRAIL,
  );
  private trailPts: { p: Vec; life: number; size: number }[] = [];
  private emitClock = 0;
  private m = new THREE.Matrix4();
  private room: RoomDef | null = null;

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(DUST * 3), 3));
    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffe2b0,
        size: 0.05,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.dust.frustumCulled = false;
    this.trail.count = 0;
    this.trail.frustumCulled = false;
    this.group.add(this.dust, this.trail);
  }

  setRoom(room: RoomDef) {
    this.room = room;
    this.dustSeeds = Array.from({ length: DUST }, (_, i) => ({
      x: (((i * 73) % 97) / 97 - 0.5) * room.width,
      y: (((i * 41) % 89) / 89 - 0.5) * room.height,
      z: BACK_Z + 0.4 + ((i * 29) % 13) / 9,
      s: 0.5 + ((i * 17) % 7) / 7,
    }));
    this.trailPts = [];
  }

  /** One soft shadow per body, fading as it drifts away from the wall it faces. */
  private shadows(bodies: { pos: Vec; radius: number }[]) {
    while (this.blobs.length < bodies.length) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.blobMat);
      b.position.z = BACK_Z + 0.23;
      b.renderOrder = 1;
      this.blobs.push(b);
      this.group.add(b);
    }
    this.blobs.forEach((b, i) => {
      const body = bodies[i];
      b.visible = !!body;
      if (!body) return;
      b.position.x = body.pos.x + 0.08;
      b.position.y = body.pos.y - 0.12;
      const s = body.radius * 3.2;
      b.scale.set(s, s, 1);
    });
  }

  update(t: number, dt: number, bodies: { pos: Vec; vel: Vec; radius: number }[], motion: number) {
    this.shadows(bodies);
    const room = this.room;
    if (room) {
      const arr = this.dust.geometry.getAttribute("position") as THREE.BufferAttribute;
      const hw = room.width / 2;
      const hh = room.height / 2;
      this.dustSeeds.forEach((d, i) => {
        const drift = t * 0.05 * d.s * motion;
        const x =
          ((((d.x + drift + Math.sin(t * 0.2 + i) * 0.2 + hw) % room.width) + room.width) %
            room.width) -
          hw;
        const y = ((((d.y + drift * 0.6 + hh) % room.height) + room.height) % room.height) - hh;
        arr.setXYZ(i, x, y, d.z);
      });
      arr.needsUpdate = true;
    }
    // Trail: drop a faint puff behind fast movers, only with full motion.
    this.emitClock += dt;
    if (motion >= 1 && this.emitClock > 0.045) {
      this.emitClock = 0;
      for (const b of bodies) {
        const speed = Math.hypot(b.vel.x, b.vel.y);
        if (speed > 1.2 && this.trailPts.length < TRAIL) {
          this.trailPts.push({ p: { ...b.pos }, life: 0.6, size: b.radius * 0.35 });
        }
      }
    }
    for (const p of this.trailPts) p.life -= dt;
    this.trailPts = this.trailPts.filter((p) => p.life > 0);
    this.trailPts.forEach((p, i) => {
      const s = p.size * (p.life / 0.6);
      this.m.makeScale(s, s, s).setPosition(p.p.x, p.p.y, -0.1);
      this.trail.setMatrixAt(i, this.m);
    });
    this.trail.count = this.trailPts.length;
    this.trail.instanceMatrix.needsUpdate = true;
  }
}
