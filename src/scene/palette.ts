import * as THREE from "three";

/** Warm orbital domesticity: cream quilting, biscuit and teal accents, brass rails. */
export const PAL = {
  space: 0x1d2130,
  hull: 0x2c3140,
  panels: [0xe8d9c4, 0xe3c7a1, 0xd9c2a8, 0xecdcc8],
  panelAccent: [0x8fa9a3, 0xd9a07a, 0x7f8fb3],
  trim: 0xb8bcc2,
  button: 0x6a5a4a,
  brass: 0xd9a441,
  grip: 0x3a4a5a,
  lampGlow: 0xffd9a0,
  uniform: 0x8c3b3b,
  uniformTrim: 0xe8c07a,
  skin: 0xe6b89a,
  cushion: 0xe07a5f,
  pot: 0xb8643e,
  leaf: 0x5f8f5a,
  tray: 0xd8d2c4,
  toast: 0xd9a05b,
  egg: 0xfff1c9,
  flask: 0xf0e6d2,
  tea: 0xb8672e,
  sofa: 0x7f8fb3,
  table: 0x9b7653,
  guest: 0x5d7f95,
  good: 0x9ed39a,
  aim: 0xfff4dc,
  recoil: 0xf2a07b,
} as const;

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Shared standard materials keyed by colour and finish, so rooms reuse GPU programs. */
export function mat(color: number, roughness = 0.8, metalness = 0, emissive = 0) {
  const key = `${color}:${roughness}:${metalness}:${emissive}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    if (emissive > 0) {
      m.emissive = new THREE.Color(color);
      m.emissiveIntensity = emissive;
    }
    cache.set(key, m);
  }
  return m;
}
