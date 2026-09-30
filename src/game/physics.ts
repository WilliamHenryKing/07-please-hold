import { SPINNER_HUB, SPINNER_THICKNESS } from "./constants";
import type { Body, RoomDef, Vec } from "./types";
import { closestOnSegment, dist, dot, norm, sub } from "./vec";

/** Normal speed of an impact, reported so callers can count bumps. 0 means no contact. */
export type Impact = { speed: number; at: Vec };

export function drift(body: Body, dt: number, drag: number) {
  body.pos.x += body.vel.x * dt;
  body.pos.y += body.vel.y * dt;
  const k = Math.max(0, 1 - drag * dt);
  body.vel.x *= k;
  body.vel.y *= k;
}

/** Keep a circle inside the room rectangle, reflecting velocity with restitution `e`. */
export function collideWalls(body: Body, room: RoomDef, e: number): Impact | null {
  const hx = room.width / 2 - body.radius;
  const hy = room.height / 2 - body.radius;
  const speed = Math.max(bounceAxis(body, "x", hx, e), bounceAxis(body, "y", hy, e));
  return speed > 0 ? { speed, at: { ...body.pos } } : null;
}

function bounceAxis(body: Body, axis: "x" | "y", half: number, e: number): number {
  const p = body.pos[axis];
  const vel = body.vel[axis];
  if (Math.abs(p) <= half) return 0;
  const side = Math.sign(p);
  body.pos[axis] = side * half;
  if (vel * side <= 0) return 0;
  body.vel[axis] = -vel * e;
  return Math.abs(vel);
}

/** End points of the revolving bar at `angle`. */
export function spinnerEnds(room: RoomDef, angle: number): [Vec, Vec] | null {
  const s = room.spinner;
  if (!s) return null;
  const dx = Math.cos(angle) * s.reach;
  const dy = Math.sin(angle) * s.reach;
  return [
    { x: s.centre.x - dx, y: s.centre.y - dy },
    { x: s.centre.x + dx, y: s.centre.y + dy },
  ];
}

/** Bounce a circle off the revolving bar, including the bar's own surface velocity. */
export function collideSpinner(body: Body, room: RoomDef, angle: number, e: number): Impact | null {
  const s = room.spinner;
  const ends = spinnerEnds(room, angle);
  if (!s || !ends) return null;
  const onBar = closestOnSegment(body.pos, ends[0], ends[1]);
  const hubDist = dist(body.pos, s.centre);
  const useHub = hubDist - SPINNER_HUB < dist(body.pos, onBar) - SPINNER_THICKNESS;
  const q = useHub ? s.centre : onBar;
  const clearance = (useHub ? SPINNER_HUB : SPINNER_THICKNESS) + body.radius;
  const d = dist(body.pos, q);
  if (d >= clearance) return null;
  const n = norm(sub(body.pos, q), { x: 0, y: 1 });
  body.pos.x = q.x + n.x * clearance;
  body.pos.y = q.y + n.y * clearance;
  // Surface velocity of the bar at the contact point: omega × r.
  const r = sub(onBar, s.centre);
  const surf = useHub ? { x: 0, y: 0 } : { x: -s.speed * r.y, y: s.speed * r.x };
  const rel = sub(body.vel, surf);
  const vn = dot(rel, n);
  if (vn >= 0) return null;
  body.vel.x -= (1 + e) * vn * n.x;
  body.vel.y -= (1 + e) * vn * n.y;
  return { speed: -vn, at: { ...body.pos } };
}

/** Elastic-ish collision; a fixed first body absorbs the impulse without moving. */
export function collideBodies(a: Body, b: Body, e: number, fixedA = false): Impact | null {
  const d = dist(a.pos, b.pos);
  const min = a.radius + b.radius;
  if (d >= min) return null;
  const n = norm(sub(b.pos, a.pos), { x: 1, y: 0 });
  const inverseA = fixedA ? 0 : 1 / a.mass;
  const inverseB = 1 / b.mass;
  const inverseTotal = inverseA + inverseB;
  const overlap = min - d;
  a.pos.x -= n.x * overlap * (inverseA / inverseTotal);
  a.pos.y -= n.y * overlap * (inverseA / inverseTotal);
  b.pos.x += n.x * overlap * (inverseB / inverseTotal);
  b.pos.y += n.y * overlap * (inverseB / inverseTotal);
  const vn = dot(sub(b.vel, a.vel), n);
  if (vn >= 0) return null;
  const j = (-(1 + e) * vn) / inverseTotal;
  a.vel.x -= j * inverseA * n.x;
  a.vel.y -= j * inverseA * n.y;
  b.vel.x += j * inverseB * n.x;
  b.vel.y += j * inverseB * n.y;
  return { speed: -vn, at: { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 } };
}
