import { expect, test } from "bun:test";
import {
  aimAlong,
  aimAt,
  grab,
  itemInReach,
  pushOff,
  railInReach,
  throwHeld,
} from "../src/game/actions";
import { ITEM_REACH } from "../src/game/constants";
import { createGame, findItem } from "../src/game/state";
import { FIXED_DT, step } from "../src/game/step";
import type { GameState } from "../src/game/types";
import { dist } from "../src/game/vec";

function waitFor(
  state: GameState,
  label: string,
  predicate: () => boolean,
  seconds: number,
  pollTicks: number,
  reactionTicks: number,
) {
  for (let tick = 0; tick < Math.ceil(seconds / FIXED_DT); tick += pollTicks) {
    if (predicate()) {
      for (let reaction = 0; reaction < reactionTicks; reaction++) step(state);
      return;
    }
    for (let poll = 0; poll < pollTicks; poll++) step(state);
  }
  throw new Error(
    `${label}: ${JSON.stringify({ p: state.player, items: state.items, time: state.stats.time })}`,
  );
}

function runShift(g: GameState, pollTicks: number, reactionTicks: number) {
  const wait = (label: string, predicate: () => boolean) =>
    waitFor(g, label, predicate, 20, pollTicks, reactionTicks);
  const closeItem = (id: string) => {
    const item = itemInReach(g);
    return (
      item?.id === id &&
      dist(g.player.pos, item.pos) <= g.player.radius + item.radius + ITEM_REACH - 0.12
    );
  };
  aimAlong(g, { x: 1, y: 0 });
  expect(throwHeld(g)).toBe(true);
  wait("port rail", () => !!railInReach(g));
  expect(grab(g)).toBe(true);
  step(g);
  expect(g.player.rail).toBe("port");
  wait("returning cushion", () => closeItem("cushion"));
  expect(grab(g)).toBe(true);
  expect(g.player.holding).toBe("cushion");
  aimAt(g, { x: 4.4, y: -2.85 });
  expect(throwHeld(g)).toBe(true);
  wait("sofa delivery", () => g.hatchOpen);
  aimAt(g, { x: 6, y: 2.4 });
  expect(pushOff(g)).toBe(true);
  wait("conservatory arrival", () => g.roomIndex === 1);

  const plant = findItem(g, "plant");
  if (!plant) throw new Error("plant");
  aimAlong(g, { x: 0, y: -1 });
  expect(pushOff(g)).toBe(true);
  wait("fern in reach", () => closeItem("plant"));
  expect(grab(g)).toBe(true);
  for (let tick = 0; tick < pollTicks; tick++) step(g);
  if (!g.player.holding) expect(grab(g)).toBe(true);
  expect(g.player.rail).toBe("west");
  expect(g.player.holding).toBe("plant");
  aimAt(g, { x: 0, y: 1.85 });
  expect(throwHeld(g)).toBe(true);
  wait("fern delivery", () => !!plant.placed);
  aimAlong(g, { x: 0, y: 1 });
  expect(pushOff(g)).toBe(true);
  wait("upper west rail", () => g.player.pos.y >= 0);
  expect(grab(g)).toBe(true);
  expect(g.player.rail).toBe("west");
  wait("returning tray", () => closeItem("tray"));
  expect(grab(g)).toBe(true);
  expect(g.player.holding).toBe("tray");
  aimAt(g, { x: 4.4, y: -2.8 });
  expect(throwHeld(g)).toBe(true);
  wait("tray delivery", () => g.hatchOpen);
  aimAt(g, { x: 6, y: 2.5 });
  expect(pushOff(g)).toBe(true);
  wait("galley arrival", () => g.roomIndex === 2);

  const flask = findItem(g, "flask");
  if (!flask) throw new Error("flask");
  aimAlong(g, { x: 0, y: -1 });
  expect(pushOff(g)).toBe(true);
  wait("flask in reach", () => closeItem("flask"));
  expect(grab(g)).toBe(true);
  for (let tick = 0; tick < pollTicks; tick++) step(g);
  if (!g.player.holding) expect(grab(g)).toBe(true);
  expect(g.player.rail).toBe("west");
  expect(g.player.holding).toBe("flask");
  wait("bar timing", () => g.spinnerAngle >= 2.4);
  aimAt(g, { x: 5.5, y: -2.6 });
  expect(throwHeld(g)).toBe(true);
  wait("guest delivery", () => g.phase === "done");
}

for (const [pollTicks, reactionTicks] of [
  [1, 0],
  [6, 3],
  [12, 6],
] as const) {
  test(`normal inputs finish the shift with ${pollTicks}-tick polling and ${reactionTicks}-tick reaction delay`, () => {
    const g = createGame();
    runShift(g, pollTicks, reactionTicks);
    expect(g.results).toHaveLength(3);
    expect(g.results.map((r) => r.roomId)).toEqual(["arrival", "conservatory", "galley"]);
    expect(g.results.every((r) => r.stars === 3)).toBe(true);
    expect(g.stats.throws).toBe(5);
    expect(g.stats.pushes).toBe(5);
    expect(g.stats.bumps).toBe(0);
    expect(g.stats.bonks).toBe(0);
    expect(g.stats.restarts).toBe(0);
    expect(g.done.every(Boolean)).toBe(true);
  });
}

test("a fresh replay completes the same five tasks with no retained score or momentum", () => {
  const first = createGame();
  runShift(first, 6, 3);
  const finished = structuredClone(first);
  const replay = createGame();
  expect(replay.stats.time).toBe(0);
  expect(replay.stats.throws).toBe(0);
  expect(replay.stats.pushes).toBe(0);
  expect(replay.player.vel).toEqual({ x: 0, y: 0 });
  expect(replay.results).toEqual([]);
  runShift(replay, 6, 3);
  expect(replay.results).toEqual(first.results);
  expect(replay.stats).toEqual(first.stats);
  expect(first).toEqual(finished);
});
