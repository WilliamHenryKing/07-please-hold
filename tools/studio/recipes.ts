import type { Recipes } from "./kit/build";
import {
  bend,
  blend,
  box,
  capsule,
  carve,
  chain,
  cone,
  cylinder,
  displace,
  ellipsoid,
  extrude,
  fbm,
  lathe,
  type Mat,
  mat,
  mirrorX,
  mottle,
  move,
  type Node,
  paint,
  polygon2,
  radial,
  rng,
  rotate,
  scale,
  sphere,
  subtract,
  torus,
  union,
  type Vec3,
} from "./kit/sdf";

const pick = <T>(r: () => number, list: T[]) => list[Math.floor(r() * list.length)] as T;
const range = (r: () => number, a: number, b: number) => a + (b - a) * r();
void [bend, blend, box, capsule, carve, chain, cone, cylinder, displace, ellipsoid, extrude, fbm, lathe, mirrorX, mottle, move, paint, polygon2, radial, rotate, scale, sphere, subtract, torus, union];
type Build = (seed: number, index: number) => Node;
void (0 as unknown as Mat | Vec3 | Build);

// PLEASE HOLD — warm orbital domesticity: quilted padded panels, handrails, hatches and the
// floating household props players push, grab and throw.
const SOFT = [0xe8d9c4, 0xc9b8a6, 0x8fa9a3, 0xd9a07a, 0x7f8fb3, 0xe3c7a1];
const panel: Build = (seed) => {
  const r = rng(seed);
  const fabric = mat(pick(r, SOFT), 0.9);
  const w = range(r, 0.6, 1.2);
  const h = range(r, 0.6, 1.2);
  let body = box(w, h, 0.12, 0.05, fabric);
  const cols = 2 + Math.floor(r() * 3);
  const rows = 2 + Math.floor(r() * 3);
  for (let i = 1; i < cols; i++) for (let j = 1; j < rows; j++) body = carve(0.03, body, move(sphere(0.025), [-w / 2 + (i * w) / cols, -h / 2 + (j * h) / rows, 0.07]));
  const button = mat(0x6a5a4a, 0.5);
  const buttons: Node[] = [];
  for (let i = 1; i < cols; i++) for (let j = 1; j < rows; j++) buttons.push(move(sphere(0.012, button), [-w / 2 + (i * w) / cols, -h / 2 + (j * h) / rows, 0.045]));
  return union(displace(body, 0.004, 10, 3, seed), ...buttons, move(box(w + 0.04, h + 0.04, 0.03, 0.01, mat(0xb8bcc2, 0.35, 0.8)), [0, 0, -0.07]));
};
const rail: Build = (seed) => {
  const r = rng(seed);
  const metal = mat(pick(r, [0xb8bcc2, 0xd9a441, 0xe8e0cc]), 0.3, 0.8);
  const grip = mat(pick(r, [0x3a4a5a, 0x5a3a3a, 0x2f4a3a]), 0.7);
  const len = range(r, 0.5, 1.4);
  const bar = capsule([-len / 2, 0.08, 0], [len / 2, 0.08, 0], 0.018, 0.018, metal);
  const grips = union(...[-0.25, 0.25].map((t) => move(rotate(cylinder(0.024, len * 0.25, 0.008, grip), [0, 0, Math.PI / 2]), [t * len, 0.08, 0])));
  const brackets = mirrorX(union(capsule([len / 2 - 0.05, 0, 0], [len / 2 - 0.05, 0.08, 0], 0.014, 0.014, metal), move(cylinder(0.035, 0.012, 0.004, metal), [len / 2 - 0.05, 0, 0])));
  return union(bar, grips, brackets);
};
const hatch: Build = (seed) => {
  const r = rng(seed);
  const shell = mat(pick(r, SOFT), 0.5, 0.2);
  const rad = range(r, 0.4, 0.6);
  const door = rotate(union(cylinder(rad, 0.08, 0.02, shell), move(torus(rad, 0.035, mat(0xb8bcc2, 0.3, 0.9)), [0, 0.02, 0])), [Math.PI / 2, 0, 0]);
  const wheel = move(rotate(union(torus(rad * 0.35, 0.015, mat(0xd9a441, 0.3, 1)), radial(capsule([0, 0, 0], [rad * 0.35, 0, 0], 0.01, 0.01, mat(0xd9a441, 0.3, 1)), 3)), [Math.PI / 2, 0, 0]), [0, 0, 0.07]);
  const port = move(rotate(cylinder(rad * 0.2, 0.02, 0.005, mat(0x9fc6cf, 0.05)), [Math.PI / 2, 0, 0]), [0, rad * 0.55, 0.045]);
  return union(door, wheel, port);
};
const floatProp: Build = (seed, index) => {
  const r = rng(seed);
  const colour = mat(pick(r, SOFT), 0.5);
  switch (index % 6) {
    case 0: // sippy cup with lid and straw
      return union(lathe([[0.04, 0], [0.045, 0.12], [0.047, 0.13]], 0.004, colour), move(cylinder(0.05, 0.02, 0.006, mat(0xe8e0cc, 0.4)), [0, 0.135, 0]), capsule([0.01, 0.14, 0], [0.02, 0.2, 0], 0.005, 0.005, mat(0xd9644c, 0.4)));
    case 1: // potted plant in a pod
      return union(move(sphere(0.08, colour), [0, 0.06, 0]), displace(move(ellipsoid(0.09, 0.1, 0.09, mat(0x5a7a3a, 0.8)), [0, 0.18, 0]), 0.02, 20, 3, seed));
    case 2: // book
      return union(box(0.16, 0.22, 0.035, 0.004, colour), move(box(0.15, 0.21, 0.03, 0.002, mat(0xf2ead8, 0.9)), [0.006, 0, 0]));
    case 3: // cushion
      return displace(ellipsoid(0.22, 0.07, 0.22, colour), 0.01, 8, 3, seed);
    case 4: // desk lamp
      return union(lathe([[0.02, 0.2], [0.09, 0.12]], 0.004, colour), capsule([0, 0, 0], [0, 0.16, 0], 0.008, 0.008, mat(0xb8bcc2, 0.3, 0.9)), move(cylinder(0.07, 0.02, 0.006, mat(0xb8bcc2, 0.3, 0.9)), [0, 0, 0]));
    default: // tissue box
      return union(box(0.2, 0.1, 0.12, 0.012, colour), displace(move(ellipsoid(0.03, 0.05, 0.02, mat(0xffffff, 0.9)), [0, 0.07, 0]), 0.008, 40, 2, seed));
  }
};

