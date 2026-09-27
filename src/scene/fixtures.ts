import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SPINNER_HUB, SPINNER_THICKNESS } from "../game/constants";
import type { RailDef, RoomDef, SlotDef } from "../game/types";
import { mat, PAL } from "./palette";
import { BACK_Z } from "./roomShell";

export interface Fixtures {
  group: THREE.Group;
  rails: Map<string, THREE.Group>;
  rings: Map<string, THREE.Mesh>;
  hatch: THREE.Group | null;
  hatchDoor: THREE.Object3D | null;
  spinner: THREE.Group | null;
  decor: ((t: number, calm: number) => void)[];
}

const RAIL_Z = BACK_Z + 0.42;

function rail(def: RailDef) {
  const g = new THREE.Group();
  const a = new THREE.Vector3(def.a.x, def.a.y, RAIL_Z);
  const b = new THREE.Vector3(def.b.x, def.b.y, RAIL_Z);
  const l = a.distanceTo(b);
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, l, 12),
    mat(PAL.brass, 0.3, 0.85),
  );
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, l * 0.55, 12),
    mat(PAL.grip, 0.7),
  );
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  for (const m of [bar, grip]) {
    m.quaternion.copy(q);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.castShadow = true;
  }
  g.add(bar, grip);
  for (const end of [a, b]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.08, 0.42, 10),
      mat(PAL.brass, 0.3, 0.85),
    );
    post.rotation.x = Math.PI / 2;
    post.position.set(end.x, end.y, BACK_Z + 0.21);
    g.add(post);
  }
  return g;
}

const box = (w: number, h: number, d: number, r = 0.08) => new RoundedBoxGeometry(w, h, d, 3, r);

function add(
  g: THREE.Group,
  geo: THREE.BufferGeometry,
  color: number,
  x: number,
  y: number,
  z: number,
) {
  const m = new THREE.Mesh(geo, mat(color, 0.85));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

/** Furniture that tells you what each destination is for. Positioned relative to the slot. */
function furniture(slot: SlotDef, room: RoomDef) {
  const g = new THREE.Group();
  const floor = -room.height / 2;
  const z = -0.35;
  if (slot.id === "sofa") {
    const base = floor - slot.pos.y;
    add(g, box(2.2, 0.85, 1.1), PAL.sofa, 0, base + 0.43, z);
    add(g, box(2.2, 1.7, 0.4), PAL.sofa, 0, base + 0.85, BACK_Z + 0.35);
    add(g, box(0.35, 1.25, 1.1), PAL.sofa, -1.05, base + 0.62, z);
    add(g, box(0.35, 1.25, 1.1), PAL.sofa, 1.05, base + 0.62, z);
  } else if (slot.id === "table") {
    add(g, box(1.6, 0.14, 1), PAL.table, 0, -0.45, z);
    const leg = slot.pos.y - 0.45 - floor;
    add(g, new THREE.CylinderGeometry(0.1, 0.18, leg, 10), PAL.brass, 0, -0.45 - leg / 2, z);
  } else if (slot.id === "lamp") {
    const top = room.height / 2 - slot.pos.y;
    add(g, new THREE.CylinderGeometry(0.03, 0.03, top - 0.9, 6), PAL.trim, 0, (top + 0.9) / 2, z);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.6, 0.5, 24, 1, true),
      mat(PAL.lampGlow, 0.5, 0, 1.2),
    );
    shade.material.side = THREE.DoubleSide;
    shade.position.set(0, 0.95, z);
    g.add(shade);
    const light = new THREE.PointLight(PAL.lampGlow, 4, 4, 1.5);
    light.position.set(0, 0.6, 0.3);
    g.add(light);
  } else if (slot.id === "guest") {
    add(g, box(1.1, 0.4, 0.9), PAL.sofa, 0.1, floor - slot.pos.y + 0.25, z);
    add(
      g,
      new THREE.CapsuleGeometry(0.34, 0.6, 6, 12),
      PAL.guest,
      0.35,
      floor - slot.pos.y + 1.05,
      z,
    );
    add(g, new THREE.SphereGeometry(0.28, 16, 12), PAL.skin, 0.35, floor - slot.pos.y + 1.75, z);
    const arm = add(g, new THREE.CapsuleGeometry(0.08, 0.5, 4, 8), PAL.guest, -0.05, 0.05, z + 0.2);
    arm.rotation.z = Math.PI / 2.4;
  }
  g.position.set(slot.pos.x, slot.pos.y, 0);
  return g;
}

