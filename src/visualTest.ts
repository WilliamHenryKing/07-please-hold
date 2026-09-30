import { findItem, loadRoom } from "./game/state";
import type { GameState } from "./game/types";
import { BOOKMARKS } from "./scene/bookmarks";
import type { GameView } from "./scene/view";

/**
 * Capture hook for visual review (dev builds and ?e2e only): stage a bookmark, freeze time,
 * and wait for the frame to settle before a screenshot.
 */
export interface VisualTest {
  dispose(): void;
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
  let disposed = false;
  const waiters = new Map<number, () => void>();
  const gl = view.stage.renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown";
  const api: VisualTest = {
    dispose() {
      if (disposed) return;
      disposed = true;
      api.ready = false;
      deps.setFrozen(false);
      for (const [id, resolve] of waiters) {
        cancelAnimationFrame(id);
        resolve();
      }
      waiters.clear();
      const host = window as unknown as { __VISUAL_TEST__?: VisualTest };
      if (host.__VISUAL_TEST__ === api) delete host.__VISUAL_TEST__;
    },
    /** The governor's state, and one step down as a slow frame run would take. */
    quality: () => view.stage.pipeline.state,
    degrade: () => !disposed && view.stage.pipeline.step(),
    ready: false,
    bookmarks: BOOKMARKS.map((b) => b.name),
    renderer,
    setBookmark(name) {
      if (disposed) return false;
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
      view.reset(state);
      return true;
    },
    freeze(on = true) {
      if (disposed) return;
      deps.setFrozen(on);
    },
    settle(frames = 8) {
      if (disposed) return Promise.resolve();
      const count = Number.isFinite(frames) ? Math.max(1, Math.floor(frames)) : 8;
      return new Promise((resolve) => {
        let n = 0;
        let id = 0;
        const tick = () => {
          waiters.delete(id);
          if (disposed || ++n >= count) resolve();
          else {
            id = requestAnimationFrame(tick);
            waiters.set(id, resolve);
          }
        };
        id = requestAnimationFrame(tick);
        waiters.set(id, resolve);
      });
    },
  };
  Object.assign(window, { __VISUAL_TEST__: api });
  return api;
}
