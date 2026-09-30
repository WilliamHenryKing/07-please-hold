import * as THREE from "three";
import { itemInReach, railInReach } from "../game/actions";
import { preview } from "../game/predict";
import { ROOMS } from "../game/rooms";
import { createGame } from "../game/state";
import type { GameEvent, GameState, ItemKind } from "../game/types";
import { closestOnSegment } from "../game/vec";
import { ItemView } from "./actors";
import { aborted, SceneAssets, withSceneAssets } from "./assets";
import { Atmosphere } from "./atmosphere";
import { AttendantView } from "./attendant";
import { Effects } from "./effects";
import { buildFixtures, type Fixtures } from "./fixtures";
import { Guides } from "./guides";
import { Opening } from "./opening";
import { skyUniforms } from "./planet";
import { buildShell, type Shell } from "./roomShell";
import { Stage } from "./stage";

/** Everything drawn: builds a room's meshes, mirrors game state each frame, plays effects. */
export class GameView {
  readonly opening = new Opening();
  readonly stage: Stage;
  readonly ready: Promise<void>;
  private assets = new SceneAssets();
  private disposed = false;
  private warm: THREE.Group | null = null;
  private roomGroup = new THREE.Group();
  private fixtures: Fixtures | null = null;
  private attendant: AttendantView;
  private items = new Map<string, ItemView>();
  private guides = new Guides();
  private effects = new Effects();
  private atmosphere = new Atmosphere();
  private shell: Shell | null = null;
  private roomId = "";
  private t = 0;
  /** 1 for full motion, 0 for prefers-reduced-motion. */
  motion = 1;

  constructor(canvas: HTMLCanvasElement, initialState = createGame()) {
    this.stage = withSceneAssets(this.assets, () => new Stage(canvas, this.assets));
    this.attendant = new AttendantView(this.assets);
    this.stage.scene.add(
      this.roomGroup,
      this.attendant.root,
      this.guides.group,
      this.effects.mesh,
      this.atmosphere.group,
    );
    this.stage.aoHidden.push(this.guides.group, this.effects.mesh, this.atmosphere.group);
    this.build(initialState);
    this.ready = this.prepare(initialState).catch((error) => {
      this.dispose();
      throw error;
    });
    // The caller handles the error; teardown can happen before it attaches its handler.
    void this.ready.catch(() => {});
  }

  private async prepare(state: GameState) {
    await this.attendant.ready;
    await this.assets.ready();
    const warm = this.warmRooms();
    await this.assets.ready();
    if (!(await this.stage.precompile(warm))) throw aborted();
    this.assets.assertAlive();
    this.attendant.resetMotion();
    // Readiness includes the first real, normally composed frame, not only hidden warm props.
    this.update(state, 0);
    this.assets.beginDeferred();
  }

  /**
   * Every room's shell, fixtures and items, built once behind the arrival veil so their
   * shaders compile before play, then kept (hidden) so three never frees those programs: a
   * room change used to stall for up to half a second compiling its new materials. Their
   * lights are left out; Stage warms both authored lamp counts using the live room's lights.
   */
  warmRooms() {
    this.assets.assertAlive();
    if (this.warm) return this.warm;
    this.warm = withSceneAssets(this.assets, () => {
      const warm = new THREE.Group();
      for (const room of ROOMS) warm.add(buildShell(room).group, buildFixtures(room).group);
      for (const kind of ["cushion", "plant", "tray", "flask"] as ItemKind[])
        warm.add(new ItemView(kind).root);
      const lights: THREE.Object3D[] = [];
      warm.traverse((o) => {
        if ((o as THREE.Light).isLight) lights.push(o);
      });
      for (const light of lights) light.removeFromParent();
      return this.assets.resources.tree(warm);
    });
    return this.warm;
  }

  private build(state: GameState) {
    // The new room is built before the old one is disposed: three frees a shader program when
    // the last material using it goes, so disposing first made every room change recompile
    // (and stall on) the very programs the next room uses again.
    const old = [...this.roomGroup.children];
    withSceneAssets(this.assets, () => {
      this.items.clear();
      this.shell = buildShell(state.room);
      this.roomGroup.add(this.shell.group);
      this.fixtures = buildFixtures(state.room);
      this.roomGroup.add(this.fixtures.group);
      for (const item of state.items) {
        const view = new ItemView(item.kind);
        view.reset(item);
        this.items.set(item.id, view);
        this.roomGroup.add(view.root);
      }
      this.assets.resources.tree(this.roomGroup);
    });
    for (const child of old) this.assets.resources.retire(child);
    this.effects.clear();
    this.attendant.resetMotion();
    this.atmosphere.setRoom(state.room);
    this.stage.resetMotion();
    this.roomId = `${state.roomIndex}:${state.room.id}`;
    this.stage.frame(state.room);
  }

  /** Start a fresh presentation without rebuilding the current room's shared surfaces. */
  reset(state: GameState) {
    if (this.disposed) return;
    if (`${state.roomIndex}:${state.room.id}` !== this.roomId) this.build(state);
    this.effects.clear();
    this.atmosphere.reset();
    this.attendant.resetMotion();
    this.shell?.reset();
    this.stage.resetMotion();
    for (const item of state.items) this.items.get(item.id)?.reset(item);
    if (this.fixtures?.hatchDoor) this.fixtures.hatchDoor.rotation.y = state.hatchOpen ? -1.7 : 0;
    this.update(state, 0);
  }

