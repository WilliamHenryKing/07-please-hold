import { createRoot } from "react-dom/client";
import "./styles.css";
import { cueFor } from "./audio/cues";
import { AudioEngine } from "./audio/engine";
import { aimAlong, aimAt, canGrab, grab, primary, pushOff, restartRoom } from "./game/actions";
import type { InputMode } from "./game/hints";
import { createGame } from "./game/state";
import { advance, drainEvents } from "./game/step";
import { worldReady } from "./loader";
import { GameView } from "./scene/view";
import { App } from "./ui/App";
import { bindInput } from "./ui/input";
import { loadRecords, saveResults } from "./ui/records";
import { HudStore, snapshot } from "./ui/store";
import { installVisualTest } from "./visualTest";

const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const coarse = window.matchMedia("(pointer: coarse)").matches;

let state = createGame();
let mode: InputMode = coarse ? "touch" : "pointer";

const canvas = document.createElement("canvas");
canvas.id = "stage";
canvas.tabIndex = 0;
canvas.setAttribute("role", "application");
canvas.setAttribute(
  "aria-label",
  "Orbital lounge. Aim with the pointer or arrow keys; click, tap or Space to throw or push off; E to grab a rail or item; Q to push off carrying; R to restart the room; M to mute.",
);
document.body.prepend(canvas);

const view = new GameView(canvas);
const setMotion = () => {
  view.motion = reducedQuery.matches ? 0.2 : 1;
};
setMotion();
reducedQuery.addEventListener("change", setMotion);

const layout = () => {
  const phone = window.innerWidth < 640;
  view.stage.insets = phone ? { top: 0.21, bottom: 0.19 } : { top: 0.1, bottom: 0.1 };
  view.stage.resize();
};
window.addEventListener("resize", layout);

// Sound starts on the first gesture (browsers require it); samples load right after.
const audio = new AudioEngine();
const unlock = () => audio.unlock();
window.addEventListener("pointerdown", unlock, { capture: true });
window.addEventListener("keydown", unlock, { capture: true });
document.addEventListener("visibilitychange", () => audio.setHidden(document.hidden));
let cueSeed = 0;
let records = loadRecords();
let savedResults = 0;

const store = new HudStore(snapshot(state, mode, audio.muted, records));
const controls = {
  primary: () => primary(state),
  grab: () => grab(state),
  push: () => pushOff(state),
  restart: () => {
    if (state.phase !== "playing") return;
    audio.play({ sound: "restart", gain: 0.6, rate: 1, pan: 0 });
    restartRoom(state);
  },
  replay: () => {
    state = createGame();
    savedResults = 0;
    audio.resumeMusic();
    canvas.focus();
  },
  toggleMute: () => {
    audio.unlock();
    audio.toggleMute();
    audio.play({ sound: "toggle", gain: 0.5, rate: 1, pan: 0 });
  },
};

const input = bindInput(canvas, {
  toWorld: (x, y) => view.stage.toWorld(x, y),
  aimAt: (p) => aimAt(state, p),
  aimAlong: (d) => aimAlong(state, view.stage.screenToWorldDir(d)),
  ...controls,
  setMode: (m) => {
    mode = m;
  },
});

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App store={store} controls={controls} reduced={reducedQuery.matches} />);
}

// Slow motion for recording the README capture on slow software renderers (?e2e only).
const params = new URLSearchParams(window.location.search);
const timeScale = params.has("e2e") ? Number(params.get("timescale") ?? 1) || 1 : 1;
let frozen = false;
let last = performance.now();
let carry = 0;
let first = true;
function frame(now: number) {
  const dt = frozen ? 0 : Math.min(0.1, (now - last) / 1000) * timeScale;
  last = now;
  input.poll();
  carry = advance(state, carry + dt);
  const events = drainEvents(state);
  view.handle(events, state);
  for (const e of events) {
    if (e.type === "done") {
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
  store.publish(snapshot(state, mode, audio.muted, records));
  if (first) {
    first = false;
    layout();
    requestAnimationFrame(() => {
      worldReady();
      if (visualTest) visualTest.ready = true;
    });
  }
  requestAnimationFrame(frame);
}
const visualTest =
  import.meta.env.DEV || params.has("e2e")
    ? installVisualTest({
        getState: () => state,
        view,
        setFrozen: (on) => {
          frozen = on;
        },
      })
    : null;
layout();
requestAnimationFrame(frame);

// Read-only probe for the end-to-end test (only with ?e2e in the URL). Input still goes
// through the real pointer and keyboard.
if (new URLSearchParams(window.location.search).has("e2e")) {
  Object.assign(window, {
    __hold: {
      state: () => state,
      canGrab: () => canGrab(state),
      toScreen: (x: number, y: number) => view.stage.toScreen({ x, y }),
    },
  });
}

if (import.meta.hot) import.meta.hot.dispose(() => input.dispose());
