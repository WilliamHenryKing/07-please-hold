import type { Vec } from "./types";

export const v = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const len = (a: Vec) => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

export function norm(a: Vec, fallback: Vec = { x: 1, y: 0 }): Vec {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { ...fallback };
}

/** Closest point to `p` on segment a–b. */
export function closestOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
  return add(a, scale(ab, t));
}

export const distToSegment = (p: Vec, a: Vec, b: Vec) => dist(p, closestOnSegment(p, a, b));