export const project = { id: "07-please-hold", name: "PLEASE HOLD", background: 0x2c3140 };
export const families: Recipes["families"] = [
  { id: "padded-panel", count: 24, voxel: 0.006, keep: 0.25, build: panel },
  { id: "handrail", count: 16, voxel: 0.004, keep: 0.3, build: rail },
  { id: "hatch", count: 8, voxel: 0.006, keep: 0.3, hero: true, build: hatch },
  { id: "floating-prop", count: 36, voxel: 0.0025, keep: 0.3, build: floatProp },
];
export const textures: Recipes["textures"] = [
  { id: "quilted-fabric", ramp: [0xb8a896, 0xe8d9c4, 0xf2e6d6], layers: [{ kind: "weave", count: 96, weight: 0.5 }, { kind: "cells", count: 6, weight: 0.8 }], roughness: [0.85, 1], normal: 1.8 },
  { id: "hull-panel", ramp: [0x9aa0a6, 0xb8bcc2, 0xd0d4d8], layers: [{ kind: "fibres", scale: 48, stretch: 16 }, { kind: "fbm", scale: 4, weight: 0.4 }], roughness: [0.3, 0.5], normal: 0.6 },
  { id: "soft-rubber", ramp: [0x2a3440, 0x3a4a5a, 0x4a5a6a], layers: [{ kind: "fbm", scale: 80, octaves: 3 }], roughness: [0.6, 0.8], normal: 0.6 },
  { id: "wool-blanket", ramp: [0x7f8fb3, 0x9fafd3, 0xc0cbe6], layers: [{ kind: "weave", count: 40 }, { kind: "fibres", scale: 64, stretch: 3, weight: 0.6 }], roughness: [0.9, 1], normal: 2 },
];
