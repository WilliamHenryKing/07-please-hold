import { describe, expect, test } from "bun:test";
import { createGame } from "../src/game/state";
import { HudStore, snapshot } from "../src/ui/store";

describe("HUD snapshots preserve meaningful changes", () => {
  test("unchanged frames do not rerender, but live motion publishes", () => {
    const state = createGame();
    const initial = snapshot(state, "pointer");
    const store = new HudStore(initial);
    let notifications = 0;
    const unsubscribe = store.subscribe(() => notifications++);
    store.publish(snapshot(state, "pointer"));
    expect(notifications).toBe(0);
    store.publish(
      snapshot(state, "pointer", false, {}, { opening: "done", guide: -1, reduced: true }),
    );
    expect(notifications).toBe(1);
    expect(store.get().reduced).toBe(true);
    unsubscribe();
    store.publish(initial);
    expect(notifications).toBe(1);
  });
  test("finished stats, room scores and browser bests are not discarded when rating is unchanged", () => {
    const state = createGame();
    state.phase = "done";
    state.results = [{ roomId: "arrival", moves: 3, time: 20, stars: 3 }];
    const initial = snapshot(state, "touch");
    const store = new HudStore(initial);
    const result = initial.result;
    if (!result) throw new Error("Missing result");
    const changed = {
      ...initial,
      result: {
        ...result,
        stats: { ...result.stats, time: 100 },
        rooms: result.rooms.map((room) => ({
          ...room,
          best: { roomId: "arrival", moves: 2, time: 10, stars: 3 as const },
        })),
      },
    };
    store.publish(changed);
    expect(store.get().result?.stats.time).toBe(100);
    expect(store.get().result?.rooms[0]?.best?.moves).toBe(2);
  });
});
