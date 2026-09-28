import * as THREE from "three";
import type { RoomDef, Vec } from "../game/types";
import { PAL } from "./palette";
import { skyMaterial } from "./planet";

const FOV = 30;

/** Renderer, fixed camera and lights. The camera never tumbles during play: it frames rooms. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  readonly key: THREE.DirectionalLight;
  private room: RoomDef | null = null;
  private target = new THREE.Vector3();
  private home = new THREE.Vector3();
  private shake = new THREE.Vector2();
  /** True when the view is turned a quarter for a portrait screen. */
  rolled = false;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  /** Fraction of the viewport height reserved for the HUD at top and bottom. */
  insets = { top: 0, bottom: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(PAL.space);
    // Outside the hull: the same planet the portholes show, filling any spare screen.
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      skyMaterial(new THREE.Vector2(-0.4, 1.1), 16),
    );
    sky.position.z = -45;
    this.scene.add(sky);

    const hemi = new THREE.HemisphereLight(0xfff0dc, 0x6a7090, 1.4);
    this.scene.add(hemi);
    this.key = new THREE.DirectionalLight(0xffe2bd, 2.2);
    this.key.position.set(-5, 7, 9);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.radius = 5;
    this.key.shadow.bias = -0.0008;
    const cam = this.key.shadow.camera;
    cam.left = -9;
    cam.right = 9;
    cam.top = 7;
    cam.bottom = -7;
    cam.near = 1;
    cam.far = 30;
    this.scene.add(this.key, this.key.target);
  }

  /**
   * Frame the whole room, leaving room for the HUD. Portrait screens turn the view a quarter
   * (there is no "up" in orbit), so the long side of the room runs down the tall screen.
   * The camera sits a little off-axis so the padded chamber reads in depth, but it never moves
   * during play except for a tiny spring nudge on hard bumps.
   */
  frame(room: RoomDef) {
    this.room = room;
    const w = this.renderer.domElement.clientWidth || window.innerWidth;
    const h = this.renderer.domElement.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.rolled = this.camera.aspect < 0.85 && room.width > room.height;
    const up = this.rolled ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = this.rolled ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(1, 0, 0);
    const across = this.rolled ? room.height : room.width;
    const along = this.rolled ? room.width : room.height;
    const usable = Math.max(0.4, 1 - this.insets.top - this.insets.bottom);
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const margin = this.rolled ? 0.35 : 0.6;
    const halfH = along / 2 + margin;
    const halfW = across / 2 + margin;
    const dist = Math.max(halfH / (tan * usable), halfW / (tan * this.camera.aspect)) + 1.4;
    // Shift the view so the room sits in the band between the HUD insets.
    const offset = ((this.insets.top - this.insets.bottom) / 2) * 2 * tan * dist;
    this.target.copy(up).multiplyScalar(offset);
    this.home
      .copy(this.target)
      .addScaledVector(up, dist * 0.09)
      .addScaledVector(right, dist * 0.07)
      .setZ(dist);
    this.camera.up.copy(up);
    this.camera.position.copy(this.home);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    // Keep the key light up-left of the view whichever way the screen is turned.
    this.key.position.copy(up).multiplyScalar(7).addScaledVector(right, -5).setZ(9);
  }

  /** Screen direction (x right, y up) to world direction, for keyboard aiming. */
  screenToWorldDir(dir: Vec): Vec {
    return this.rolled ? { x: dir.y, y: -dir.x } : dir;
  }

  /** A small push of the camera away from a hard hit; springs back. */
  nudge(dir: Vec, strength: number) {
    this.shake.x += dir.x * strength;
    this.shake.y += dir.y * strength;
  }

  /** Spring the nudge back to rest. Call once per frame. */
  settle(dt: number) {
    const k = Math.min(1, dt * 9);
    this.shake.multiplyScalar(1 - k);
    this.camera.position.set(this.home.x + this.shake.x, this.home.y + this.shake.y, this.home.z);
    this.camera.lookAt(this.target.x + this.shake.x * 0.5, this.target.y + this.shake.y * 0.5, 0);
  }

  /** Where the camera sits relative to the room centre: drives porthole parallax. */
  get eye(): Vec {
    return { x: this.camera.position.x - this.target.x, y: this.camera.position.y - this.target.y };
  }

  resize() {
    if (this.room) this.frame(this.room);
  }

  /** Map a client pixel to the play plane (z = 0). */
  toWorld(clientX: number, clientY: number): Vec | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, hit) ? { x: hit.x, y: hit.y } : null;
  }

  /** Project a play-plane point to client pixels. */
  toScreen(p: Vec): { x: number; y: number } {
    const v = new THREE.Vector3(p.x, p.y, 0).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
    };
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
