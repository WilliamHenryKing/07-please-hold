import * as THREE from "three";
import { itemInReach, railInReach } from "../game/actions";
import { preview } from "../game/predict";
import type { GameEvent, GameState } from "../game/types";
import { closestOnSegment } from "../game/vec";
import { AttendantView, ItemView } from "./actors";
import { Effects } from "./effects";
import { buildFixtures, type Fixtures } from "./fixtures";
import { Guides } from "./guides";
import { skyUniforms } from "./planet";
import { buildShell } from "./roomShell";
import { Stage } from "./stage";

function dispose(obj: THREE.Object3D) {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const m = o.material;
      if (m instanceof THREE.ShaderMaterial || m instanceof THREE.MeshBasicMaterial) m.dispose();
    }
  });
}

/** Everything drawn: builds a room's meshes, mirrors game state each frame, plays effects. */
export class GameView {
  readonly stage: Stage;
  private roomGroup = new THREE.Group();
  private fixtures: Fixtures | null = null;
  private attendant = new AttendantView();
  private items = new Map<string, ItemView>();
  private guides = new Guides();
  private effects = new Effects();
  private roomId = "";
  private t = 0;
  /** 1 for full motion, reduced for prefers-reduced-motion. */
  motion = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new Stage(canvas);
    this.stage.scene.add(this.roomGroup, this.attendant.root, this.guides.group, this.effects.mesh);
  }

  private build(state: GameState) {
    for (const child of [...this.roomGroup.children]) {
      this.roomGroup.remove(child);
      dispose(child);
    }
    for (const view of this.items.values()) {
      this.roomGroup.remove(view.root);
      dispose(view.root);
    }
    this.items.clear();
    this.roomGroup.add(buildShell(state.room));
    this.fixtures = buildFixtures(state.room);
    this.roomGroup.add(this.fixtures.group);
    for (const item of state.items) {
      const view = new ItemView(item.kind);
      this.items.set(item.id, view);
      this.roomGroup.add(view.root);
    }
    this.roomId = `${state.roomIndex}:${state.room.id}`;
    this.stage.frame(state.room);
  }

  handle(events: GameEvent[], state: GameState) {
    const soft = this.motion < 1;
    for (const e of events) {
      if (e.type === "throw") {
        this.effects.burst(e.pos, e.dir, soft ? 3 : 8, 2.4);
        this.attendant.kick(0.9);
      } else if (e.type === "push") {
        this.effects.burst(state.player.pos, { x: -e.dir.x, y: -e.dir.y }, soft ? 3 : 7, 2);
        this.attendant.kick(0.6);
      } else if (e.type === "bump") {
        const n = Math.min(10, Math.round(e.strength * 2));
        this.effects.burst(e.pos, null, soft ? 2 : n, 1.2, e.who === "player" ? 0.1 : 0.06);
        if (e.who === "player") this.attendant.kick(Math.min(0.8, e.strength * 0.15));
      } else if (e.type === "bonk") {
        this.effects.burst(e.pos, null, soft ? 3 : 10, 1.6, 0.1);
        this.attendant.kick(0.8);
      } else if (e.type === "place") {
        this.effects.burst(e.pos, { x: 0, y: 0.6 }, soft ? 4 : 16, 1.8, 0.07);
      } else if (e.type === "grab" && e.target === "rail") {
        this.attendant.kick(0.3);
      }
    }
  }

  update(state: GameState, dt: number) {
    const key = `${state.roomIndex}:${state.room.id}`;
    if (key !== this.roomId) this.build(state);
    this.t += dt;
    skyUniforms.uTime.value += dt * (0.4 + 0.6 * this.motion);
    const f = this.fixtures;
    if (f) {
      if (f.spinner) f.spinner.rotation.z = state.spinnerAngle;
      if (f.hatchDoor) {
        const target = state.hatchOpen ? -1.7 : 0;
        f.hatchDoor.rotation.y = THREE.MathUtils.lerp(
          f.hatchDoor.rotation.y,
          target,
          Math.min(1, dt * 3),
        );
      }
      for (const [id, ring] of f.rings) {
        const filled = state.items.some((i) => i.placed === id);
        ring.visible = !filled;
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.45 + 0.35 * Math.sin(this.t * 3) * this.motion;
      }
      for (const fn of f.decor) fn(this.t, 0.3 + 0.7 * this.motion);
    }
    this.attendant.update(state.player, this.t, dt, this.motion);
    for (const item of state.items) this.items.get(item.id)?.update(item, dt, this.motion);

    const rail = state.player.rail ? undefined : railInReach(state);
    const near = state.player.holding ? undefined : itemInReach(state);
    const reach = rail
      ? { pos: closestOnSegment(state.player.pos, rail.a, rail.b), radius: 0.3 }
      : near
        ? { pos: near.pos, radius: near.radius + 0.1 }
        : null;
    this.guides.update(
      preview(state),
      state.phase === "playing" ? reach : null,
      this.t,
      this.motion,
    );
    this.effects.update(dt);
    this.stage.render();
  }
}
