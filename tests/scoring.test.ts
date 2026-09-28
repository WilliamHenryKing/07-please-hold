import { describe, expect, test } from "bun:test";
import { throwHeld } from "../src/game/actions";
import { ROOMS } from "../src/game/rooms";
import {
  isBetter,
  mergeRecords,
  PARS,
  parseRecords,
  type RoomResult,
  starsFor,
} from "../src/game/scoring";
import { createGame, findItem, loadRoom } from "../src/game/state";
import { step } from "../src/game/step";

const r = (moves: number, time: number, stars: number): RoomResult => ({
  roomId: "arrival",
  moves,
  time,
  stars,
});

describe("room scoring", () => {
  test("every room has a par", () => {
    for (const room of ROOMS) expect(PARS[room.id]).toBeDefined();
  });

  test("stars: par for three, double par for two, otherwise one", () => {
    const par = PARS.arrival;
    if (!par) throw new Error("par");
    expect(starsFor("arrival", par.moves, par.time)).toBe(3);
    expect(starsFor("arrival", par.moves + 1, par.time)).toBe(2);
    expect(starsFor("arrival", par.moves * 2, par.time * 2)).toBe(2);
    expect(starsFor("arrival", par.moves * 2 + 1, 1)).toBe(1);
  });

  test("a finished room is scored from its own start", () => {
    const g = createGame();
    throwHeld(g);
    g.stats.time = 10;
    loadRoom(g, 1);
    expect(g.roomStart).toEqual({ time: 10, moves: 1 });
    g.stats.time = 22;
    g.stats.throws = 3;
    const tray = findItem(g, "tray");
    const plant = findItem(g, "plant");
    if (!tray || !plant) throw new Error("items");
    for (const [item, pos] of [
      [tray, { x: 4.4, y: -2.8 }],
      [plant, { x: 0, y: 1.85 }],
    ] as const) {
      item.handled = true;
      item.pos = { ...pos };
      item.vel = { x: 0, y: 0 };
    }
    step(g);
    expect(g.hatchOpen).toBe(true);
    expect(g.results).toHaveLength(1);
    expect(g.results[0]?.moves).toBe(2);
    expect(g.results[0]?.time).toBeCloseTo(12, 1);
    expect(g.results[0]?.stars).toBe(3);
  });

  test("records keep the best run and survive bad storage", () => {
    expect(isBetter(r(5, 20, 2), r(3, 30, 3))).toBe(false);
    expect(isBetter(r(3, 20, 3), r(4, 10, 3))).toBe(true);
    const merged = mergeRecords({ arrival: r(6, 40, 1) }, [r(3, 20, 3)]);
    expect(merged.arrival?.stars).toBe(3);
    expect(parseRecords(JSON.stringify(merged)).arrival?.moves).toBe(3);
    expect(parseRecords("{nope")).toEqual({});
    expect(parseRecords(JSON.stringify({ arrival: { moves: "x" } }))).toEqual({});
  });
});
