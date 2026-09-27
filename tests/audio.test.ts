import { describe, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { cueFor, SAMPLES } from "../src/audio/cues";
import { ROOMS } from "../src/game/rooms";
import { createGame } from "../src/game/state";
import type { GameEvent } from "../src/game/types";

const at = { x: 0, y: 0 };
const EVENTS: GameEvent[] = [
  { type: "throw", pos: at, dir: { x: 1, y: 0 }, item: "cushion" },
  { type: "push", pos: at, dir: { x: 1, y: 0 } },
  { type: "grab", pos: at, target: "rail", id: "port" },
  { type: "grab", pos: at, target: "item", id: "cushion" },
  { type: "bump", pos: at, strength: 3, who: "player" },
  { type: "bump", pos: at, strength: 3, who: "item" },
  { type: "bonk", pos: at },
  { type: "place", pos: at, item: "cushion", slot: "sofa" },
  { type: "task", index: 0 },
  { type: "hatch" },
  { type: "room", index: 0 },
  { type: "done" },
];

describe("sound cues", () => {
  test("every game event has a sound with sane levels", () => {
    const g = createGame();
    for (const e of EVENTS) {
      const cue = cueFor(e, g, 3);
      expect(cue).not.toBeNull();
      if (!cue) continue;
      expect(cue.gain).toBeGreaterThan(0);
      expect(cue.gain).toBeLessThanOrEqual(1);
      expect(Math.abs(cue.pan)).toBeLessThanOrEqual(1);
      expect(cue.rate).toBeGreaterThan(0.5);
    }
  });

  test("heavier things are thrown with a lower thump", () => {
    const g = createGame(ROOMS, 2);
    const light = cueFor({ ...EVENTS[0], item: "cushion" } as GameEvent, createGame(), 0);
    const heavy = cueFor({ ...EVENTS[0], item: "flask" } as GameEvent, g, 0);
    expect(heavy?.rate ?? 0).toBeLessThan(light?.rate ?? 0);
  });

  test("jingles duck the music; harder bumps are louder", () => {
    const g = createGame();
    expect(cueFor({ type: "done" }, g, 0)?.duck).toBe(true);
    const soft = cueFor({ type: "bump", pos: at, strength: 1.5, who: "player" }, g, 0);
    const hard = cueFor({ type: "bump", pos: at, strength: 5, who: "player" }, g, 0);
    expect(hard?.gain ?? 0).toBeGreaterThan(soft?.gain ?? 0);
  });

  test("every sample ships, and the whole set stays light", () => {
    let total = 0;
    for (const file of Object.values(SAMPLES)) {
      const path = join(import.meta.dir, "..", "public", "audio", file);
      expect(existsSync(path)).toBe(true);
      total += statSync(path).size;
    }
    expect(total).toBeLessThan(3 * 1024 * 1024);
  });
});
