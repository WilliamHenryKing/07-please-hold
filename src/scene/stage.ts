import * as THREE from "three";
import type { RoomDef, Vec } from "../game/types";
import { PAL } from "./palette";

const FOV = 30;

/** Renderer, fixed camera and lights. The camera never rolls or tumbles: it only frames rooms. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  readonly key: THREE.DirectionalLight;
  private room: RoomDef | null = null;
  private target = new THREE.Vector3();
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

  /** Frame the whole room, leaving room for the HUD. Called on resize and room change. */
  frame(room: RoomDef) {
    this.room = room;
    const w = this.renderer.domElement.clientWidth || window.innerWidth;
    const h = this.renderer.domElement.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const usable = Math.max(0.4, 1 - this.insets.top - this.insets.bottom);
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const halfH = room.height / 2 + 0.7;
    const halfW = room.width / 2 + 0.5;
    const dist = Math.max(halfH / (tan * usable), halfW / (tan * this.camera.aspect)) + 1.2;
    // Shift the view so the room sits in the band between the HUD insets.
    const worldPerFrac = 2 * tan * dist;
    const offsetY = ((this.insets.top - this.insets.bottom) / 2) * worldPerFrac;
    this.target.set(0, offsetY, 0);
    this.camera.position.set(0, offsetY + 0.35, dist);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
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

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
