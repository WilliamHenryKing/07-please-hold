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
