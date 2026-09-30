import { afterEach, describe, expect, test } from "bun:test";
import type { Vec } from "../src/game/types";
import { aimDirection, bindInput, isEditingTarget } from "../src/ui/input";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
  else Reflect.deleteProperty(globalThis, "document");
});

function event(type: string, values: Record<string, unknown> = {}) {
  const result = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(result, key, { configurable: true, value });
  }
  return result;
}

class Surface {
  isContentEditable = false;
  constructor(readonly kind: "button" | "scroll" | "input" | "widget") {}
  closest(selector: string) {
    if (this.kind === "button" && selector.startsWith("button")) return this;
    if (this.kind === "scroll" && selector.includes("data-keyboard-scroll")) return this;
    if (this.kind === "input" && selector.includes("input")) return this;
    if (this.kind === "widget" && selector.includes("slider")) return this;
    return null;
  }
}

function setup() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    hidden: false,
    elementFromPoint: () => hit,
  });
  const captured = new Set<number>();
  const canvas = Object.assign(new EventTarget(), {
    focus: () => {},
    setPointerCapture: (id: number) => captured.add(id),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => {
      captured.delete(id);
      canvas.dispatchEvent(event("lostpointercapture", { pointerId: id }));
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 500, bottom: 300 }),
  });
  let hit: unknown = canvas;
  let active = true;
  const calls: string[] = [];
  const directions: Vec[] = [];
  const targets: Vec[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: win });
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  const input = bindInput(canvas as unknown as HTMLCanvasElement, {
    toWorld: (x, y) => ({ x, y }),
    aimAt: (value) => targets.push(value),
    aimAlong: (value) => {
      directions.push(value);
      calls.push("aim");
    },
    primary: () => calls.push("primary"),
    grab: () => calls.push("grab"),
    push: () => calls.push("push"),
    restart: () => calls.push("restart"),
    toggleMute: () => calls.push("mute"),
    setMode: () => {},
    active: () => active && !doc.hidden,
  });
  cleanup = input.dispose;
  const key = (code: string, values: Record<string, unknown> = {}, type = "keydown") => {
    const next = event(type, { code, target: canvas, repeat: false, ...values });
    win.dispatchEvent(next);
    return next;
  };
  const pointer = (type: string, id = 1, values: Record<string, unknown> = {}) => {
    canvas.dispatchEvent(
      event(type, {
        pointerId: id,
        pointerType: "touch",
        button: 0,
        isPrimary: true,
        clientX: 100,
        clientY: 100,
        ...values,
      }),
    );
  };
  return {
    win,
    doc,
    input,
    calls,
    directions,
    targets,
    captured,
    key,
    pointer,
    setActive: (value: boolean) => {
      active = value;
    },
    setHit: (value: unknown) => {
      hit = value;
    },
  };
}

describe("physical aim ownership", () => {
  test("aliases preserve diagonals without weighting one direction twice", () => {
    expect(aimDirection(new Set(["KeyW", "ArrowUp", "ArrowRight"]))).toEqual({ x: 1, y: 1 });
    expect(aimDirection(new Set(["KeyA", "ArrowRight", "KeyD"]))).toEqual({ x: 0, y: 0 });
  });
  test("releasing one alias leaves the other held and actions consume aim immediately", () => {
    const f = setup();
    f.key("KeyW");
    f.key("ArrowUp");
    f.key("KeyW", {}, "keyup");
    f.key("Space");
    expect(f.directions.at(-1)).toEqual({ x: 0, y: 1 });
    expect(f.calls).toEqual(["aim", "primary"]);
    f.key("ArrowUp", {}, "keyup");
    f.input.poll();
    expect(f.calls).toEqual(["aim", "primary"]);
  });
  test("Q and E see a direction pressed in the same task", () => {
    const f = setup();
    f.key("ArrowLeft");
    f.key("KeyQ");
    f.key("KeyE");
    expect(f.calls).toEqual(["aim", "push", "aim", "grab"]);
    expect(f.directions).toEqual([
      { x: -1, y: 0 },
      { x: -1, y: 0 },
    ]);
  });
  test("blur cancels keys and pointer; repeats cannot resurrect canceled aim", () => {
    const f = setup();
    f.key("ArrowRight");
    f.pointer("pointerdown");
    f.win.dispatchEvent(new Event("blur"));
    f.key("ArrowRight", { repeat: true });
    f.input.poll();
    f.pointer("pointerup");
    expect(f.calls).toEqual([]);
    expect(f.captured.size).toBe(0);
  });
  test("hidden visibility, explicit clear and inactive polling release ownership", () => {
    const f = setup();
    for (const cancel of [
      () => {
        f.doc.hidden = true;
        f.doc.dispatchEvent(new Event("visibilitychange"));
      },
      () => f.input.clear(),
      () => {
        f.setActive(false);
        f.input.poll();
      },
    ]) {
      f.setActive(true);
      f.doc.hidden = false;
      f.key("KeyW");
      f.pointer("pointerdown");
      cancel();
      f.setActive(true);
      f.doc.hidden = false;
      f.input.poll();
      f.pointer("pointerup");
    }
    expect(f.calls).toEqual([]);
    expect(f.captured.size).toBe(0);
  });
  test("focus moving into a native control releases previous held aim", () => {
    const f = setup();
    f.key("ArrowRight");
    f.doc.dispatchEvent(new Event("focusin"));
    f.input.poll();
    expect(f.directions).toEqual([]);
  });
});

