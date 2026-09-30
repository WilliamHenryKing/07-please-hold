import { afterAll, describe, expect, test } from "bun:test";
import * as THREE from "three";
import { ROOMS } from "../src/game/rooms";
import { createGame } from "../src/game/state";
import { Stage } from "../src/scene/stage";
import type { GameView as GameViewType } from "../src/scene/view";

const saved = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1 },
  location: { search: "?e2e" },
  document: { getElementById: () => null, createElement: () => ({ getContext: () => null }) },
  innerWidth: 1440,
  innerHeight: 900,
})) {
  saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, value });
}
const { Opening } = await import("../src/scene/opening");
const { GameView } = await import("../src/scene/view");
afterAll(() => {
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function stageFixture(width: number, height: number) {
  const rect = { left: 11, top: 17, width, height };
  const operations: string[] = [];
  let pixelRatio = 1;
  const fixture = {
    renderer: {
      domElement: { clientWidth: width, clientHeight: height, getBoundingClientRect: () => rect },
      getPixelRatio: () => pixelRatio,
      setPixelRatio: (value: number) => {
        pixelRatio = value;
      },
      setSize: () => operations.push("resize"),
    },
    camera: new THREE.PerspectiveCamera(30, width / height, 0.1, 200),
    key: new THREE.DirectionalLight(),
    pipeline: { scale: 1, setSize: () => {}, render: () => operations.push("render") },
    quality: "low",
    disposed: false,
    warmed: true,
    pendingSize: true,
    width: 1,
    height: 1,
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
    target: new THREE.Vector3(),
    home: new THREE.Vector3(),
    shake: new THREE.Vector2(),
    override: null,
    raycaster: new THREE.Raycaster(),
    plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
  };
  return {
    stage: Object.assign(Object.create(Stage.prototype), fixture) as Stage,
    fixture,
    operations,
    rect,
  };
}

describe("camera and motion lifecycle", () => {
  test("guide height cannot change the quarter-turn orientation of a fixed viewport", () => {
    const { stage } = stageFixture(390, 844);
    const room = ROOMS[0];
    if (!room) throw new Error("arrival room");
    stage.insets = { top: 0.12, bottom: 0.15 };
    stage.frame(room);
    expect(stage.rolled).toBe(true);
    stage.insets = { top: 0.24, bottom: 0.4 };
    stage.frame(room);
    expect(stage.rolled).toBe(true);
    const wide = stageFixture(1440, 900).stage;
    wide.insets = { top: 0.35, bottom: 0.35 };
    wide.frame(room);
    expect(wide.rolled).toBe(false);
  });

  test("every authored room fits inside the portrait/landscape HUD band and picking round-trips", () => {
    for (const [width, height, insets] of [
      [390, 844, { top: 0.14, bottom: 0.24, left: 0, right: 0 }],
      [320, 568, { top: 0.23, bottom: 0.34, left: 0, right: 0 }],
      [568, 320, { top: 0.025, bottom: 0.025, left: 0.025, right: 260 / 568 }],
    ] as const) {
      for (const room of ROOMS) {
        const { stage, rect } = stageFixture(width, height);
        stage.insets = insets;
        stage.frame(room);
        stage.settle(0);
        for (const x of [-room.width / 2, 0, room.width / 2]) {
          for (const y of [-room.height / 2, 0, room.height / 2]) {
            const p = stage.toScreen({ x, y });
            expect(p.x - rect.left).toBeGreaterThanOrEqual(width * insets.left - 2);
            expect(p.x - rect.left).toBeLessThanOrEqual(width * (1 - insets.right) + 2);
            expect(p.y - rect.top).toBeGreaterThanOrEqual(height * insets.top - 2);
            expect(p.y - rect.top).toBeLessThanOrEqual(height * (1 - insets.bottom) + 2);
            const world = stage.toWorld(p.x, p.y);
            expect(world?.x ?? Infinity).toBeCloseTo(x, 8);
            expect(world?.y ?? Infinity).toBeCloseTo(y, 8);
          }
        }
      }
    }
  });

  test("resize applies the backing buffer immediately before a draw", () => {
    const { stage, fixture, operations } = stageFixture(1440, 900);
    const room = ROOMS[0];
    if (!room) throw new Error("arrival room");
    stage.frame(room);
    stage.render();
    operations.length = 0;
    fixture.renderer.domElement.clientWidth = 1024;
    fixture.renderer.domElement.clientHeight = 600;
    stage.resize();
    expect(operations).toEqual([]);
    stage.render();
    expect(operations).toEqual(["resize", "render"]);
  });

  test("calm completes an active opening while reset preserves a capture camera", () => {
    const opening = new Opening();
    opening.phase = "title";
    const camera = new THREE.PerspectiveCamera(30, 1.6);
    opening.update(camera, 1, false);
    opening.begin(false);
    opening.update(camera, 0, true);
    expect(String(opening.phase)).toBe("done");
    const { stage, fixture } = stageFixture(1440, 900);
    const capture = {
      position: [0, 0, 20] as [number, number, number],
      target: [0, 0, 0] as [number, number, number],
      fov: 42,
    };
    stage.override = capture;
    fixture.shake.set(1, 2);
    stage.resetMotion();
    expect(stage.override).toBe(capture);
    expect(fixture.shake.length()).toBe(0);
  });

  test("same-room replay clears all transient presentation and does not rebuild the room", () => {
    const state = createGame();
    const cleared: string[] = [];
    const hatchDoor = new THREE.Group();
    hatchDoor.rotation.y = -0.9;
    const view = Object.assign(Object.create(GameView.prototype), {
      disposed: false,
      roomId: `${state.roomIndex}:${state.room.id}`,
      effects: { clear: () => cleared.push("effects") },
      atmosphere: { reset: () => cleared.push("air") },
      attendant: { resetMotion: () => cleared.push("attendant") },
      shell: { reset: () => cleared.push("walls") },
      stage: { resetMotion: () => cleared.push("camera") },
      fixtures: { hatchDoor },
      items: new Map(state.items.map((item) => [item.id, { reset: () => cleared.push(item.id) }])),
      update: () => cleared.push("sync"),
      build: () => {
        throw new Error("same room should not rebuild");
      },
    }) as GameViewType;
    view.reset(state);
    expect(cleared).toEqual([
      "effects",
      "air",
      "attendant",
      "walls",
      "camera",
      ...state.items.map((item) => item.id),
      "sync",
    ]);
    expect(hatchDoor.rotation.y).toBe(0);
  });
});
