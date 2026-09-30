import * as THREE from "three";
import type { Vec } from "../game/types";

const N = 120;

interface Puff {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
  size: number;
}

/** Soft upholstery puffs for throws, pushes, bumps and deliveries. One instanced mesh. */
export class Effects {
  readonly mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshBasicMaterial({
      color: 0xfff1dc,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    }),
    N,
  );
  private puffs: Puff[] = [];
  private m = new THREE.Matrix4();

  constructor() {
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  burst(at: Vec, dir: Vec | null, count: number, speed: number, size = 0.08) {
    for (let i = 0; i < count && this.puffs.length < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 0.5;
      const vel = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, (Math.random() - 0.5) * 0.4);
      if (dir) vel.x = vel.x * 0.5 + dir.x;
      if (dir) vel.y = vel.y * 0.5 + dir.y;
      const max = 0.35 + Math.random() * 0.35;
      this.puffs.push({
        pos: new THREE.Vector3(at.x, at.y, 0.2),
        vel: vel.multiplyScalar(speed),
        life: max,
        max,
        size,
      });
    }
  }

  update(dt: number) {
    for (const p of this.puffs) p.life -= dt;
    this.puffs = this.puffs.filter((p) => p.life > 0);
    this.puffs.forEach((p, i) => {
      p.pos.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - dt * 3);
      const k = p.life / p.max;
      const s = p.size * (0.4 + (1 - k) * 1.2) * k;
      this.m.makeScale(s, s, s).setPosition(p.pos);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.count = this.puffs.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.puffs.length = 0;
    this.mesh.count = 0;
  }
}
