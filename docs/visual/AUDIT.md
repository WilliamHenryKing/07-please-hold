# PLEASE HOLD visual audit

Captures come from headless Chromium on SwiftShader, via `node scripts/capture.mjs <label>` against `bun run preview`. The renderer string is logged in each `capture.json`. Bookmarks are defined in `src/scene/bookmarks.ts` and staged through `window.__VISUAL_TEST__` (dev builds and `?e2e` only).

Scale: 1 placeholder · 2 tech demo · 3 competent indie · 4 premium studio web piece · 5 reference.

## Baseline (`docs/visual/captures/baseline/`)

| Bookmark | Light | Materials | Detail | Env. integration | Atmos./depth | Composition | Artefacts | Motion/UI | Mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| establishing-wide | 2 | 2 | 2 | 3 | 3 | 3 | 3 | 3 | 2.6 |
| hero | 2 | 2 | 2 | 2 | 2 | 3 | 2 | 3 | 2.3 |
| close-up | 2 | 1 | 1 | 2 | 2 | 2 | 2 | 3 | 1.9 |
| grazing-material | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2.0 |
| porthole | 2 | 2 | 2 | 2 | 2 | 3 | 2 | 3 | 2.3 |
| phone-hero | 2 | 2 | 2 | 3 | 3 | 3 | 3 | 3 | 2.6 |

**Overall baseline: 2.3 (tech demo).** The composition and the game read clearly, but every surface is flat, untextured colour.

### Ranked fix list

1. **Upholstery is flat plastic.** The quilted panels are uniform rounded boxes with sphere "buttons" floating on the surface. There is no grain, no stitching and no tuft dimples; at arm's length they read as clay. → Leather or vinyl PBR maps, a baked tufted-button normal and height detail with stitched seams, per-panel hue and roughness jitter.
2. **The planet sells nothing.** The porthole shows a procedural smear with square, aliased stars. → NASA Blue Marble on a lit sphere with a night side, an atmosphere rim and round stars.
3. **Lighting is hemisphere-flat and faked.** The lamp glow is an additive decal; there are no reflections and no contact occlusion. → One lighting model: an HDRI environment (PMREM), physically based light intensities, real point lights at each lamp, AgX applied once in OutputPass, GTAO for contact, bloom only above an HDR threshold.
4. **Brass rails read as brown plastic.** → Metal PBR (metalness 1, varied roughness) reflecting the environment; grips in rubberised fabric.
5. **The bellhop's uniform is untextured.** → Wool-like cloth normal and roughness, darker trim, a brass buckle.
6. **Dust renders as square points** (clearly visible in hero and porthole). → Round, soft sprites.
7. **The sofa is flat, untextured blocks.** → Fabric PBR (weave normal, sheen).
8. **Anti-aliasing is MSAA only, which the post chain disables.** → SMAAPass after the passes.
9. **Grazing view:** frame pads show gaps at the corners, and the panel front faces are perfectly planar. → Normal detail helps; the corner gaps are accepted (off-axis views only).

## After the fidelity pass (`docs/visual/captures/after/`)

The renderer is the same (SwiftShader), with the same bookmarks and the same capture script. Desktop bookmarks run the high tier (GTAO, bloom, 4× MSAA HDR target, SMAA). `phone-hero` runs the phone tier (no GTAO or bloom, DPR ≤ 1.5).

| Bookmark | Light | Materials | Detail | Env. integration | Atmos./depth | Composition | Artefacts | Motion/UI | Mean | Before |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| establishing-wide | 3 | 3 | 3 | 4 | 3 | 3 | 3 | 3 | 3.1 | 2.6 |
| hero | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3.0 | 2.3 |
| close-up | 3 | 3 | 2 | 3 | 3 | 3 | 3 | 3 | 2.9 | 1.9 |
| grazing-material | 3 | 4 | 3 | 3 | 3 | 3 | 3 | 3 | 3.1 | 2.0 |
| porthole | 4 | 3 | 3 | 4 | 4 | 3 | 3 | 3 | 3.4 | 2.3 |
| phone-hero | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3.0 | 2.6 |

**Overall: 3.1 (competent indie), up from 2.3.**

What changed:

- **One lighting model.** A half-float HDR target; AgX and the sRGB transfer applied once in OutputPass; exposure as the only brightness control.
- **Image-based light.** The Poly Haven "Anniversary Lounge" HDRI is the only ambient term; there is no hemisphere fill.
- **Real lamps.** Each lamp is a candela point light with an HDR bulb, and bloom picks up only energy above its threshold. The additive "light pool" decals are gone.
- **Materials.** Tufted leather with seated buttons, creases and stitched seams (ambientCG grain plus a baked tuft field), brushed brass and steel with real reflections, a bouclé sofa, and a woven uniform.
- **Planet.** NASA Blue Marble, clouds and Black Marble on a lit sphere, with an atmosphere rim and round stars.
- **Rendering.** GTAO contact occlusion, key shadows fitted and texel-snapped per room, and per-panel hue, lightness and puff jitter.

