import * as THREE from "three";

const ease = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
const query = new URLSearchParams(location.search);

export class Opening {
  phase: "title" | "glide" | "done" =
    query.has("intro") || (!import.meta.env.DEV && !query.has("e2e")) ? "title" : "done";
  private time = 0;
  private eye = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private fov = 42;
  begin(reduced: boolean) {
    if (this.phase !== "title") return;
    this.phase = reduced ? "done" : "glide";
    this.time = 0;
  }
  /** Called after the stable gameplay camera is posed, before rendering. */
  update(camera: THREE.PerspectiveCamera, dt: number, reduced: boolean) {
    if (this.phase === "done") {
      camera.clearViewOffset();
      return;
    }
    const veil = document.getElementById("arrival");
    if (!veil || veil.classList.contains("is-done")) this.time += dt;
    const phone = camera.aspect < 0.85;
    let weight = 1;
    if (this.phase === "title") {
      const t = reduced ? 1 : ease(this.time / 10);
      camera.up.set(0, 1, 0);
      camera.position.set(-3.8, 1.3, 7.5).lerp(new THREE.Vector3(4.4, 1.8, phone ? 19 : 15), t);
      if (!reduced) camera.position.y += Math.sin(this.time * 0.2) * 0.06;
      camera.lookAt(new THREE.Vector3(0.8, 0.4, -0.9).lerp(new THREE.Vector3(-0.8, 0, -0.5), t));
      camera.fov = phone ? 58 : 42;
      this.eye.copy(camera.position);
      this.rotation.copy(camera.quaternion);
      this.fov = camera.fov;
    } else {
      const t = reduced ? 1 : ease(this.time / 2.8);
      camera.position.lerp(this.eye, 1 - t);
      camera.position.y += Math.sin(Math.PI * t) * 0.5;
      camera.quaternion.slerp(this.rotation, 1 - t);
      camera.fov = THREE.MathUtils.lerp(this.fov, camera.fov, t);
      weight = 1 - t;
      if (t === 1) this.phase = "done";
    }
    camera.setViewOffset(
      innerWidth,
      innerHeight,
      phone ? 0 : -innerWidth * 0.17 * weight,
      phone ? innerHeight * 0.18 * weight : 0,
      innerWidth,
      innerHeight,
    );
    camera.updateProjectionMatrix();
  }
}
