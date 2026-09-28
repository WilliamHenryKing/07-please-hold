import { createRoot } from "react-dom/client";
import "./styles.css";
import { cueFor } from "./audio/cues";
import { AudioEngine } from "./audio/engine";
import { aimAlong, aimAt, grab, primary, pushOff, restartRoom } from "./game/actions";
import type { InputMode } from "./game/hints";
import { createGame } from "./game/state";
import { advance, drainEvents } from "./game/step";
import { worldReady } from "./loader";
import { GameView } from "./scene/view";
import { App } from "./ui/App";
import { bindInput } from "./ui/input";
import { HudStore, snapshot } from "./ui/store";

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

const store = new HudStore(snapshot(state, mode, audio.muted));
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

let last = performance.now();
let carry = 0;
let first = true;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.poll();
  carry = advance(state, carry + dt);
  const events = drainEvents(state);
  view.handle(events, state);
  for (const e of events) {
    const cue = cueFor(e, state, cueSeed++);
    if (cue) audio.play(cue);
  }
  audio.setRevolving(!!state.room.spinner && state.phase === "playing");
  view.update(state, dt);
  store.publish(snapshot(state, mode, audio.muted));
  if (first) {
    first = false;
    layout();
    requestAnimationFrame(() => worldReady());
  }
  requestAnimationFrame(frame);
}
layout();
requestAnimationFrame(frame);

if (import.meta.hot) import.meta.hot.dispose(() => input.dispose());