function hatch(room: RoomDef) {
  const h = room.hatch;
  if (!h) return { group: null, door: null };
  const g = new THREE.Group();
  const r = 0.75;
  const frameMesh = new THREE.Mesh(
    new THREE.TorusGeometry(r, 0.12, 12, 40),
    mat(PAL.trim, 0.35, 0.8),
  );
  const door = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(r - 0.05, r - 0.05, 0.1, 40),
    mat(PAL.panelAccent[0], 0.6),
  );
  disc.rotation.x = Math.PI / 2;
  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.25, 0.04, 8, 24),
    mat(PAL.brass, 0.3, 0.9),
  );
  wheel.position.z = 0.08;
  door.add(disc, wheel);
  door.position.x = -r;
  // Hinged on the wall side so the door swings open toward the camera.
  const hinge = new THREE.Group();
  hinge.position.x = r;
  hinge.add(door);
  const holder = new THREE.Group();
  holder.add(frameMesh, hinge);
  const dark = new THREE.Mesh(new THREE.CircleGeometry(r - 0.05, 32), mat(0x10131c, 1));
  dark.position.z = -0.06;
  holder.add(dark);
  g.add(holder);
  g.position.set(h.x - 0.7, h.y, BACK_Z + 0.2);
  return { group: g, door: hinge };
}

function spinner(room: RoomDef) {
  const s = room.spinner;
  if (!s) return null;
  const g = new THREE.Group();
  add(g, box(s.reach * 2, SPINNER_THICKNESS * 2, 1.5, 0.12), PAL.panelAccent[0], 0, 0, -0.3);
  const hub = add(
    g,
    new THREE.CylinderGeometry(SPINNER_HUB, SPINNER_HUB, 1.7, 24),
    PAL.brass,
    0,
    0,
    -0.3,
  );
  hub.rotation.x = Math.PI / 2;
  for (const x of [-s.reach * 0.55, s.reach * 0.55]) {
    add(g, box(0.5, SPINNER_THICKNESS * 2 + 0.06, 1.52, 0.08), PAL.panels[1], x, 0, -0.3);
  }
  g.position.set(s.centre.x, s.centre.y, 0);
  return g;
}

function noticeTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const x = c.getContext("2d");
  if (x) {
    x.fillStyle = "#f4ead8";
    x.fillRect(0, 0, 512, 256);
    x.strokeStyle = "#8c3b3b";
    x.lineWidth = 14;
    x.strokeRect(12, 12, 488, 232);
    x.fillStyle = "#8c3b3b";
    x.textAlign = "center";
    x.font = "700 64px system-ui, sans-serif";
    x.fillText("PLEASE KEEP", 256, 110);
    x.fillText("THE LOUNGE TIDY", 256, 185);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The biscuit cloud (perfectly intact) and the tidy notice rotating past it. */
function biscuits(group: THREE.Group) {
  const n = 26;
  const mesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.05, 14),
    mat(PAL.toast, 0.9),
    n,
  );
  const seeds = Array.from({ length: n }, (_, i) => ({
    a: (i / n) * Math.PI * 2,
    r: 0.3 + ((i * 37) % 11) / 16,
    y: (((i * 53) % 13) / 13 - 0.5) * 1.1,
    s: 0.4 + ((i * 17) % 7) / 10,
  }));
  const centre = new THREE.Vector3(-2.2, -1.3, -0.55);
  const notice = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.75),
    new THREE.MeshStandardMaterial({
      map: noticeTexture(),
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),
  );
  group.add(mesh, notice);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  return (t: number, calm: number) => {
    seeds.forEach((b, i) => {
      const a = b.a + t * 0.08 * b.s * calm;
      const p = new THREE.Vector3(
        Math.cos(a) * b.r,
        b.y + Math.sin(t * 0.3 * calm + i) * 0.08,
        Math.sin(a) * b.r * 0.4,
      ).add(centre);
      q.setFromEuler(e.set(t * b.s * calm + i, t * 0.7 * b.s * calm, i));
      mesh.setMatrixAt(i, m.compose(p, q, one));
    });
    mesh.instanceMatrix.needsUpdate = true;
    const a = t * 0.12 * calm;
    notice.position.set(
      centre.x + Math.cos(a) * 1.9,
      centre.y + 0.4 + Math.sin(a * 1.3) * 0.3,
      -0.7 + Math.sin(a) * 0.3,
    );
    notice.rotation.set(0, Math.sin(a) * 0.5, a * 0.6);
  };
}

export function buildFixtures(room: RoomDef): Fixtures {
  const group = new THREE.Group();
  const rails = new Map<string, THREE.Group>();
  for (const def of room.rails) {
    const g = rail(def);
    rails.set(def.id, g);
    group.add(g);
  }
  const rings = new Map<string, THREE.Mesh>();
  for (const slot of room.slots) {
    group.add(furniture(slot, room));
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(slot.radius, 0.035, 8, 48),
      new THREE.MeshBasicMaterial({ color: PAL.good, transparent: true, opacity: 0.8 }),
    );
    ring.position.set(slot.pos.x, slot.pos.y, 0.05);
    rings.set(slot.id, ring);
    group.add(ring);
  }
  const h = hatch(room);
  if (h.group) group.add(h.group);
  const spin = spinner(room);
  if (spin) group.add(spin);
  const decor = room.id === "conservatory" ? [biscuits(group)] : [];
  return { group, rails, rings, hatch: h.group, hatchDoor: h.door, spinner: spin, decor };
}
