import { createRoot } from "react-dom/client";
import "./styles.css";
import { cueFor } from "./audio/cues";
import { AudioEngine } from "./audio/engine";
import { aimAlong, aimAt, canGrab, grab, primary, pushOff, restartRoom } from "./game/actions";
import type { InputMode } from "./game/hints";
import { createGame } from "./game/state";
import { advance, drainEvents } from "./game/step";
import { worldFailed, worldReady } from "./loader";
import { GameView } from "./scene/view";
import { App } from "./ui/App";
import { guidePrompt, startGuide, stepGuide } from "./ui/guideProgress";
import { bindInput, isEditingTarget } from "./ui/input";
import { loadRecords, saveResults } from "./ui/records";
import { HudStore, snapshot } from "./ui/store";
import { installVisualTest } from "./visualTest";

const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const coarse = window.matchMedia("(pointer: coarse)").matches;
let calm = reducedQuery.matches;
let state = createGame();
let mode: InputMode = coarse ? "touch" : "pointer";
let ready = false;
let disposed = false;
let failed = false;
let raf = 0;
let carry = 0;
let frozen = false;
let last = performance.now();

const canvas = document.createElement("canvas");
canvas.id = "stage";
canvas.tabIndex = 0;
canvas.setAttribute("role", "application");
canvas.setAttribute(
  "aria-label",
  "Orbital lounge. Aim with the pointer or arrow keys; click, tap or Space to throw or push off; E to grab a rail or item; Q to push off carrying; R to restart the room; M to mute.",
);
document.body.prepend(canvas);
const view = (() => {
  try {
    return new GameView(canvas, state);
  } catch (error) {
    worldFailed();
    throw error;
  }
})();
view.setMotion(calm);
const layout = () => {
  if (disposed || failed) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const short = w <= 720 && h <= 550 && w > h;
  const top = document.querySelector(".hud-top")?.getBoundingClientRect();
  const bottom = document.querySelector(".hud-bottom")?.getBoundingClientRect();
  view.stage.insets = short
    ? { top: 0.025, bottom: 0.025, left: 0.025, right: Math.min(260, w * 0.46) / w }
    : w < 640
      ? { top: top ? (top.bottom + 8) / h : 0.21, bottom: bottom ? (h - bottom.top + 8) / h : 0.19 }
      : { top: 0.1, bottom: 0.1 };
  view.stage.resize();
};
let layoutDirty = true;
const requestLayout = () => {
  layoutDirty = true;
};
window.addEventListener("resize", requestLayout);

const audio = new AudioEngine();
const unlock = () => {
  if (!disposed && !failed) audio.unlock();
};
const onAudioKey = (e: KeyboardEvent) => {
  if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditingTarget(e.target)) unlock();
};
window.addEventListener("pointerdown", unlock, { capture: true });
window.addEventListener("keydown", onAudioKey, { capture: true });
let cueSeed = 0;
let records = loadRecords();
let savedResults = 0;
let guide = (() => {
  try {
    return localStorage.getItem("please-hold:guide") ? null : startGuide(state);
  } catch {
    return startGuide(state);
  }
})();
const opening = view.opening;
const onboarding = () => ({
  opening: opening.phase,
  guide: guide?.step ?? -1,
  guidePrompt: guidePrompt(guide, state, mode),
  reduced: calm,
});
const store = new HudStore(snapshot(state, mode, audio.muted, records, onboarding()));
const setCanvasAccess = () => {
  canvas.inert =
    !ready || disposed || failed || opening.phase !== "done" || state.phase !== "playing";
};
setCanvasAccess();
const publish = () => {
  setCanvasAccess();
  store.publish(snapshot(state, mode, audio.muted, records, onboarding()));
};
const canAct = () =>
  ready &&
  !disposed &&
  !failed &&
  !document.hidden &&
  opening.phase === "done" &&
  state.phase === "playing";
