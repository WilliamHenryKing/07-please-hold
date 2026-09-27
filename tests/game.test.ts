import { describe, expect, test } from "bun:test";
import {
  aimAlong,
  canGrab,
  grab,
  primary,
  primaryAction,
  pushOff,
  restartRoom,
  throwHeld,
} from "../src/game/actions";
import { ITEM_SPECS, PLAYER_MASS, PUSH_IMPULSE, THROW_IMPULSE } from "../src/game/constants";
import { evaluate, formatTime } from "../src/game/evaluation";
import { hintFor } from "../src/game/hints";
import { collideBodies, collideWalls } from "../src/game/physics";
import { preview } from "../src/game/predict";
import { ROOMS, TOTAL_TASKS } from "../src/game/rooms";
import { createGame, findItem, loadRoom } from "../src/game/state";
import { drainEvents, FIXED_DT, step } from "../src/game/step";
import type { Body, GameState } from "../src/game/types";

const run = (state: GameState, seconds: number) => {
  for (let t = 0; t < seconds; t += FIXED_DT) step(state, FIXED_DT);
};
const item = (state: GameState, id: string) => {
  const found = findItem(state, id);
  if (!found) throw new Error(id);
  return found;
};
const hold = (state: GameState, id: string) => {
  const it = item(state, id);
  it.held = true;
  it.handled = true;
  state.player.holding = id;
  return it;
};
const drop = (state: GameState, id: string) => {
  const it = item(state, id);
  it.held = false;
  state.player.holding = null;
  return it;
};

describe("rooms", () => {
  test("three rooms, five tasks, everything inside its walls", () => {
    expect(ROOMS).toHaveLength(3);
    expect(TOTAL_TASKS).toBe(5);
    for (const room of ROOMS) {
      const inside = (p: { x: number; y: number }) =>
        Math.abs(p.x) <= room.width / 2 && Math.abs(p.y) <= room.height / 2;
      expect(inside(room.start.pos)).toBe(true);
      for (const rail of room.rails) expect(inside(rail.a) && inside(rail.b)).toBe(true);
      for (const slot of room.slots) {
        expect(inside(slot.pos)).toBe(true);
        expect(room.items.some((i) => i.id === slot.item)).toBe(true);
      }
    }
  });

  test("the first moment: stranded just beyond the rail, cushion in hand", () => {
    const g = createGame();
    expect(g.player.holding).toBe("cushion");
    expect(g.player.rail).toBeNull();
    expect(canGrab(g)).toBe(false);
    expect(primaryAction(g)).toBe("throw");
  });
});

describe("the movement rule: momentum is shared", () => {
  test("a free throw sends the item one way and the attendant the other", () => {
    const g = createGame();
    aimAlong(g, { x: 1, y: 0 });
    const cushion = item(g, "cushion");
    expect(throwHeld(g)).toBe(true);
    expect(cushion.vel.x).toBeGreaterThan(0);
    expect(g.player.vel.x).toBeLessThan(0);
    const momentum = cushion.vel.x * cushion.mass + g.player.vel.x * g.player.mass;
    expect(momentum).toBeCloseTo(0, 6);
    expect(-g.player.vel.x).toBeCloseTo(THROW_IMPULSE / PLAYER_MASS, 6);
  });

  test("heavier items fly slower but still recoil you", () => {
    const g = createGame(ROOMS, 2);
    g.player.rail = null;
    const flask = hold(g, "flask");
    aimAlong(g, { x: 0, y: 1 });
    throwHeld(g);
    expect(flask.vel.y).toBeCloseTo(THROW_IMPULSE / ITEM_SPECS.flask.mass, 6);
    expect(g.player.vel.y).toBeCloseTo(-THROW_IMPULSE, 6);
  });

  test("throwing from a rail has no recoil", () => {
    const g = createGame(ROOMS, 2);
    hold(g, "flask");
    throwHeld(g);
    expect(g.player.vel).toEqual({ x: 0, y: 0 });
    expect(g.player.rail).toBe("west");
  });

  test("pushing off is slower while carrying something", () => {
    const g = createGame(ROOMS, 2);
    aimAlong(g, { x: 1, y: 0 });
    pushOff(g);
    expect(g.player.vel.x).toBeCloseTo(PUSH_IMPULSE, 6);
    const h = createGame(ROOMS, 2);
    const flask = hold(h, "flask");
    aimAlong(h, { x: 1, y: 0 });
    pushOff(h);
    expect(h.player.vel.x).toBeCloseTo(PUSH_IMPULSE / (1 + flask.mass), 6);
    expect(flask.vel.x).toBeCloseTo(h.player.vel.x, 6);
  });

  test("grabbing a rail stops you dead", () => {
    const g = createGame();
    drop(g, "cushion").pos = { x: 3, y: 3 };
    g.player.pos = { x: -4.5, y: 0 };
    g.player.vel = { x: -2, y: 0.5 };
    expect(grab(g)).toBe(true);
    expect(g.player.rail).toBe("port");
    expect(g.player.vel).toEqual({ x: 0, y: 0 });
  });

  test("catching a drifting item shares its momentum", () => {
    const g = createGame();
    const c = drop(g, "cushion");
    g.player.pos = { x: 0, y: 0 };
    c.pos = { x: 0.9, y: 0 };
    c.vel = { x: -5, y: 0 };
    grab(g);
    expect(g.player.holding).toBe("cushion");
    expect(g.player.vel.x).toBeCloseTo((-5 * c.mass) / (1 + c.mass), 6);
  });
});

