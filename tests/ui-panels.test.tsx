import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createGame } from "../src/game/state";
import { advanceCallStage, callStageAt } from "../src/ui/callStage";
import { EndCard } from "../src/ui/EndCard";
import { RoomCard } from "../src/ui/RoomCard";
import { snapshot } from "../src/ui/store";

describe("the call only advances", () => {
  test("normal and reduced timelines use the authored deadlines", () => {
    expect(callStageAt(1499, false)).toBe("holding");
    expect(callStageAt(1500, false)).toBe("connecting");
    expect(callStageAt(3000, false)).toBe("connected");
    expect(callStageAt(600, true)).toBe("connecting");
    expect(callStageAt(1200, true)).toBe("connected");
  });
  test("skipping or changing live motion cannot reconnect backwards", () => {
    expect(advanceCallStage("connected", "connecting")).toBe("connected");
    expect(advanceCallStage("connecting", callStageAt(700, false))).toBe("connecting");
    expect(advanceCallStage("holding", callStageAt(1500, true))).toBe("connected");
  });
});

describe("performance panels", () => {
  test("ending is a named native dialog with Sound inside and readable focus surface", () => {
    const state = createGame();
    state.phase = "done";
    const result = snapshot(state, "touch").result;
    if (!result) throw new Error("Missing result");
    const html = renderToStaticMarkup(
      <EndCard
        result={result}
        reduced
        onReplay={() => {}}
        sound={<button type="button">Sound on</button>}
      />,
    );
    expect(html).toContain("<dialog");
    expect(html).toContain('aria-labelledby="eval-title"');
    expect(html).toContain('tabindex="-1"');
    expect(html.indexOf("Sound on")).toBeLessThan(html.indexOf("Skip the hold music"));
    expect(html).not.toContain('<div role="dialog"');
  });
  test("a tied record is a personal best without claiming a new record", () => {
    const result = { roomId: "arrival", moves: 3, time: 20, stars: 3 as const };
    const html = renderToStaticMarkup(
      <RoomCard card={{ name: "Arrival Lounge", result, best: { ...result } }} reduced />,
    );
    expect(html).toContain("personal best");
    expect(html).not.toContain("new best");
    expect(html).toContain("Hatch open");
  });
});
