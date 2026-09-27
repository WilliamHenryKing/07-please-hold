import {
  ITEM_DRAG,
  ITEM_RESTITUTION,
  PLAYER_DRAG,
  PLAYER_RESTITUTION,
  PUSH_IMPULSE,
  THROW_IMPULSE,
  THROW_MAX_SPEED,
} from "./constants";
import { collideSpinner, collideWalls, drift } from "./physics";
import { handPosition, heldItem } from "./state";
import type { Body, GameState, RoomDef, Vec } from "./types";

export interface Preview {
  /** Path of the thrown item, or of the attendant when pushing off. */
  main: Vec[];
  /** Path of the attendant's recoil after a free-floating throw. */
  recoil: Vec[];
}

/** Sample a body's future path (walls and the revolving bar only), stopping after `bounces`. */
export function tracePath(
  room: RoomDef,
  body: Body,
  angle0: number,
  opts: { seconds: number; bounces: number; e: number; drag: number; every?: number },
): Vec[] {
  const b: Body = { ...body, pos: { ...body.pos }, vel: { ...body.vel } };
  const dt = 1 / 60;
  const every = opts.every ?? 3;
  const points: Vec[] = [{ ...b.pos }];
  let angle = angle0;
  let bounces = 0;
  const steps = Math.ceil(opts.seconds / dt);
  for (let i = 1; i <= steps; i++) {
    if (room.spinner) angle += room.spinner.speed * dt;
    drift(b, dt, opts.drag);
    const hit = collideWalls(b, room, opts.e) ?? collideSpinner(b, room, angle, opts.e);
    if (hit) bounces++;
    if (i % every === 0 || hit) points.push({ ...b.pos });
    if (bounces > opts.bounces) break;
  }
  return points;
}

/** What the primary action would do, drawn as dotted guides. Pure and cheap. */
export function preview(state: GameState): Preview {
  const p = state.player;
  const empty: Preview = { main: [], recoil: [] };
  if (state.phase !== "playing") return empty;
  const item = heldItem(state);
  if (item) {
    const dv = Math.min(THROW_IMPULSE / item.mass, THROW_MAX_SPEED);
    const thrown: Body = {
      ...item,
      pos: handPosition(p, item),
      vel: { x: p.vel.x + p.aim.x * dv, y: p.vel.y + p.aim.y * dv },
    };
    const main = tracePath(state.room, thrown, state.spinnerAngle, {
      seconds: 2.2,
      bounces: 1,
      e: ITEM_RESTITUTION,
      drag: ITEM_DRAG,
    });
    if (p.rail) return { main, recoil: [] };
    const k = (item.mass * dv) / p.mass;
    const self: Body = { ...p, vel: { x: p.vel.x - p.aim.x * k, y: p.vel.y - p.aim.y * k } };
    const recoil = tracePath(state.room, self, state.spinnerAngle, {
      seconds: 1.2,
      bounces: 0,
      e: PLAYER_RESTITUTION,
      drag: PLAYER_DRAG,
    });
    return { main, recoil };
  }
  if (p.rail) {
    const speed = PUSH_IMPULSE / p.mass;
    const self: Body = { ...p, vel: { x: p.aim.x * speed, y: p.aim.y * speed } };
    const main = tracePath(state.room, self, state.spinnerAngle, {
      seconds: 2,
      bounces: 0,
      e: PLAYER_RESTITUTION,
      drag: PLAYER_DRAG,
    });
    return { main, recoil: [] };
  }
  return empty;
}
