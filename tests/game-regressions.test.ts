import { describe, expect, test } from "bun:test";
import {
  aimAlong,
  aimAt,
  grab,
  primary,
  pushOff,
  restartRoom,
  throwHeld,
} from "../src/game/actions";
import { ITEM_DRAG, ITEM_RESTITUTION, PLAYER_DRAG } from "../src/game/constants";
import { hintFor } from "../src/game/hints";
import { collideSpinner, collideWalls, drift } from "../src/game/physics";
import { tracePath } from "../src/game/predict";
import { ROOMS } from "../src/game/rooms";
import { parseRecords, type RoomResult } from "../src/game/scoring";
import { createGame, findItem, handPosition } from "../src/game/state";
import { drainEvents, FIXED_DT, step } from "../src/game/step";
import type { Body } from "../src/game/types";

describe("shared momentum during a returning-item bonk", () => {
  for (const reverseItems of [false, true]) {
    test(`the carried fern shares the impulse (reversed items: ${reverseItems})`, () => {
      const g = createGame(ROOMS, 1);
      const plant = findItem(g, "plant");
      const tray = findItem(g, "tray");
      if (!plant || !tray) throw new Error("items");
      g.player.rail = null;
      g.player.pos = { x: 0, y: 0 };
      g.player.holding = plant.id;
      plant.held = true;
      tray.pos = { x: 0.75, y: 0 };
      tray.vel = { x: -3, y: 0 };
      if (reverseItems) g.items.reverse();
      const incomingMomentum = tray.mass * tray.vel.x * (1 - ITEM_DRAG * FIXED_DT);

      step(g);

      expect(g.stats.bonks).toBe(1);
      expect(g.player.mass).toBe(1);
      expect(g.player.vel.x * (g.player.mass + plant.mass) + tray.vel.x * tray.mass).toBeCloseTo(
        incomingMomentum,
        10,
      );
      expect(plant.vel).toEqual(g.player.vel);
      expect(plant.pos).toEqual(handPosition(g.player, plant));
    });
  }

  test("an anchored carrier stays exactly at the rail when an item hits", () => {
    const g = createGame(ROOMS, 1);
    const tray = findItem(g, "tray");
    if (!tray) throw new Error("tray");
    const anchored = { ...g.player.pos };
    tray.pos = { x: anchored.x + 0.7, y: anchored.y };
    tray.vel = { x: -3, y: 0 };

    step(g);

    expect(g.player.pos).toEqual(anchored);
    expect(g.player.vel).toEqual({ x: 0, y: 0 });
    expect(tray.vel.x).toBeCloseTo(3 * ITEM_RESTITUTION * (1 - ITEM_DRAG * FIXED_DT), 10);
  });
});

describe("prediction uses the real fixed-step physics", () => {
  for (const roomIndex of [0, 2]) {
    test(`the predicted endpoint matches independent 120 Hz motion in room ${roomIndex + 1}`, () => {
      const room = ROOMS[roomIndex];
      if (!room) throw new Error("room");
      const body: Body = {
        pos: { x: roomIndex === 0 ? 4.9 : -2, y: 0.2 },
        vel: { x: 4, y: 0.4 },
        mass: 1,
        radius: 0.3,
      };
      const seconds = 1.5;
      const predicted = tracePath(room, body, room.spinner?.angle ?? 0, {
        seconds,
        bounces: 100,
        e: ITEM_RESTITUTION,
        drag: PLAYER_DRAG,
      });
      const actual: Body = { ...body, pos: { ...body.pos }, vel: { ...body.vel } };
      let angle = room.spinner?.angle ?? 0;
      for (let tick = 0; tick < Math.round(seconds / FIXED_DT); tick++) {
        angle += (room.spinner?.speed ?? 0) * FIXED_DT;
        drift(actual, FIXED_DT, PLAYER_DRAG);
        collideWalls(actual, room, ITEM_RESTITUTION);
        collideSpinner(actual, room, angle, ITEM_RESTITUTION);
      }
      expect(predicted.at(-1)?.x).toBeCloseTo(actual.pos.x, 10);
      expect(predicted.at(-1)?.y).toBeCloseTo(actual.pos.y, 10);
      expect(body.vel).toEqual({ x: 4, y: 0.4 });
    });
  }
});

describe("restart and terminal action ownership", () => {
  test("a same-turn restart discards old cues and teaches the first throw again", () => {
    const g = createGame();
    primary(g);
    g.events.push({ type: "place", pos: { x: 4.4, y: -2.85 }, item: "cushion", slot: "sofa" });

    restartRoom(g);

    expect(drainEvents(g)).toEqual([{ type: "room", index: 0 }]);
    expect(g.stats.throws).toBe(1);
    expect(g.stats.restarts).toBe(1);
    expect(hintFor(g, "pointer")).toContain("throw the cushion");
  });

  test("after the last delivery every input preserves the completed shift", () => {
    const g = createGame(ROOMS, 2);
    const flask = findItem(g, "flask");
    if (!flask) throw new Error("flask");
    flask.handled = true;
    flask.pos = { x: 5.5, y: -2.6 };
    step(g);
    expect(g.phase).toBe("done");
    const completed = structuredClone(g);

    aimAlong(g, { x: 0, y: -1 });
    aimAt(g, { x: 0, y: 0 });
    expect(primary(g)).toBe("none");
    expect(grab(g)).toBe(false);
    expect(pushOff(g)).toBe(false);
    expect(throwHeld(g)).toBe(false);
    restartRoom(g);
    step(g);

    expect(g).toEqual(completed);
    expect(createGame().results).toEqual([]);
    expect(createGame().phase).toBe("playing");
  });
});

describe("stored room scores recover valid entries", () => {
  const valid: RoomResult = { roomId: "arrival", moves: 3, time: 20, stars: 3 };

  test("a null record cannot erase a valid room", () => {
    expect(parseRecords(JSON.stringify({ arrival: valid, conservatory: null }))).toEqual({
      arrival: valid,
    });
  });

  test("only authored rooms and finite, nonnegative score values survive", () => {
    for (const record of [
      { ...valid, moves: -1 },
      { ...valid, moves: 1.5 },
      { ...valid, time: -0.1 },
      { ...valid, stars: 4 },
      { ...valid, stars: 2.5 },
      { ...valid, stars: 0 },
    ]) {
      expect(parseRecords(JSON.stringify({ arrival: record }))).toEqual({});
    }
    expect(parseRecords('{"arrival":{"moves":3,"time":1e999,"stars":3}}')).toEqual({});
    expect(parseRecords(JSON.stringify({ unknown: valid, constructor: valid }))).toEqual({});
    expect(parseRecords(JSON.stringify([valid]))).toEqual({});
    expect(parseRecords(JSON.stringify({ arrival: valid }))).toEqual({ arrival: valid });
  });
});