const focusRoom = () => {
  setCanvasAccess();
  if (!canvas.inert) canvas.focus({ preventScroll: true });
};
const skipGuide = () => {
  guide = null;
  try {
    localStorage.setItem("please-hold:guide", "seen");
  } catch {
    /* Optional storage. */
  }
};
const controls = {
  begin: () => {
    if (!ready || disposed || failed || opening.phase !== "title") return;
    unlock();
    input.clear();
    opening.begin(calm);
    requestLayout();
    if (calm) focusRoom();
    publish();
  },
  skipGuide: () => {
    if (!canAct()) return;
    skipGuide();
    publish();
    focusRoom();
  },
  replayGuide: () => {
    if (!canAct()) return;
    guide = startGuide(state, true);
    publish();
    focusRoom();
  },
  primary: () => {
    if (canAct()) primary(state);
  },
  grab: () => {
    if (canAct()) grab(state);
  },
  push: () => {
    if (canAct()) pushOff(state);
  },
  restart: () => {
    if (!canAct()) return;
    input.clear();
    carry = 0;
    audio.reset();
    restartRoom(state);
    view.reset(state);
    savedResults = Math.min(savedResults, state.results.length);
    if (guide) guide = startGuide(state);
    audio.play({ sound: "restart", gain: 0.6, rate: 1, pan: 0 });
    publish();
    focusRoom();
  },
  replay: () => {
    if (!ready || disposed || failed || state.phase !== "done") return;
    input.clear();
    carry = 0;
    state = createGame();
    savedResults = 0;
    cueSeed = 0;
    guide = null;
    audio.reset();
    view.reset(state);
    publish();
    focusRoom();
  },
  toggleMute: () => {
    if (!ready || disposed || failed) return;
    unlock();
    audio.toggleMute();
    audio.play({ sound: "toggle", gain: 0.5, rate: 1, pan: 0 });
    publish();
  },
};
const onTitleKey = (e: KeyboardEvent) => {
  if (
    opening.phase !== "title" ||
    e.key !== "Enter" ||
    e.repeat ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    isEditingTarget(e.target)
  )
    return;
  if ((e.target as HTMLElement | null)?.closest("button,a")) return;
  e.preventDefault();
  controls.begin();
};
window.addEventListener("keydown", onTitleKey);
const input = bindInput(canvas, {
  active: canAct,
  toWorld: (x, y) => view.stage.toWorld(x, y),
  aimAt: (p) => {
    if (canAct()) aimAt(state, p);
  },
  aimAlong: (d) => {
    if (canAct()) aimAlong(state, view.stage.screenToWorldDir(d));
  },
  ...controls,
  setMode: (m) => {
    mode = m;
  },
});
const onVisibility = () => {
  input.clear();
  carry = 0;
  last = performance.now();
  audio.setHidden(document.hidden);
};
document.addEventListener("visibilitychange", onVisibility);
const rootEl = document.getElementById("root");
const root = rootEl ? createRoot(rootEl) : null;
root?.render(<App store={store} controls={controls} reduced={calm} />);
const hudResize = new ResizeObserver(requestLayout);
let hudBlocks: Element[] = [];
const hudMutation = new MutationObserver(() => {
  const next = [...document.querySelectorAll(".hud-top,.hud-bottom")];
  if (next.length === hudBlocks.length && next.every((el, i) => el === hudBlocks[i])) return;
  hudResize.disconnect();
  hudBlocks = next;
  for (const block of next) hudResize.observe(block);
  requestLayout();
});
if (rootEl) hudMutation.observe(rootEl, { childList: true, subtree: true });

const params = new URLSearchParams(window.location.search);
const requestedScale = Number(params.get("timescale") ?? 1);
const timeScale =
  params.has("e2e") && Number.isFinite(requestedScale)
    ? Math.max(0.05, Math.min(2, requestedScale))
    : 1;
const visualTest =
  import.meta.env.DEV || params.has("e2e")
    ? installVisualTest({
        getState: () => state,
        view,
        setFrozen: (on) => {
          frozen = on;
          carry = 0;
          input.clear();
        },
      })
    : null;
const probe = {
  state: () => structuredClone(state),
  canGrab: () => canGrab(state),
  toScreen: (x: number, y: number) => view.stage.toScreen({ x, y }),
};
if (params.has("e2e")) Object.assign(window, { __hold: probe });

function cleanup() {
  canvas.inert = true;
  cancelAnimationFrame(raf);
  input.dispose();
  window.removeEventListener("resize", requestLayout);
  hudResize.disconnect();
  hudMutation.disconnect();
  window.removeEventListener("pointerdown", unlock, { capture: true });
  window.removeEventListener("keydown", onAudioKey, { capture: true });
  window.removeEventListener("keydown", onTitleKey);
  document.removeEventListener("visibilitychange", onVisibility);
  root?.unmount();
  visualTest?.dispose();
  const host = window as unknown as { __hold?: typeof probe };
  if (host.__hold === probe) delete host.__hold;
  audio.dispose();
  view.dispose();
}
function fail() {
  if (failed || disposed) return;
  failed = true;
  ready = false;
  cleanup();
  worldFailed();
}
view.ready.then(() => {
  if (!disposed && !failed) ready = true;
}, fail);
let first = true;
function frame(now: number) {
  if (disposed || failed) return;
  try {
    const dt =
      !ready || frozen || document.hidden
        ? 0
        : Math.min(0.1, Math.max(0, (now - last) / 1000)) * timeScale;
    last = now;
    if (calm !== reducedQuery.matches) {
      calm = reducedQuery.matches;
      view.setMotion(calm);
    }
    if (!ready) {
      raf = requestAnimationFrame(frame);
      return;
    }
    if (layoutDirty) {
      layoutDirty = false;
      layout();
    }
    const previousOpening = opening.phase;
    const previousRoom = state.roomIndex;
    if (canAct()) {
      input.poll();
      carry = advance(state, carry + dt);
    }
    const events = drainEvents(state);
    if (previousRoom !== state.roomIndex) {
      input.clear();
      carry = 0;
      audio.cancelPending();
      view.reset(state);
    }
    view.handle(events, state);
    const nextGuide = stepGuide(guide, state, events);
    if (guide && !nextGuide) skipGuide();
    else guide = nextGuide;
    for (const e of events) {
      if (e.type === "done") {
        input.clear();
        carry = 0;
        audio.finale();
        continue;
      }
      const cue = cueFor(e, state, cueSeed++);
      if (cue) audio.play(cue);
    }
    savedResults = Math.min(savedResults, state.results.length);
    if (state.results.length > savedResults) {
      records = saveResults(records, state.results.slice(savedResults));
      savedResults = state.results.length;
    }
    audio.setRevolving(!!state.room.spinner && state.phase === "playing");
    view.update(state, dt);
    if (previousOpening !== "done" && opening.phase === "done") {
      input.clear();
      carry = 0;
      focusRoom();
    }
    publish();
    if (first) {
      first = false;
      worldReady();
      if (visualTest) visualTest.ready = true;
    }
    raf = requestAnimationFrame(frame);
  } catch {
    fail();
  }
}
layout();
raf = requestAnimationFrame(frame);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    disposed = true;
    cleanup();
    canvas.remove();
  });