### Three most visible remaining flaws per bookmark

- **establishing-wide**
  1. Every panel carries the same tuft pattern; it reads as an "envelope" cross at this distance.
  2. The frame pads are plain, un-tufted blocks with visible gaps at the corners.
  3. The backdrop Earth texture pixelates along the bottom edge (2K stretched to fill the screen).
- **hero**
  1. The bellhop is still primitive capsules with dot eyes.
  2. The notice board and biscuits are untextured, flat-shaded props.
  3. The tray and fern are low-detail primitives next to the new leather and brass.
- **close-up**
  1. The uniform's weave barely registers; the tunic reads as smooth matte cloth.
  2. The face has no modelling (no nose, no ears, flat skin).
  3. The rail grip is a plain sleeve with no stitching or texture variation.
- **grazing-material**
  1. The bloom halo on the nearest bulb is large at grazing distance.
  2. The panel sides show the texture stretched around the rounded edge.
  3. The porthole glass has no reflection or smudging.
- **porthole**
  1. There is no glass layer (reflection, dust, the inner pane).
  2. Clouds and surface are one layer: the clouds cast no shadow and have no parallax.
  3. The star field is procedural; there is no Milky Way band.
- **phone-hero**
  1. The phone tier has no AO, so contact at the rail feet reads flat.
  2. Porthole views on the lower window are mostly black space.
  3. At phone scale the tufting pattern aliases into a fine grid.

### Next ranked fixes

1. A sculpted bellhop: a proper head (nose, ears, a readable smile), tunic seams and piping. This is the weakest element in every shot.
2. Porthole glass: a thin reflective pane with a faint smudge map, plus a cloud-shadow pass on the planet.
3. Two or three tuft layouts across panels (and tufted frame pads), so the wall doesn't repeat.
4. A 4K or tiled-detail Earth for the backdrop plane, or a crop that avoids magnification.

## Round 2 (`docs/visual/captures/round2/`)

Same renderer (SwiftShader), bookmarks and capture script. The bellhop is now KayKit's CC0 rigged "Rogue", repainted as a bellhop with a pillbox hat and brass buttons. The props are modelled (piped cushion, rolled-arm sofa, brass sconces, screwed rail flanges), and the loading path is lighter.

| Bookmark | Light | Materials | Detail | Env. integration | Atmos./depth | Composition | Artefacts | Motion/UI | Mean | Round 1 | Baseline |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| establishing-wide | 3 | 3 | 4 | 4 | 3 | 4 | 3 | 3 | 3.4 | 3.1 | 2.6 |
| hero | 3 | 3 | 3 | 3 | 3 | 4 | 3 | 3 | 3.1 | 3.0 | 2.3 |
| close-up | 3 | 3 | 4 | 3 | 3 | 4 | 3 | 4 | 3.4 | 2.9 | 1.9 |
| grazing-material | 3 | 4 | 4 | 3 | 3 | 3 | 3 | 3 | 3.3 | 3.1 | 2.0 |
| porthole | 4 | 3 | 3 | 4 | 4 | 3 | 3 | 3 | 3.4 | 3.4 | 2.3 |
| phone-hero | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3.0 | 3.0 | 2.6 |

**Overall: 3.3, up from 3.1 (round 1) and 2.3 (baseline).**

### Most visible remaining flaws

- **establishing-wide:** repeated tuft pattern on every panel; plain frame pads; pixelation in the backdrop Earth.
- **hero:** the fern, tray and biscuits are still simple primitives; the notice is flat; the hanging lamp shade is a plain cone.
- **close-up:** the bellhop's hair is the Rogue's (long); the brass buttons sit slightly proud of the chest; the grip sleeve is plain.
- **grazing-material:** a large bloom halo on the nearest sconce; the rounded panel sides stretch the texture; there is no porthole glass.
- **porthole:** no glass layer; clouds cast no shadow; procedural stars only.
- **phone-hero:** no AO on the phone tier; at portrait scale the bellhop is small; the lower porthole is mostly black space.

### Loading (round 2)

The desktop arrival downloads 3.3 MB before the veil lifts, down from 5.0 MB:

- HDRI 1.6 MB → 512 KB (512 × 256; it only feeds a PMREM).
- Tighter clouds (475 → 317 KB) and tufted normal/ARM maps (571 → 309 KB).
- Fabric colour maps no longer ship.
- The night-lights map loads after arrival.
- Every shader is compiled with `compileAsync` before the first visible frame.

The JS bundle (1.1 MB uncompressed, about 300 KB gzipped) is now the largest item. I couldn't measure GPU timings here: SwiftShader compiles shaders in software on the main thread, so its veil time (~20 s) says nothing about a real GPU.
