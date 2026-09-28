# PLEASE HOLD: fidelity pass session report

Branch `cloud-v1`. Nothing was pushed to `main` and nothing was deployed. `bun run check` passes (27 tests), and the Playwright room-1 end-to-end test passes (on the low tier; see below).

## Scores (SwiftShader, same six bookmarks, `scripts/capture.mjs`)

| Bookmark | Before | After |
| --- | --- | --- |
| establishing-wide | 2.6 | 3.1 |
| hero | 2.3 | 3.0 |
| close-up | 1.9 | 2.9 |
| grazing-material | 2.0 | 3.1 |
| porthole | 2.3 | 3.4 |
| phone-hero | 2.6 | 3.0 |
| **Overall** | **2.3** | **3.1** |

Renderer string: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. Captures and per-bookmark flaws are in `docs/visual/captures/{baseline,after}/` and `docs/visual/AUDIT.md`.

## Asset budget

Shipped assets total **5.46 MB**: textures 3.7 MB (WebP, 2K maximum, plus a 1.6 MB HDR) and audio 2.0 MB. Every file is listed with its source URL, author, licence, date, sha256 and processing in `assets.manifest.json`, and credited in the README. There is no glTF geometry, so meshopt compression doesn't apply.

## What changed

- **Evidence.** `window.__VISUAL_TEST__` (dev and `?e2e` only: `ready`, `setBookmark`, `freeze`, `settle`, plus the renderer string) and seven bookmarks in `src/scene/bookmarks.ts`: establishing-wide, hero, close-up, grazing-material, porthole, phone-hero and conservatory-play (README).
- **One lighting model** (`src/scene/pipeline.ts`, adapted from ODD TIDE):
  - A half-float HDR target with MSAA, then GTAO (patched not to redraw shadows), UnrealBloom above an HDR threshold, OutputPass (AgX and sRGB, applied once), and SMAA last.
  - The hemisphere fill is replaced by the Poly Haven "Anniversary Lounge" HDRI (PMREM).
  - Every glowing lamp is a candela point light, and the fake additive light pools are gone.
  - The key shadow frustum is fitted to each room and texel-snapped.
  - Quality tiers: phones and `?quality=low` skip GTAO and bloom and cap DPR at 1.5.
- **Materials** (`src/scene/surfaces.ts`):
  - Tufted leather baked from ambientCG Leather037 plus a procedural tuft field: five buttons, diamond creases, a stitched border seam, AO, and roughness packed into ARM (`scripts/bake-textures.mjs`, headless Chromium, WebP output).
  - Leather-covered buttons seated in the dimples.
  - Per-panel hue, lightness and puff jitter.
  - Brushed brass and steel (Metal054A) reflecting the environment.
  - Wool bouclé sofa and a woven linen uniform, both copied from ODD TIDE with their manifest records carried over.
  - A braided collar and brass buttons on the bellhop.
- **Planet** (`src/scene/planet.ts`): NASA Blue Marble (day), cloud cover and Black Marble (night lights) on a ray-cast sphere, with a sun glint on the oceans, a Rayleigh limb warming at the terminator, an outer glow, round stars, and porthole parallax. Every porthole now looks toward the limb.
- **Dust** renders as soft round sprites; effects, guides and dust are kept out of the AO buffer.
- **README media** refreshed from the new look: `docs/readme/desktop.png` and `phone.png` via the capture hook, and `preview.gif` re-recorded.

## What I could not do, or did differently

- **KTX2:** no `toktx` or Basis encoder was available here. Textures ship as WebP, which the directive allows.
- **Models:** no sourced models were added. The bellhop, props and furniture are still code-modelled primitives, and the bellhop is now the weakest element in every shot (see AUDIT.md, "Next ranked fixes").
- **Hand scuffs** on the rails are only suggested by the brushed-metal roughness map; there is no dedicated wear mask where hands grip.
- **E2E tier:** the end-to-end test now runs with `&quality=low`, because on SwiftShader the high tier (GTAO and bloom at full resolution) slowed frames enough to risk its timeouts. It still exercises the full gameplay path.
- **Scoring renderer:** scores were judged on SwiftShader only; no GPU was available in this session.
- **ODD TIDE access:** the clone succeeded (read-only, `/home/user/01-odd-tide`, commit `924febb`). I used its pipeline pattern, its material conventions (ARM packing and roles) and two fabric sets. I didn't use its sky model, because the porthole view needed NASA Earth rather than a sky dome.
- **Reply:** this cloud session can't message other sessions, so this file is the report.
