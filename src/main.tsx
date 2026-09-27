import { createRoot } from "react-dom/client";
import "./styles.css";
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
  "Orbital lounge. Aim with the pointer or arrow keys; click, tap or Space to throw or push off; E to grab a rail or item; Q to push off carrying; R to restart the room.",
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
  view.stage.insets = phone ? { top: 0.17, bottom: 0.2 } : { top: 0.1, bottom: 0.1 };
  view.stage.resize();
};
window.addEventListener("resize", layout);

const store = new HudStore(snapshot(state, mode));
const controls = {
  primary: () => primary(state),
  grab: () => grab(state),
  push: () => pushOff(state),
  restart: () => restartRoom(state),
  replay: () => {
    state = createGame();
    canvas.focus();
  },
};

const input = bindInput(canvas, {
  toWorld: (x, y) => view.stage.toWorld(x, y),
  aimAt: (p) => aimAt(state, p),
  aimAlong: (d) => aimAlong(state, d),
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
  view.handle(drainEvents(state), state);
  view.update(state, dt);
  store.publish(snapshot(state, mode));
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
