import {
  BUMP_SPEED,
  HATCH_RADIUS,
  ITEM_DRAG,
  ITEM_RESTITUTION,
  PLAYER_DRAG,
  PLAYER_RESTITUTION,
} from "./constants";
import { collideBodies, collideSpinner, collideWalls, drift, type Impact } from "./physics";
import { ROOMS } from "./rooms";
import { roomResult } from "./scoring";
import { handPosition, isLastRoom, loadRoom } from "./state";
import type { GameState, Item } from "./types";
import { dist } from "./vec";

export const FIXED_DT = 1 / 120;

function noteBump(state: GameState, hit: Impact | null, who: "player" | "item") {
  if (!hit || hit.speed < BUMP_SPEED) return;
  if (who === "player") state.stats.bumps++;
  state.events.push({ type: "bump", pos: hit.at, strength: hit.speed, who });
}

function stepPlayer(state: GameState, dt: number) {
  const p = state.player;
  if (p.rail) {
    p.vel = { x: 0, y: 0 };
    return;
  }
  drift(p, dt, PLAYER_DRAG);
  noteBump(state, collideWalls(p, state.room, PLAYER_RESTITUTION), "player");
  noteBump(state, collideSpinner(p, state.room, state.spinnerAngle, PLAYER_RESTITUTION), "player");
}

function stepItem(state: GameState, item: Item, dt: number) {
  const p = state.player;
  if (item.placed) return;
  if (item.held) {
    item.pos = handPosition(p, item);
    item.vel = { ...p.vel };
    return;
  }
  item.ghost = Math.max(0, item.ghost - dt);
  drift(item, dt, ITEM_DRAG);
  noteBump(state, collideWalls(item, state.room, ITEM_RESTITUTION), "item");
  noteBump(state, collideSpinner(item, state.room, state.spinnerAngle, ITEM_RESTITUTION), "item");
  if (item.ghost > 0) return;
  // A returning item can bonk the attendant. Anchored to a rail, the attendant does not budge.
  const anchored = !!p.rail;
  const mass = p.mass;
  if (anchored) p.mass = 1e6;
  const hit = collideBodies(p, item, ITEM_RESTITUTION);
  p.mass = mass;
  if (anchored) p.vel = { x: 0, y: 0 };
  if (hit && hit.speed > 0.6) {
    item.handled = true;
    state.stats.bonks++;
    state.events.push({ type: "bonk", pos: hit.at });
  }
}

function capture(state: GameState) {
  for (const slot of state.room.slots) {
    const item = state.items.find((i) => i.id === slot.item);
    if (!item || item.placed || !item.handled) continue;
    if (dist(item.pos, slot.pos) > slot.radius) continue;
    item.placed = slot.id;
    item.pos = { ...slot.pos };
    item.vel = { x: 0, y: 0 };
    if (item.held) {
      item.held = false;
      state.player.holding = null;
    }
    state.events.push({ type: "place", pos: { ...slot.pos }, item: item.id, slot: slot.id });
  }
}

function checkTasks(state: GameState) {
  state.room.tasks.forEach((task, index) => {
    if (state.done[index]) return;
    const complete =
      task.kind === "reach"
        ? state.player.rail === task.rail
        : state.items.some((i) => i.placed === task.slot);
    if (!complete) return;
    state.done[index] = true;
    state.events.push({ type: "task", index });
  });
  if (state.hatchOpen || !state.done.every(Boolean)) return;
  state.results.push(roomResult(state));
  if (isLastRoom(state) || !state.room.hatch) {
    state.phase = "done";
    state.events.push({ type: "done" });
    return;
  }
  state.hatchOpen = true;
  state.events.push({ type: "hatch" });
}

/** Advance the world by `dt` seconds (call with FIXED_DT for deterministic results). */
export function step(state: GameState, dt: number = FIXED_DT) {
  if (state.phase !== "playing") return;
  state.stats.time += dt;
  if (state.room.spinner) state.spinnerAngle += state.room.spinner.speed * dt;
  stepPlayer(state, dt);
  for (const item of state.items) stepItem(state, item, dt);
  capture(state);
  checkTasks(state);
  const hatch = state.room.hatch;
  if (state.hatchOpen && hatch && dist(state.player.pos, hatch) < HATCH_RADIUS) {
    loadRoom(state, Math.min(state.roomIndex + 1, ROOMS.length - 1));
  }
}

/** Run as many fixed steps as fit in `elapsed`; returns the leftover time to carry over. */
export function advance(state: GameState, elapsed: number, maxSteps = 12): number {
  let left = elapsed;
  let n = 0;
  while (left >= FIXED_DT && n < maxSteps) {
    step(state, FIXED_DT);
    left -= FIXED_DT;
    n++;
  }
  return n >= maxSteps ? 0 : left;
}

export function drainEvents(state: GameState) {
  const events = state.events;
  state.events = [];
  return events;
}
