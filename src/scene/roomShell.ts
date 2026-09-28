import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { RoomDef } from "../game/types";
import { mat, PAL } from "./palette";
import { skyMaterial } from "./planet";
import { sconceModel } from "./props";
import { surfaces } from "./surfaces";

export const BACK_Z = -1.1;
const FRONT_Z = 0.9;
const DEPTH = FRONT_Z - BACK_Z;

export interface Porthole {
  x: number;
  y: number;
  r: number;
}

/** View-only dressing per room: rounded windows onto the planet and soft wall lamps. */
export const DRESSING: Record<string, { windows: Porthole[]; lamps: [number, number][] }> = {
  arrival: {
    windows: [{ x: 0.4, y: 0.5, r: 1.7 }],
    lamps: [
      [-3.6, 2.6],
      [3.2, 2.6],
    ],
  },
  conservatory: {
    windows: [
      { x: -2.6, y: 0.2, r: 1.2 },
      { x: 2.6, y: 0.6, r: 1.3 },
    ],
    lamps: [[-5, 2.8]],
  },
  galley: {
    windows: [
      { x: -4.2, y: 1.8, r: 0.9 },
      { x: 4.2, y: 0.4, r: 1.1 },
    ],
    lamps: [
      [-5.8, -1.8],
      [0, 3.4],
    ],
  },
};

const panelGeo = new RoundedBoxGeometry(1, 1, 0.24, 3, 0.1);
const quiltGeo = new RoundedBoxGeometry(1, 1, 0.42, 4, 0.17);
const buttonGeo = new THREE.SphereGeometry(0.055, 14, 10);
/** Button positions on a panel face (UV), matching the baked tufting in the texture. */
const BUTTONS: [number, number][] = [
  [0.28, 0.28],
  [0.72, 0.28],
  [0.28, 0.72],
  [0.72, 0.72],
  [0.5, 0.5],
];

export interface Shell {
  group: THREE.Group;
  /** Press the padded wall nearest `at` in, as if something soft just hit it. */
  dent: (at: { x: number; y: number }, strength: number) => void;
  update: (dt: number) => void;
}

function instanced(geo: THREE.BufferGeometry, material: THREE.Material, n: number) {
  const mesh = new THREE.InstancedMesh(geo, material, n);
  mesh.receiveShadow = true;
  return mesh;
}

/** The padded back wall, broken around the portholes. */
function backWall(room: RoomDef, windows: Porthole[], group: THREE.Group) {
  const cols = Math.round(room.width / 1.5);
  const rows = Math.round(room.height / 1.35);
  const cw = room.width / cols;
  const ch = room.height / rows;
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = -room.width / 2 + (i + 0.5) * cw;
      const y = -room.height / 2 + (j + 0.5) * ch;
      const blocked = windows.some((w) => Math.hypot(x - w.x, y - w.y) < w.r + 0.45);
      if (!blocked) cells.push({ x, y });
    }
  const lib = surfaces();
  const panels = instanced(quiltGeo, lib.quilt, cells.length);
  panels.castShadow = true;
  const buttons = instanced(buttonGeo, lib.button, cells.length * BUTTONS.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  const q = new THREE.Quaternion();
  const hsl = { h: 0, s: 0, l: 0 };
  // Seeded jitter so every panel differs a little in tone and puff, but the room is stable.
  const rand = (n: number, k: number) => {
    const x = Math.sin(n * 127.1 + k * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  cells.forEach((cell, n) => {
    const w = cw - 0.08;
    const h = ch - 0.08;
    const puff = 0.85 + rand(n, 1) * 0.3;
    m.compose(
      new THREE.Vector3(cell.x, cell.y, BACK_Z - (1 - puff) * 0.21),
      q,
      new THREE.Vector3(w, h, puff),
    );
    panels.setMatrixAt(n, m);
    const accent = (n * 7) % 11 === 0;
    const list = accent ? PAL.panelAccent : PAL.panels;
    c.setHex(list[(n * 5) % list.length] ?? PAL.panels[0]);
    c.getHSL(hsl);
    c.setHSL(
      hsl.h + (rand(n, 2) - 0.5) * 0.02,
      hsl.s * (0.9 + rand(n, 3) * 0.2),
      hsl.l * (0.94 + rand(n, 4) * 0.1),
    );
    panels.setColorAt(n, c);
    const front = BACK_Z + 0.21 * puff - (1 - puff) * 0.21;
    BUTTONS.forEach(([u, v], k) => {
      m.compose(
        new THREE.Vector3(cell.x + (u - 0.5) * w, cell.y + (v - 0.5) * h, front - 0.035),
        q,
        new THREE.Vector3(1, 1, 0.55),
      );
      buttons.setMatrixAt(n * BUTTONS.length + k, m);
    });
  });
  // The back wall sits behind everything; it receives shadows so the key light reads depth.
  group.add(panels, buttons);
  // A dark hull plane behind the wall fills the gaps around portholes.
  const hull = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width + 1, room.height + 1),
    mat(PAL.hull, 1),
  );
  hull.position.z = BACK_Z - 0.14;
  group.add(hull);
}

