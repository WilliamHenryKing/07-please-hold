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
  toggleMute: () => void;
  setMode: (mode: InputMode) => void;
  /** Ready, visible, interactive play only. Discrete actions still have their own phase guards. */
  active?: () => boolean;
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

function elementTarget(target: EventTarget | null): HTMLElement | null {
  return target && "closest" in target ? (target as HTMLElement) : null;
}

export function isEditingTarget(target: EventTarget | null): boolean {
  const element = elementTarget(target);
  return !!(
    element?.isContentEditable ||
    element?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")
  );
}

const NATIVE_ACTION = "button, a[href], summary, [role='button']";
const DIRECTIONAL_WIDGET =
  "[role='slider'], [role='spinbutton'], [role='combobox'], [role='listbox'], [role='menu'], [role='tablist'], [role='tree']";

/** Multiple physical aliases own one direction; releasing W must not release a held Up arrow. */
export function aimDirection(held: ReadonlySet<string>): Vec {
  const has = (a: string, b: string) => Number(held.has(a) || held.has(b));
  return {
    x: has("ArrowRight", "KeyD") - has("ArrowLeft", "KeyA"),
    y: has("ArrowUp", "KeyW") - has("ArrowDown", "KeyS"),
  };
}

/** Pointer release acts once. Keys preserve native controls and never survive a canceled session. */
export function bindInput(canvas: HTMLCanvasElement, h: InputHandlers) {
  const held = new Set<string>();
  let pressed: number | null = null;
  let disposed = false;
  const active = () => !disposed && (h.active?.() ?? true);

  const clearPointer = () => {
    const pointer = pressed;
    pressed = null;
    if (pointer !== null && canvas.hasPointerCapture(pointer))
      canvas.releasePointerCapture(pointer);
  };
  const clear = () => {
    held.clear();
    clearPointer();
  };
  const applyAim = () => {
    if (!active()) {
      clear();
      return;
    }
    const dir = aimDirection(held);
    if (dir.x !== 0 || dir.y !== 0) h.aimAlong(dir);
  };

  const aimFrom = (e: PointerEvent) => {
    const p = h.toWorld(e.clientX, e.clientY);
    if (p) h.aimAt(p);
    return p !== null;
  };
  const onMove = (e: PointerEvent) => {
    if (!active()) return;
    if (pressed === e.pointerId || (pressed === null && e.pointerType === "mouse")) aimFrom(e);
  };
  const onDown = (e: PointerEvent) => {
    if (!active() || pressed !== null || e.isPrimary === false) return;
    h.setMode(e.pointerType === "touch" ? "touch" : "pointer");
    canvas.focus({ preventScroll: true });
    if (e.button === 2) {
      applyAim();
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
    clearPointer();
    if (!active()) return;
    const rect = canvas.getBoundingClientRect();
    const hit = document.elementFromPoint?.(e.clientX, e.clientY);
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom ||
      (hit !== null && hit !== undefined && hit !== canvas) ||
      !aimFrom(e)
    )
      return;
    h.primary();
  };
  const onCancel = (e: PointerEvent) => {
    if (pressed === e.pointerId) clearPointer();
  };
  const onContext = (e: Event) => e.preventDefault();

  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isEditingTarget(e.target))
      return;
    const target = elementTarget(e.target);
    const onControl = !!target?.closest(NATIVE_ACTION);
    if (e.repeat && onControl && (e.code === "Space" || e.code === "Enter")) {
      e.preventDefault();
      return;
    }
    const scrolling = !!target?.closest("[data-keyboard-scroll]") && !onControl;
    if (scrolling && (e.code.startsWith("Arrow") || e.code === "Space")) return;
    if (e.code === "KeyM" && !e.repeat) {
      h.toggleMute();
      return;
    }
    if (!active() || target?.closest(DIRECTIONAL_WIDGET)) return;
    if (e.code in AIM_KEYS) {
      if (e.repeat && !held.has(e.code)) return;
      held.add(e.code);
      e.preventDefault();
      h.setMode("pointer");
      return;
    }
    if (e.repeat) {
      if (e.code === "Space") e.preventDefault();
      return;
    }
    if (e.code === "Space" && !onControl) {
      e.preventDefault();
      applyAim();
      h.primary();
    } else if (e.code === "KeyE") {
      applyAim();
      h.grab();
    } else if (e.code === "KeyQ") {
      applyAim();
      h.push();
    } else if (e.code === "KeyR") h.restart();
    else return;
    h.setMode("pointer");
  };
  const onKeyUp = (e: KeyboardEvent) => held.delete(e.code);
  const onVisibility = () => {
    if (document.hidden) clear();
  };
  const onFocus = () => {
    // A held aim must not keep overriding pointer aim while a native text/scroll control owns focus.
    held.clear();
  };

  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("lostpointercapture", onCancel);
  canvas.addEventListener("contextmenu", onContext);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("focusin", onFocus);

  return {
    clear,
    /** Apply held aim keys; call once per frame. */
    poll() {
      applyAim();
    },
    dispose() {
      clear();
      disposed = true;
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("lostpointercapture", onCancel);
      canvas.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("focusin", onFocus);
    },
  };
}