describe("physics", () => {
  test("walls reflect with restitution and report impact speed", () => {
    const room = ROOMS[0];
    if (!room) throw new Error("room");
    const b: Body = { pos: { x: 10, y: 0 }, vel: { x: 3, y: 1 }, radius: 0.5, mass: 1 };
    const hit = collideWalls(b, room, 0.5);
    expect(hit?.speed).toBe(3);
    expect(b.pos.x).toBe(room.width / 2 - 0.5);
    expect(b.vel).toEqual({ x: -1.5, y: 1 });
  });

  test("body collisions conserve momentum", () => {
    const a: Body = { pos: { x: 0, y: 0 }, vel: { x: 2, y: 0 }, radius: 0.5, mass: 1 };
    const b: Body = { pos: { x: 0.8, y: 0 }, vel: { x: -1, y: 0 }, radius: 0.5, mass: 0.5 };
    const before = a.vel.x * a.mass + b.vel.x * b.mass;
    collideBodies(a, b, 0.8);
    expect(a.vel.x * a.mass + b.vel.x * b.mass).toBeCloseTo(before, 9);
    expect(b.vel.x).toBeGreaterThan(a.vel.x);
  });

  test("the revolving bar blocks the direct route", () => {
    const g = createGame(ROOMS, 2);
    g.player.rail = null;
    g.player.pos = { x: -2, y: 0 };
    g.player.vel = { x: 3, y: 0 };
    run(g, 1);
    expect(g.player.pos.x).toBeLessThan(0);
    expect(g.player.vel.x).toBeLessThan(0);
  });
});

describe("the first proof: throw, catch the rail, recover the cushion", () => {
  test("throwing right drifts you to the port rail, and the cushion comes back", () => {
    const g = createGame();
    aimAlong(g, { x: 1, y: 0 });
    primary(g);
    let caught = false;
    for (let t = 0; t < 4 && !caught; t += FIXED_DT) {
      step(g);
      if (!g.player.rail && canGrab(g)) caught = grab(g);
    }
    expect(caught).toBe(true);
    expect(g.player.rail).toBe("port");
    step(g);
    expect(g.done[0]).toBe(true);
    const cushion = item(g, "cushion");
    let back = false;
    for (let t = 0; t < 6 && !back; t += FIXED_DT) {
      step(g);
      if (cushion.vel.x < 0 && cushion.pos.x < -2) back = true;
    }
    expect(back).toBe(true);
  });

  test("delivering the cushion opens the hatch, and the hatch leads on", () => {
    const g = createGame();
    g.done[0] = true;
    const c = drop(g, "cushion");
    c.pos = { x: 4.4, y: -2.6 };
    c.vel = { x: 0, y: 0 };
    step(g);
    expect(c.placed).toBe("sofa");
    expect(g.hatchOpen).toBe(true);
    drainEvents(g);
    g.player.pos = { x: 5.5, y: 2.4 };
    step(g);
    expect(g.roomIndex).toBe(1);
    expect(drainEvents(g).some((e) => e.type === "room")).toBe(true);
  });

  test("items must be handled before a delivery counts", () => {
    const g = createGame(ROOMS, 1);
    const tray = item(g, "tray");
    tray.pos = { x: 4.4, y: -2.8 };
    tray.vel = { x: 0, y: 0 };
    step(g);
    expect(tray.placed).toBeNull();
    tray.handled = true;
    step(g);
    expect(tray.placed).toBe("table");
  });

  test("finishing the last room ends the shift", () => {
    const g = createGame(ROOMS, 2);
    const flask = item(g, "flask");
    flask.handled = true;
    flask.pos = { x: 5.5, y: -2.6 };
    step(g);
    expect(g.phase).toBe("done");
    expect(primaryAction(g)).toBe("none");
  });
});

describe("support", () => {
  test("preview draws a throw path and a recoil path", () => {
    const g = createGame();
    const p = preview(g);
    expect(p.main.length).toBeGreaterThan(3);
    expect(p.recoil.length).toBeGreaterThan(3);
    const last = p.recoil.at(-1);
    expect(!!last && last.x < g.player.pos.x).toBe(true);
  });

  test("hints teach the first throw and the stranded restart", () => {
    const g = createGame();
    expect(hintFor(g, "pointer")).toContain("Click");
    expect(hintFor(g, "touch")).toContain("Tap");
    g.stats.throws = 1;
    g.player.pos = { x: 0, y: 0 };
    drop(g, "cushion").pos = { x: 5, y: 3 };
    expect(hintFor(g, "pointer")).toContain("Press R");
  });

  test("restart restores the room and counts it", () => {
    const g = createGame(ROOMS, 1);
    g.player.pos = { x: 0, y: 0 };
    restartRoom(g);
    expect(g.player.rail).toBe("west");
    expect(g.stats.restarts).toBe(1);
    loadRoom(g, 0);
    expect(g.player.holding).toBe("cushion");
  });

  test("the evaluation always praises the furniture work", () => {
    const base = { time: 90, throws: 3, pushes: 4, grabs: 6 };
    const tidy = evaluate({ ...base, bumps: 1, bonks: 0, restarts: 0 });
    expect(tidy.stars).toBe(3);
    expect(tidy.lines.join(" ")).toContain("dynamic approach to furniture");
    expect(evaluate({ ...base, bumps: 20, bonks: 3, restarts: 2 }).stars).toBe(1);
    expect(formatTime(125)).toBe("2:05");
  });
});
