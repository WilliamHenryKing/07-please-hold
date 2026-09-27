import {
  GHOST_TIME,
  ITEM_REACH,
  PUSH_IMPULSE,
  RAIL_REACH,
  THROW_IMPULSE,
  THROW_MAX_SPEED,
} from "./constants";
import { handPosition, heldItem, loadRoom } from "./state";
import type { GameState, Item, RailDef, Vec } from "./types";
import { dist, distToSegment, norm, sub } from "./vec";

export type Action = "throw" | "push" | "grab" | "none";

/** Aim toward a world point (pointer) or along a direction (keys). */
export function aimAt(state: GameState, target: Vec) {
  state.player.aim = norm(sub(target, state.player.pos), state.player.aim);
}

export function aimAlong(state: GameState, dir: Vec) {
  state.player.aim = norm(dir, state.player.aim);
}

export function railInReach(state: GameState): RailDef | undefined {
  const p = state.player;
  let best: RailDef | undefined;
  let bestD = RAIL_REACH;
  for (const rail of state.room.rails) {
    const d = distToSegment(p.pos, rail.a, rail.b);
    if (d <= bestD) {
      best = rail;
      bestD = d;
    }
  }
  return best;
}

export function itemInReach(state: GameState): Item | undefined {
  const p = state.player;
  let best: Item | undefined;
  let bestGap = ITEM_REACH;
  for (const item of state.items) {
    if (item.held || item.placed || item.ghost > 0) continue;
    const gap = dist(p.pos, item.pos) - p.radius - item.radius;
    if (gap <= bestGap) {
      best = item;
      bestGap = gap;
    }
  }
  return best;
}

/** What the primary input (click / tap / Space) will do right now. */
export function primaryAction(state: GameState): Action {
  if (state.phase !== "playing") return "none";
  if (state.player.holding) return "throw";
  if (state.player.rail) return "push";
  return canGrab(state) ? "grab" : "none";
}

export function canGrab(state: GameState) {
  if (state.phase !== "playing") return false;
  const p = state.player;
  return (!p.rail && !!railInReach(state)) || (!p.holding && !!itemInReach(state));
}

export const canPushWithItem = (state: GameState) =>
  state.phase === "playing" && !!state.player.rail && !!state.player.holding;

export function primary(state: GameState): Action {
  const action = primaryAction(state);
  if (action === "throw") throwHeld(state);
  else if (action === "push") pushOff(state);
  else if (action === "grab") grab(state);
  return action;
}

/** Throw the held item along the aim. Off a rail you recoil; on a rail the station absorbs it. */
export function throwHeld(state: GameState): boolean {
  const p = state.player;
  const item = heldItem(state);
  if (!item || state.phase !== "playing") return false;
  const dv = Math.min(THROW_IMPULSE / item.mass, THROW_MAX_SPEED);
  item.held = false;
  item.ghost = GHOST_TIME;
  item.pos = handPosition(p, item);
  item.vel = { x: p.vel.x + p.aim.x * dv, y: p.vel.y + p.aim.y * dv };
  if (!p.rail) {
    const recoil = (item.mass * dv) / p.mass;
    p.vel = { x: p.vel.x - p.aim.x * recoil, y: p.vel.y - p.aim.y * recoil };
  }
  p.holding = null;
  state.stats.throws++;
  state.events.push({ type: "throw", pos: { ...item.pos }, dir: { ...p.aim }, item: item.id });
  return true;
}

/** Let go of the rail and shove off along the aim, carrying anything held. */
export function pushOff(state: GameState): boolean {
  const p = state.player;
  if (!p.rail || state.phase !== "playing") return false;
  const carried = heldItem(state);
  const speed = PUSH_IMPULSE / (p.mass + (carried?.mass ?? 0));
  p.vel = { x: p.aim.x * speed, y: p.aim.y * speed };
  p.rail = null;
  if (carried) carried.vel = { ...p.vel };
  state.stats.pushes++;
  state.events.push({ type: "push", pos: { ...p.pos }, dir: { ...p.aim } });
  return true;
}

/** Grab the nearest reachable thing: a rail first (to stop), otherwise a drifting item. */
export function grab(state: GameState): boolean {
  if (state.phase !== "playing") return false;
  const p = state.player;
  const rail = p.rail ? undefined : railInReach(state);
  const item = p.holding ? undefined : itemInReach(state);
  const railFirst =
    rail && (!item || distToSegment(p.pos, rail.a, rail.b) <= dist(p.pos, item.pos));
  if (rail && railFirst) {
    p.rail = rail.id;
    p.vel = { x: 0, y: 0 };
    const carried = heldItem(state);
    if (carried) carried.vel = { x: 0, y: 0 };
    state.stats.grabs++;
    state.events.push({ type: "grab", pos: { ...p.pos }, target: "rail", id: rail.id });
    return true;
  }
  if (item) {
    // Catching shares momentum; anchored to a rail, the station soaks it up.
    if (!p.rail) {
      const total = p.mass + item.mass;
      p.vel = {
        x: (p.vel.x * p.mass + item.vel.x * item.mass) / total,
        y: (p.vel.y * p.mass + item.vel.y * item.mass) / total,
      };
    }
    item.held = true;
    item.handled = true;
    item.vel = { ...p.vel };
    p.holding = item.id;
    p.aim = norm(sub(item.pos, p.pos), p.aim);
    state.stats.grabs++;
    state.events.push({ type: "grab", pos: { ...item.pos }, target: "item", id: item.id });
    return true;
  }
  return false;
}

export function restartRoom(state: GameState) {
  if (state.phase !== "playing") return;
  state.stats.restarts++;
  loadRoom(state, state.roomIndex);
}