  /** Physics continues in calm mode; only decorative motion and the opening glide settle. */
  setMotion(calm: boolean) {
    if (this.disposed) return;
    const motion = calm ? 0 : 1;
    if (this.motion === motion) return;
    this.motion = motion;
    if (!calm) return;
    this.effects.clear();
    this.atmosphere.reset();
    this.attendant.resetMotion();
    this.shell?.reset();
    this.stage.resetMotion();
    for (const item of this.items.values()) item.settleMotion();
    if (!this.stage.override && this.opening.phase === "glide") {
      this.stage.settle(0);
      this.opening.update(this.stage.camera, 0, true);
    }
  }

  handle(events: GameEvent[], state: GameState) {
    if (this.disposed) return;
    if (`${state.roomIndex}:${state.room.id}` !== this.roomId) this.build(state);
    if (this.motion < 1) return;
    const soft = this.motion < 1;
    for (const e of events) {
      if (e.type === "throw") {
        this.effects.burst(e.pos, e.dir, soft ? 3 : 8, 2.4);
        this.attendant.kick(0.9, e.dir);
        this.attendant.gesture("throw");
        // Thrown things tumble; the side of the throw decides which way.
        this.items.get(e.item)?.spinUp((e.dir.x >= 0 ? -1 : 1) * (4 + Math.random() * 2));
      } else if (e.type === "push") {
        this.effects.burst(state.player.pos, { x: -e.dir.x, y: -e.dir.y }, soft ? 3 : 7, 2);
        this.attendant.kick(0.6, e.dir);
      } else if (e.type === "bump") {
        const n = Math.min(10, Math.round(e.strength * 2));
        this.effects.burst(e.pos, null, soft ? 2 : n, 1.2, e.who === "player" ? 0.1 : 0.06);
        this.shell?.dent(e.pos, Math.min(1, e.strength * (e.who === "player" ? 0.3 : 0.15)));
        if (e.who === "player") {
          const into = this.impactDir(e.pos, state);
          this.attendant.kick(Math.min(0.9, e.strength * 0.2), into);
          if (e.strength > 2.2 && !soft) this.stage.nudge(into, Math.min(0.25, e.strength * 0.05));
          if (e.strength > 2.6) this.attendant.gesture("hit");
        } else {
          for (const it of state.items) {
            if (Math.hypot(it.pos.x - e.pos.x, it.pos.y - e.pos.y) < 0.6)
              this.items.get(it.id)?.spinUp(e.strength * 0.8, true);
          }
        }
      } else if (e.type === "bonk") {
        this.effects.burst(e.pos, null, soft ? 3 : 10, 1.6, 0.1);
        this.attendant.kick(0.8, this.impactDir(e.pos, state));
        this.attendant.gesture("hit");
      } else if (e.type === "task") {
        this.attendant.gesture("cheer");
      } else if (e.type === "place") {
        this.effects.burst(e.pos, { x: 0, y: 0.6 }, soft ? 4 : 16, 1.8, 0.07);
      } else if (e.type === "grab" && e.target === "rail") {
        this.attendant.kick(0.3);
      }
    }
  }

  /** Direction from the attendant toward an impact point, for squash and nudges. */
  private impactDir(at: { x: number; y: number }, state: GameState) {
    const dx = at.x - state.player.pos.x;
    const dy = at.y - state.player.pos.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }

  update(state: GameState, dt: number) {
    if (this.disposed) return;
    const key = `${state.roomIndex}:${state.room.id}`;
    if (key !== this.roomId) this.build(state);
    this.t += dt * this.motion;
    skyUniforms.uTime.value += dt * this.motion;
    const f = this.fixtures;
    if (f) {
      if (f.spinner) f.spinner.rotation.z = state.spinnerAngle;
      if (f.hatchDoor) {
        const target = state.hatchOpen ? -1.7 : 0;
        f.hatchDoor.rotation.y = THREE.MathUtils.lerp(
          f.hatchDoor.rotation.y,
          target,
          this.motion < 1 ? 1 : Math.min(1, dt * 3),
        );
      }
      for (const [id, ring] of f.rings) {
        const filled = state.items.some((i) => i.placed === id);
        ring.visible = !filled;
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.45 + 0.35 * Math.sin(this.t * 3) * this.motion;
      }
      for (const fn of f.decor) fn(this.t, this.motion);
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
    this.shell?.update(dt);
    const bodies = [state.player, ...state.items.filter((i) => !i.placed)];
    this.atmosphere.update(this.t, dt, bodies, this.motion);
    this.stage.settle(dt);
    if (!this.stage.override) this.opening.update(this.stage.camera, dt, this.motion < 1);
    // Porthole parallax: the view outside shifts a little with the eye and the attendant.
    const eye = this.stage.eye;
    const px = (eye.x + state.player.pos.x * 0.5) * 0.025 * this.motion;
    const py = (eye.y + state.player.pos.y * 0.5) * 0.025 * this.motion;
    skyUniforms.uParallax.value.lerp(new THREE.Vector2(px, py), Math.min(1, dt * 3));
    this.stage.render();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.assets.resources.tree(this.stage.scene);
    this.assets.dispose();
    this.attendant.dispose();
    this.effects.clear();
    this.atmosphere.reset();
    this.items.clear();
    this.roomGroup.clear();
    this.fixtures = this.shell = this.warm = null;
    this.stage.dispose();
  }
}