describe("native keyboard behavior", () => {
  test("button Space and Enter remain native, but held activation is suppressed", () => {
    const f = setup();
    const button = new Surface("button");
    for (const code of ["Space", "Enter"]) {
      expect(f.key(code, { target: button }).defaultPrevented).toBe(false);
      expect(f.key(code, { target: button, repeat: true }).defaultPrevented).toBe(true);
    }
    expect(f.calls).toEqual([]);
  });
  test("scroll surfaces keep arrows and Space while buttons retain aiming shortcuts", () => {
    const f = setup();
    const scroll = new Surface("scroll");
    for (const code of ["ArrowRight", "ArrowDown", "Space"]) {
      expect(f.key(code, { target: scroll }).defaultPrevented).toBe(false);
      expect(f.key(code, { target: scroll, repeat: true }).defaultPrevented).toBe(false);
    }
    f.input.poll();
    expect(f.calls).toEqual([]);
    f.key("ArrowRight", { target: new Surface("button") });
    f.input.poll();
    expect(f.directions).toEqual([{ x: 1, y: 0 }]);
  });
  test("editable controls, directional widgets and modified shortcuts do not mutate play", () => {
    const f = setup();
    const editable = new Surface("input");
    expect(isEditingTarget(editable as unknown as EventTarget)).toBe(true);
    expect(isEditingTarget(null)).toBe(false);
    for (const code of ["ArrowRight", "KeyE", "KeyQ", "KeyR", "KeyM", "Space"]) {
      f.key(code, { target: editable });
      for (const modifier of ["ctrlKey", "metaKey", "altKey"]) f.key(code, { [modifier]: true });
      f.key(code, { target: new Surface("widget") });
    }
    f.input.poll();
    // Sound remains a global shortcut on a non-editable widget; gameplay commands do not.
    expect(f.calls).toEqual(["mute"]);
  });
  test("held primary acts once and default-prevented events stay with their owner", () => {
    const f = setup();
    f.key("Space");
    expect(f.key("Space", { repeat: true }).defaultPrevented).toBe(true);
    const prevented = event("keydown", { code: "KeyR", target: f.doc });
    prevented.preventDefault();
    f.win.dispatchEvent(prevented);
    expect(f.calls).toEqual(["primary"]);
  });
});

describe("owned pointer gestures", () => {
  test("another pointer cannot steal, move or cancel the owner; up acts once", () => {
    const f = setup();
    f.pointer("pointerdown", 1);
    f.pointer("pointerdown", 2);
    f.pointer("pointermove", 2, { clientX: 200 });
    f.pointer("pointercancel", 2);
    f.pointer("pointerup", 2);
    expect(f.captured.has(1)).toBe(true);
    expect(f.targets).toEqual([{ x: 100, y: 100 }]);
    f.pointer("pointerup", 1);
    f.pointer("pointerup", 1);
    expect(f.calls).toEqual(["primary"]);
    expect(f.captured.size).toBe(0);
  });
  test("pointer cancellation and lost capture never perform an action", () => {
    const f = setup();
    for (const cancel of ["pointercancel", "lostpointercapture"]) {
      f.pointer("pointerdown");
      f.pointer(cancel);
      f.pointer("pointerup");
    }
    expect(f.calls).toEqual([]);
  });
  test("releasing outside the canvas or over HUD does not throw at stale aim", () => {
    const f = setup();
    f.pointer("pointerdown");
    f.pointer("pointerup", 1, { clientX: 700 });
    f.pointer("pointerdown");
    f.setHit(new Surface("button"));
    f.pointer("pointerup");
    expect(f.calls).toEqual([]);
    expect(f.captured.size).toBe(0);
  });
  test("inactive and non-primary pointers are ignored; disposal owns all listeners", () => {
    const f = setup();
    f.pointer("pointerdown", 2, { isPrimary: false });
    f.setActive(false);
    f.pointer("pointerdown");
    f.key("Space");
    f.setActive(true);
    f.pointer("pointerdown");
    f.key("KeyW");
    f.input.dispose();
    f.pointer("pointerup");
    f.key("Space");
    f.key("KeyM");
    f.input.poll();
    expect(f.calls).toEqual([]);
    expect(f.captured.size).toBe(0);
  });
});