function portholes(windows: Porthole[], group: THREE.Group) {
  for (const w of windows) {
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(w.r, 48),
      skyMaterial(new THREE.Vector2(w.x * 0.06, w.y * 0.08 - 0.55), w.r * 0.5, 1),
    );
    glass.position.set(w.x, w.y, BACK_Z - 0.05);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(w.r + 0.06, 0.12, 12, 48), surfaces().steel);
    rim.position.set(w.x, w.y, BACK_Z + 0.02);
    const pad = new THREE.Mesh(
      new THREE.TorusGeometry(w.r + 0.3, 0.16, 10, 48),
      surfaces().pad(PAL.panels[1]),
    );
    pad.position.set(w.x, w.y, BACK_Z - 0.02);
    pad.receiveShadow = true;
    group.add(glass, rim, pad);
  }
}

/** Padded floor, ceiling and side walls running toward the camera. They dent when hit. */
function frame(room: RoomDef, group: THREE.Group): Pick<Shell, "dent" | "update"> {
  const hw = room.width / 2;
  const hh = room.height / 2;
  const t = 0.5;
  const segs: { x: number; y: number; w: number; h: number; nx: number; ny: number }[] = [];
  const along = Math.round(room.width / 1.5);
  for (let i = 0; i < along; i++) {
    const x = -hw + ((i + 0.5) * room.width) / along;
    const w = room.width / along - 0.06;
    segs.push(
      { x, y: -hh - t / 2, w, h: t, nx: 0, ny: -1 },
      { x, y: hh + t / 2, w, h: t, nx: 0, ny: 1 },
    );
  }
  const up = Math.round(room.height / 1.5);
  for (let j = 0; j < up; j++) {
    const y = -hh + ((j + 0.5) * room.height) / up;
    const h = room.height / up - 0.06;
    segs.push(
      { x: -hw - t / 2, y, w: t, h, nx: -1, ny: 0 },
      { x: hw + t / 2, y, w: t, h, nx: 1, ny: 0 },
    );
  }
  const pads = instanced(panelGeo, surfaces().pad(PAL.panels[2]), segs.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const squash = segs.map(() => 0);
  const place = (n: number) => {
    const s = segs[n];
    if (!s) return;
    // Compress the pad toward the hull, keeping its outer face in place.
    const d = (squash[n] ?? 0) * t * 0.45;
    const w = s.nx !== 0 ? s.w - d : s.w;
    const h = s.ny !== 0 ? s.h - d : s.h;
    const pos = new THREE.Vector3(
      s.x + (s.nx * d) / 2,
      s.y + (s.ny * d) / 2,
      (BACK_Z + FRONT_Z) / 2,
    );
    pads.setMatrixAt(n, m.compose(pos, q, new THREE.Vector3(w, h, DEPTH / 0.24)));
  };
  segs.forEach((_, n) => {
    place(n);
  });
  group.add(pads);
  // Brass trim where the padding meets the front edge.
  const trimMat = surfaces().brass;
  const outline = [
    [-hw - t, -hh - t, hw + t, -hh - t],
    [-hw - t, hh + t, hw + t, hh + t],
    [-hw - t, -hh - t, -hw - t, hh + t],
    [hw + t, -hh - t, hw + t, hh + t],
  ];
  for (const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] of outline) {
    const l = Math.hypot(x2 - x1, y2 - y1);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, l, 8), trimMat);
    bar.position.set((x1 + x2) / 2, (y1 + y2) / 2, FRONT_Z);
    if (y1 === y2) bar.rotation.z = Math.PI / 2;
    group.add(bar);
  }
  let dirty = false;
  return {
    dent(at, strength) {
      let best = -1;
      let bestD = Number.POSITIVE_INFINITY;
      segs.forEach((s, n) => {
        const d = Math.hypot(s.x - at.x, s.y - at.y);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      });
      if (best >= 0) squash[best] = Math.min(1, (squash[best] ?? 0) + strength);
      dirty = true;
    },
    update(dt) {
      if (!dirty) return;
      dirty = false;
      squash.forEach((v, n) => {
        if (v <= 0) return;
        squash[n] = Math.max(0, v - dt * 3);
        place(n);
        dirty = true;
      });
      pads.instanceMatrix.needsUpdate = true;
    },
  };
}

function lamps(list: [number, number][], group: THREE.Group) {
  for (const [x, y] of list) {
    const sconce = sconceModel(BACK_Z + 0.08);
    sconce.position.set(x, y, 0);
    group.add(sconce);
    // Each glowing lamp is a real light (candela, inverse-square falloff).
    const light = new THREE.PointLight(0xffc98a, 16, 0, 2);
    light.position.set(x, y, BACK_Z + 0.55);
    group.add(light);
  }
}

export function buildShell(room: RoomDef): Shell {
  const group = new THREE.Group();
  const dress = DRESSING[room.id] ?? { windows: [], lamps: [] };
  backWall(room, dress.windows, group);
  portholes(dress.windows, group);
  const pads = frame(room, group);
  lamps(dress.lamps, group);
  return { group, ...pads };
}
