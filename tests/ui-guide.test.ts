import { describe, expect, test } from "bun:test";
import { grab, throwHeld } from "../src/game/actions";
import { createGame, loadRoom } from "../src/game/state";
import { drainEvents } from "../src/game/step";
import type { GameEvent } from "../src/game/types";
import { guidePrompt, startGuide, stepGuide } from "../src/ui/guideProgress";

const pos = { x: 0, y: 0 };
describe("first lesson records actual successful actions", () => {
  test("proximity, pushing, wrong throws and wrong rails do not advance the lesson", () => {
    const state = createGame();
    const guide = startGuide(state);
    const wrong: GameEvent[] = [
      { type: "push", pos, dir: { x: 1, y: 0 } },
      { type: "throw", item: "tray", pos, dir: { x: 1, y: 0 } },
      { type: "grab", target: "rail", id: "port", pos },
    ];
    expect(stepGuide(guide, state, wrong)).toEqual(guide);
    state.player.rail = "port";
    expect(stepGuide(guide, state, [])).toEqual(guide);
    const thrown = stepGuide(guide, state, [{ type: "throw", item: "cushion", pos, dir: pos }]);
    expect(
      stepGuide(thrown, state, [{ type: "grab", target: "rail", id: "starboard", pos }])?.step,
    ).toBe(1);
  });
  test("throw, port grab and cushion recovery advance only their matching events", () => {
    const state = createGame();
    drainEvents(state);
    let guide = startGuide(state);
    throwHeld(state);
    guide = stepGuide(guide, state, drainEvents(state));
    expect(guide?.step).toBe(1);
    state.player.pos = { x: -4.9, y: 0.3 };
    grab(state);
    guide = stepGuide(guide, state, drainEvents(state));
    expect(guide?.step).toBe(2);
    const cushion = state.items[0];
    if (!cushion) throw new Error("Missing cushion");
    cushion.pos = { x: -4.4, y: 0.3 };
    cushion.ghost = 0;
    grab(state);
    guide = stepGuide(guide, state, drainEvents(state));
    expect(guide?.step).toBe(3);
    state.hatchOpen = true;
    expect(
      stepGuide(guide, state, [{ type: "place", item: "cushion", slot: "sofa", pos }]),
    ).toBeNull();
  });
  test("early delivery does not ask for a cushion that is already placed", () => {
    const state = createGame();
    const guide = startGuide(state);
    const cushion = state.items[0];
    if (!cushion) throw new Error("Missing cushion");
    cushion.placed = "sofa";
    cushion.held = false;
    state.player.holding = null;
    const next = stepGuide(guide, state, [{ type: "place", item: "cushion", slot: "sofa", pos }]);
    expect(next?.kind).toBe("practice");
    expect(guidePrompt(next, state, "pointer")?.body).not.toContain("cushion");
  });
  test("after a missed final throw the lesson explains recovery rather than an unavailable throw", () => {
    const state = createGame();
    const guide = startGuide(state);
    if (!guide) throw new Error("Missing lesson");
    throwHeld(state);
    const prompt = guidePrompt({ ...guide, step: 3 }, state, "touch");
    expect(prompt?.step).toBe(3);
    expect(prompt?.body).toContain("Grab");
    expect(prompt?.title).not.toBe("Return it to the sofa");
  });
});

describe("contextual replay", () => {
  test("a later room uses its pending item and actual destination, not the sofa lesson", () => {
    const state = createGame();
    loadRoom(state, 1);
    let guide = startGuide(state, true);
    const prompt = guidePrompt(guide, state, "pointer");
    expect(prompt?.body).toContain("fern");
    expect(prompt?.body).not.toMatch(/cushion|sofa/);
    state.player.pos = { x: 2, y: 1 };
    grab(state);
    const held = guidePrompt(guide, state, "touch");
    expect(held?.title).toBe("Deliver the breakfast tray");
    expect(held?.body).toContain("table");
    guide = stepGuide(guide, state, [{ type: "place", item: "tray", slot: "table", pos }]);
    expect(guide).toBeNull();
  });
  test("replaying with an open hatch explains travel, not a completed delivery", () => {
    const state = createGame();
    state.hatchOpen = true;
    state.done = [true, true];
    state.player.holding = null;
    const prompt = guidePrompt(startGuide(state, true), state, "touch");
    expect(prompt?.title).toBe("On to the next room");
    expect(prompt?.body).toContain("hatch");
    expect(prompt?.body).not.toContain("cushion");
  });
  test("the final-room lesson names covered tea and the revolving barrier", () => {
    const state = createGame();
    loadRoom(state, 2);
    state.player.pos = { x: -5.1, y: -2.3 };
    grab(state);
    const prompt = guidePrompt(startGuide(state, true), state, "pointer");
    expect(prompt?.body).toContain("guest");
    expect(prompt?.body).toContain("revolving compartment");
    expect(prompt?.body).not.toMatch(/cushion|sofa/);
  });
  test("room transition and completion end the guide without stale instructions", () => {
    const state = createGame();
    const guide = startGuide(state);
    loadRoom(state, 1);
    expect(stepGuide(guide, state, [])).toBeNull();
    expect(guidePrompt(guide, state, "touch")).toBeNull();
    state.phase = "done";
    expect(startGuide(state, true)).toBeNull();
  });
});
