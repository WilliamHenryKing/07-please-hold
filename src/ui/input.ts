import type { InputMode } from "../game/hints";
import type { Vec } from "../game/types";

export interface InputHandlers {
  toWorld: (clientX: number, clientY: number) => Vec | null;
  aimAt: (p: Vec) => void;
  aimAlong: (dir: Vec) => void;
  primary: () => void;
  grab: () => void;
  push: () => void;
  restart: () => void;
  setMode: (mode: InputMode) => void;
}

const AIM_KEYS: Record<string, Vec> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  KeyW: { x: 0, y: 1 },
  KeyS: { x: 0, y: -1 },
};

/**
 * Pointer: hover (or drag on touch) to aim, release to act, right-click to grab.
 * Keys: arrows/WASD aim (combine for diagonals), Space acts, E grabs, Q pushes off carrying, R restarts.
 */
export function bindInput(canvas: HTMLCanvasElement, h: InputHandlers) {
  const held = new Set<string>();
  let pressed: number | null = null;

  const aimFrom = (e: PointerEvent) => {
    const p = h.toWorld(e.clientX, e.clientY);
    if (p) h.aimAt(p);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "mouse" || pressed === e.pointerId) aimFrom(e);
  };
  const onDown = (e: PointerEvent) => {
    h.setMode(e.pointerType === "touch" ? "touch" : "pointer");
    if (e.button === 2) {
      h.grab();
      return;
    }
    if (e.button !== 0) return;
    pressed = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    aimFrom(e);
  };
  const onUp = (e: PointerEvent) => {
    if (pressed !== e.pointerId) return;
    pressed = null;
    aimFrom(e);
    h.primary();
  };
  const onCancel = () => {
    pressed = null;
  };
  const onContext = (e: Event) => e.preventDefault();

  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const onControl = !!target?.closest("button, a, input");
    if (e.code in AIM_KEYS) {
      held.add(e.code);
      e.preventDefault();
      h.setMode("pointer");
      return;
    }
    if (e.repeat) return;
    if (e.code === "Space" && !onControl) {
      e.preventDefault();
      h.primary();
    } else if (e.code === "KeyE") h.grab();
    else if (e.code === "KeyQ") h.push();
    else if (e.code === "KeyR") h.restart();
    else return;
    h.setMode("pointer");
  };
  const onKeyUp = (e: KeyboardEvent) => held.delete(e.code);
  const onBlur = () => held.clear();

  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("contextmenu", onContext);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  return {
    /** Apply held aim keys; call once per frame. */
    poll() {
      if (held.size === 0) return;
      const dir = { x: 0, y: 0 };
      for (const code of held) {
        const d = AIM_KEYS[code];
        if (d) {
          dir.x += d.x;
          dir.y += d.y;
        }
      }
      if (dir.x !== 0 || dir.y !== 0) h.aimAlong(dir);
    },
    dispose() {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    },
  };
}
