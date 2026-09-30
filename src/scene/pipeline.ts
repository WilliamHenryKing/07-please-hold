import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

// One lighting model: the scene renders in linear HDR into a half-float target; AgX tone
// mapping and the sRGB transfer happen exactly once, in OutputPass. Adapted from ODD TIDE.

export type Quality = "high" | "low";

/** Phones and ?quality=low get the light tier: no GTAO or bloom, smaller shadows, DPR ≤ 1.5. */
export function pickQuality(): Quality {
  const q = new URLSearchParams(window.location.search).get("quality");
  if (q === "high" || q === "low") return q;
  const phone = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 640;
  return phone ? "low" : "high";
}

/**
 * Integrated or software graphics (from the GPU's name): the high tier then starts without
 * GTAO and multisampling, which the governor would otherwise drop within seconds.
 */
export function modestGpu(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = String(
      ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    );
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return !/nvidia|geforce|rtx|gtx|radeon (rx|pro)|amd radeon rx|apple m[2-9]/i.test(gpu);
  } catch {
    return true;
  }
}

/**
 * Zeroes NaN and infinity (all exponent bits set: immune to fast-math) and caps HDR values
 * before bloom. Some GPUs (Apple's) make NaN where others quietly don't, and bloom's blur
 * would spread one bad pixel over the whole frame.
 */
const FiniteShader = {
  name: "FiniteShader",
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    float finite(float x) {
      return (floatBitsToUint(x) & 0x7f800000u) == 0x7f800000u ? 0.0 : clamp(x, 0.0, 16384.0);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(finite(c.r), finite(c.g), finite(c.b), 1.0);
    }`,
};

type VisibilityPatched = { _overrideVisibility(): void; _visibilityCache: THREE.Object3D[] };

export class Pipeline {
  readonly composer: EffectComposer;
  readonly ao: GTAOPass | null = null;
  readonly bloom: UnrealBloomPass | null = null;
  private smaa: SMAAPass;

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    readonly quality: Quality,
    aoHidden: () => THREE.Object3D[],
    /** Start without GTAO and multisampling (integrated graphics). */
    light = false,
  ) {
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: quality === "high" && !light ? 4 : 0,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    if (quality === "high") {
      const ao = new GTAOPass(scene, camera, 1, 1);
      ao.blendIntensity = 0.8;
      // GTAO's G-buffer pre-pass would otherwise redraw the shadow maps a second time.
      const aoRender = ao.render.bind(ao);
      ao.render = ((...args: Parameters<GTAOPass["render"]>) => {
        const shadows = renderer.shadowMap;
        const auto = shadows.autoUpdate;
        shadows.autoUpdate = false;
        try {
          aoRender(...args);
        } finally {
          shadows.autoUpdate = auto;
        }
      }) as GTAOPass["render"];
      ao.updateGtaoMaterial({
        radius: 0.45,
        distanceExponent: 1.4,
        thickness: 1,
        scale: 1,
        samples: 12,
      });
      ao.updatePdMaterial({
        lumaPhi: 10,
        depthPhi: 2,
        normalPhi: 3,
        radius: 5,
        rings: 2,
        samples: 12,
      });
      // Effects, guides and the far sky are not surfaces: keep them out of the AO buffer.
      const patched = ao as unknown as VisibilityPatched;
      const original = patched._overrideVisibility.bind(ao);
      patched._overrideVisibility = () => {
        original();
        for (const o of aoHidden())
          if (o.visible) {
            o.visible = false;
            patched._visibilityCache.push(o);
          }
      };
      this.composer.addPass(ao);
      ao.enabled = !light;
      this.ao = ao;
      this.composer.addPass(new ShaderPass(FiniteShader));

      // Bloom is lens glare: only energy above an HDR threshold (the lamp bulbs) contributes.
      const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.2, 1.6);
      const highPass = bloom.materialHighPassFilter;
      highPass.fragmentShader = highPass.fragmentShader.replace(
        "gl_FragColor = mix( outputColor, texel, alpha );",
        `vec3 above = texel.rgb * (max(v - luminosityThreshold, 0.0) / max(v, 1e-4));
        above *= min(1.0, 8.0 / max(luminance(above), 1e-4));
        gl_FragColor = vec4(above, 1.0);`,
      );
      highPass.needsUpdate = true;
      this.composer.addPass(bloom);
      this.bloom = bloom;
    }
    this.composer.addPass(new OutputPass());
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);
  }

  setSize(width: number, height: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  /** Adaptation is off for tests and captures, which must render the full chain. */
  adaptive = true;
  /** Resolution scale the governor has reached (1 … 0.6); the stage applies it. */
  scale = 1;
  onScale: () => void = () => {};
  private last = 0;
  private ema = 16.7;
  private slowFor = 0;
  private spent = false;
  private disposed = false;

  render() {
    if (this.disposed) return;
    this.composer.render();
    const now = performance.now();
    const ms = this.last ? now - this.last : 0;
    this.last = now;
    if (!this.adaptive || this.spent || ms <= 0 || ms > 250) return;
    // Whenever frames stay slower than ~52 fps for two seconds, take one step lighter.
    this.ema += (ms - this.ema) * 0.1;
    this.slowFor = this.ema > 19 ? this.slowFor + ms : 0;
    if (this.slowFor <= 2000) return;
    this.slowFor = 0;
    this.ema = 16.7;
    if (!this.step()) this.spent = true;
  }

  /**
   * One step lighter: GTAO (the most expensive pass), then multisampling (SMAA still smooths
   * edges), then resolution in tenths down to 60 %. Nothing comes back mid-session, so quality
   * never oscillates. False when nothing is left.
   */
  step(): boolean {
    if (this.disposed) return false;
    if (this.ao?.enabled) {
      this.ao.enabled = false;
      return true;
    }
    const targets = [this.composer.renderTarget1, this.composer.renderTarget2];
    if (targets.some((t) => t.samples > 0)) {
      for (const t of targets) {
        t.samples = 0;
        t.dispose();
      }
      return true;
    }
    if (this.scale > 0.65) {
      this.scale = Math.max(0.6, this.scale - 0.1);
      this.onScale();
      return true;
    }
    return false;
  }

  /** Where the governor has got to, for evidence and tests. */
  get state() {
    return {
      quality: this.quality,
      ao: this.ao?.enabled ?? false,
      msaa: this.composer.renderTarget1.samples,
      pixelRatio: +this.renderer.getPixelRatio().toFixed(3),
      scale: +this.scale.toFixed(2),
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.onScale = () => {};
    for (const pass of this.composer.passes) pass.dispose();
    // r186 omits these materials from the passes' own disposal methods.
    this.ao?.gtaoMaterial.dispose();
    this.ao?.blendMaterial.dispose();
    this.bloom?.materialHighPassFilter.dispose();
    this.composer.dispose();
  }
}
