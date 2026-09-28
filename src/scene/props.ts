import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { surfaces } from "./surfaces";

// Modelled props at the fidelity of the upholstery: piping on every soft edge, fasteners where
// metal meets the wall, frosted glass over real bulbs.

const rbox = (w: number, h: number, d: number, r: number, seg = 4) =>
  new RoundedBoxGeometry(w, h, d, seg, r);

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, shadows = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

/** A rounded-rectangle loop in the XY plane, for piping around a cushion's face. */
function roundedRectCurve(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const pts = s.getSpacedPoints(96).map((p) => new THREE.Vector3(p.x, p.y, 0));
  return new THREE.CatmullRomCurve3(pts, true);
}

/** Contrast piping (a leather cord) around a soft panel of size w × h, at depth z. */
export function piping(
  w: number,
  h: number,
  r: number,
  z: number,
  thickness: number,
  material: THREE.Material,
) {
  const tube = mesh(
    new THREE.TubeGeometry(roundedRectCurve(w, h, r), 160, thickness, 8, true),
    material,
  );
  tube.position.z = z;
  return tube;
}

/** A small domed screw head, facing +z. */
function screw(material: THREE.Material, size = 0.028) {
  const head = mesh(
    new THREE.SphereGeometry(size, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    material,
    false,
  );
  head.rotation.x = Math.PI / 2;
  const slot = mesh(
    new THREE.BoxGeometry(size * 1.6, size * 0.25, size * 0.4),
    new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.8 }),
    false,
  );
  slot.position.z = size * 0.9;
  const g = new THREE.Group();
  g.add(head, slot);
  return g;
}

/** Throw cushion: bouclé, with cream leather piping on both faces and a covered button. */
export function cushionModel(color: number) {
  const lib = surfaces();
  const g = new THREE.Group();
  const w = 0.66;
  const h = 0.6;
  g.add(mesh(rbox(w, h, 0.28, 0.12), lib.fabric(color)));
  const pipe = lib.pad(0xefe2cc);
  g.add(
    piping(w - 0.05, h - 0.05, 0.1, 0.1, 0.018, pipe),
    piping(w - 0.05, h - 0.05, 0.1, -0.1, 0.018, pipe),
  );
  for (const z of [0.135, -0.135]) {
    const button = mesh(new THREE.SphereGeometry(0.035, 12, 8), lib.button);
    button.scale.z = 0.5;
    button.position.z = z;
    g.add(button);
  }
  return g;
}

/**
 * Lounge sofa: plinth on brass feet, two piped seat cushions, two plump back cushions and
 * rolled arms. `floor` is the seat base height relative to the group origin.
 */
export function sofaModel(color: number, floor: number, backZ: number, frontZ: number) {
  const lib = surfaces();
  const g = new THREE.Group();
  const fabric = lib.fabric(color);
  const pipe = lib.pad(0xe8d6bc);
  const depth = frontZ - backZ;
  const midZ = (frontZ + backZ) / 2;
  // Plinth and feet.
  const plinth = mesh(rbox(2.2, 0.3, depth, 0.06), fabric);
  plinth.position.set(0, floor + 0.28, midZ);
  g.add(plinth);
  for (const x of [-0.95, 0.95])
    for (const z of [backZ + 0.15, frontZ - 0.15]) {
      const foot = mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.14, 16), lib.brass);
      foot.position.set(x, floor + 0.07, z);
      g.add(foot);
    }
  // Seat cushions with piping on the top face.
  for (const x of [-0.46, 0.46]) {
    const seat = mesh(rbox(0.9, 0.3, depth - 0.3, 0.1), fabric);
    seat.position.set(x, floor + 0.57, midZ + 0.1);
    const edge = piping(0.86, depth - 0.34, 0.08, 0, 0.016, pipe);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(x, floor + 0.715, midZ + 0.1);
    g.add(seat, edge);
  }
  // Back: a firm frame and two plump cushions leaning on it.
  const back = mesh(rbox(2.2, 1.0, 0.3, 0.1), fabric);
  back.position.set(0, floor + 0.85, backZ + 0.15);
  g.add(back);
  for (const x of [-0.46, 0.46]) {
    const cushion = mesh(rbox(0.9, 0.7, 0.26, 0.12), fabric);
    cushion.position.set(x, floor + 0.98, backZ + 0.38);
    cushion.rotation.x = -0.12;
    const edge = piping(0.86, 0.66, 0.1, 0.13, 0.015, pipe);
    edge.position.copy(cushion.position);
    edge.rotation.copy(cushion.rotation);
    g.add(cushion, edge);
  }
  // Rolled arms: a scroll along the depth, capped with a piped round face.
  for (const side of [-1, 1]) {
    const x = side * 1.12;
    const arm = mesh(rbox(0.28, 0.52, depth, 0.1), fabric);
    arm.position.set(x, floor + 0.6, midZ);
    const roll = mesh(new THREE.CylinderGeometry(0.17, 0.17, depth, 32), fabric);
    roll.rotation.x = Math.PI / 2;
    roll.position.set(x, floor + 0.9, midZ);
    const cap = mesh(new THREE.TorusGeometry(0.155, 0.016, 8, 40), pipe);
    cap.position.set(x, floor + 0.9, frontZ + 0.005);
    g.add(arm, roll, cap);
  }
  return g;
}

/**
 * Wall sconce: brass backplate with four screws, a short arm, a frosted glass dome over a
 * glowing bulb. The caller adds the real light.
 */
export function sconceModel(z: number) {
  const lib = surfaces();
  const g = new THREE.Group();
  const plate = mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.05, 40), lib.brass);
  plate.rotation.x = Math.PI / 2;
  plate.position.z = z + 0.03;
  const lip = mesh(new THREE.TorusGeometry(0.31, 0.018, 8, 40), lib.brass);
  lip.position.z = z + 0.055;
  g.add(plate, lip);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const s = screw(lib.steel);
    s.position.set(Math.cos(a) * 0.23, Math.sin(a) * 0.23, z + 0.055);
    g.add(s);
  }
  const arm = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.22, 16), lib.brass);
  arm.rotation.x = Math.PI / 2;
  arm.position.z = z + 0.16;
  const collar = mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.06, 24), lib.brass);
  collar.rotation.x = Math.PI / 2;
  collar.position.z = z + 0.28;
  const bulb = mesh(new THREE.SphereGeometry(0.09, 16, 12), lib.bulb, false);
  bulb.position.z = z + 0.36;
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xfff6e8,
    roughness: 0.55,
    transmission: 0.7,
    thickness: 0.05,
    transparent: true,
    opacity: 0.85,
    emissive: 0xffd9a8,
    emissiveIntensity: 0.25,
  });
  const dome = mesh(
    new THREE.SphereGeometry(0.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    glass,
    false,
  );
  dome.rotation.x = Math.PI / 2;
  dome.position.z = z + 0.29;
  g.add(arm, collar, bulb, dome);
  return g;
}

/** Where a rail meets the wall: a brass flange with three screws. */
export function railFlange(z: number) {
  const lib = surfaces();
  const g = new THREE.Group();
  const flange = mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.035, 32), lib.brass);
  flange.rotation.x = Math.PI / 2;
  flange.position.z = z;
  g.add(flange);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    const s = screw(lib.steel, 0.02);
    s.position.set(Math.cos(a) * 0.095, Math.sin(a) * 0.095, z + 0.018);
    g.add(s);
  }
  return g;
}
