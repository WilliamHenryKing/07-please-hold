import { findItem, loadRoom } from "./game/state";
import type { GameState } from "./game/types";
import { BOOKMARKS } from "./scene/bookmarks";
import type { GameView } from "./scene/view";

/**
 * Capture hook for visual review (dev builds and ?e2e only): stage a bookmark, freeze time,
 * and wait for the frame to settle before a screenshot.
 */
export interface VisualTest {
  quality(): Record<string, unknown>;
  degrade(): boolean;
  ready: boolean;
  bookmarks: string[];
  renderer: string;
  setBookmark: (name: string) => boolean;
  freeze: (on?: boolean) => void;
  settle: (frames?: number) => Promise<void>;
}

export function installVisualTest(deps: {
  getState: () => GameState;
  view: GameView;
  setFrozen: (on: boolean) => void;
}) {
  const { view } = deps;
  const gl = view.stage.renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown";
  const api: VisualTest = {
    /** The governor's state, and one step down as a slow frame run would take. */
    quality: () => view.stage.pipeline.state,
    degrade: () => view.stage.pipeline.step(),
    ready: false,
    bookmarks: BOOKMARKS.map((b) => b.name),
    renderer,
    setBookmark(name) {
      const b = BOOKMARKS.find((x) => x.name === name);
      if (!b) return false;
      const state = deps.getState();
      loadRoom(state, b.room);
      const p = state.player;
      p.pos = { ...b.player.pos };
      p.vel = { x: 0, y: 0 };
      p.aim = { ...b.player.aim };
      p.rail = b.player.rail ?? null;
      for (const it of state.items) it.held = false;
      p.holding = null;
      const held = findItem(state, b.player.holding ?? null);
      if (held) {
        held.held = true;
        held.handled = true;
        p.holding = held.id;
      }
      view.stage.override = b.camera;
      return true;
    },
    freeze(on = true) {
      deps.setFrozen(on);
    },
    settle(frames = 8) {
      return new Promise((resolve) => {
        let n = 0;
        const tick = () => (++n >= frames ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      });
    },
  };
  Object.assign(window, { __VISUAL_TEST__: api });
  return api;
}
