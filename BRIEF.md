# PLEASE HOLD — v1 brief for a cloud build session

You are building this project's v1 in one focused session. Ship a small, polished, complete experience — not a prototype and not a sprawling one. Read this brief once, write a plan of 5–10 lines, then build. Stop when the definition of done is met.

## The idea

**07 — PLEASE HOLD.** Build a coherent push/grab/throw movement rule in stable, readable zero-gravity rooms. Develop three compact layouts and four or five tasks involving objects, rails and destinations. Use warm orbital domesticity, visible recoil and quick recovery. Begin with crossing one room using a thrown object, grabbing a rail and retrieving the object. Avoid making the camera itself disorienting.

### G4. PLEASE HOLD

**A tiny zero-gravity workplace comedy.**

You are the new attendant on a small orbital lounge. Everything floats. The guests keep requesting tea.

**What you do:** move by pushing off rails or throwing objects. A thrown object goes one way; you recoil the other way. Grab rails to stop, retrieve drifting items and guide them to their destinations.

**First playable moment:** you are stranded just beyond a handrail with a cushion in your hand. Throw it and drift gently within reach of the rail. The cushion bounces off the far wall and returns at an inconvenient moment.

**Depth:** object mass, direction and the choice of where to stop create short navigation puzzles. The useful item can also be your propulsion, which creates a clear tradeoff.

**Missions:** put a plant beneath its lamp, rescue a runaway breakfast tray and deliver a covered tea flask through a slowly rotating compartment. Use stylised contained liquids rather than attempting a full fluid simulation.

**Humour:** a “PLEASE KEEP THE LOUNGE TIDY” notice rotates past a cloud of perfectly intact biscuits. The final evaluation praises your “dynamic approach to furniture”.

**Small complete version:** three compact room layouts, four or five short tasks, simple grab/push/throw controls and one consistent movement rule.

**Visual distinction:** warm orbital domesticity: padded panels, soft lamps, rounded windows and a huge slow-moving planet outside.

**What would ruin it:** uncontrolled six-axis camera motion, sluggish recovery or a room so cluttered that the consequences cannot be predicted. Use a stable camera and constrained spaces.

**First proof:** cross one room using a throw, catch a rail and recover the object. The basic movement must be amusing and controllable.

Art direction: **PLEASE HOLD:** rounded domestic space interiors, padded surfaces, soft lamps and warm orbital light.

## Definition of done (v1)

1. One focused scene delivering the idea above, with a complete loop: start → core interaction → a visible result or ending → replay. A short first-time hint teaches the controls in place.
2. Arrival loader: keep the veil in `index.html` and `src/loader.ts`; restyle the veil to the art direction and call `worldReady()` after the first rendered frame.
3. Desktop (1440×900) and phone (390×844) layouts; mouse, touch and keyboard; honour `prefers-reduced-motion`; visible focus and labelled controls.
4. `bun run check` passes: strict `tsc`, Biome, `bun test`, production build into `dist/`.
5. Unit tests of the game rules (pure TypeScript, no DOM) replace `tests/scaffold.test.ts`.
6. `README.md`: one status paragraph, how to play, and credits for any asset used.
No extra modes, settings screens, accounts, leaderboards, backends, analytics or network calls.

## Technical rules

- The stack is installed and pinned: Vite, React, strict TypeScript, three.js 0.186 (direct, no React Three Fiber), GSAP, Tailwind v4, Biome, Bun. Add a dependency only if essential, pinned exactly.
- `bun run dev` serves the real app (`index.html` → `src/main.tsx`); `bun run build` builds it into `dist/`. `development/` is old tooling: leave it alone.
- Single responsibility: `src/game/` pure rules and state (tested), `src/scene/` three.js scene, camera, lights and meshes, `src/ui/` React HUD and panels, `src/main.tsx` wiring. Files under ~300 lines.
- Visuals: author forms procedurally in code (geometry, instancing, small shaders where they clearly help), AgX or ACES tone mapping, one key light plus hemisphere or environment light, soft shadows where cheap, a cohesive palette and strong silhouettes. Type: a system font stack. External assets only if CC0 or public domain, with the source in README.
- Performance: 60 fps on a mid laptop; cap devicePixelRatio at 2.
- Do not change `wrangler.jsonc`, deploy or publish anything.

## Working method

- There is no GPU here. Do not loop on screenshots: at most two headless checks (desktop, phone) if Chromium is available (software WebGL is fine).
- Commit in small, clear steps. Finish with a message: what was built, how to play, known gaps.
