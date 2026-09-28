import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
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
  ) {
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: quality === "high" ? 4 : 0,
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
      this.ao = ao;

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

  render() {
    this.composer.render();
  }
}
