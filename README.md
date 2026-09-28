# PLEASE HOLD

A tiny zero-gravity workplace comedy. You are the new attendant on a small orbital lounge, everything floats, and the guests keep requesting tea.

**Status:** v1 playable, polished after the first local test. Three compact rooms and five tasks, built on one movement rule (shared momentum). There is an in-place first-time hint, 1–3 stars per room (moves and time against par, bests kept in this browser), and a finale in which the call finally connects, followed by a run summary and replay. Desktop and phone layouts, mouse, touch and keyboard, and reduced-motion support. All visuals are procedural three.js. Sound is CC0 music, SFX and ambience with a persistent mute toggle. Not deployed.

## How to play

You move only by pushing off rails or by throwing things. A thrown object goes one way and you recoil the other. A rail stops you dead. Anything you carry makes your push-offs slower.

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Aim | Move the pointer, or arrows / WASD | Drag on the room |
| Throw the held item, push off the rail, or grab what is near | Click or Space | Release the drag, or the red button |
| Grab the nearest rail or item | E or right-click | GRAB |
| Push off the rail while carrying the item | Q | PUSH OFF CARRYING |
| Restart the room | R | RESTART |
| Mute / unmute sound | M | 🔊 button |

Dotted guides preview each move before you commit. Cream dots show where the thrown item (or you) will go. Coral dots show your recoil. A green ring marks whatever is in reach.

Each tidied room shows its stars, moves (throws + push-offs) and time against par and your best. Pars:

| Room | Par moves | Par time |
| --- | --- | --- |
| Arrival Lounge | 3 | 0:25 |
| Conservatory | 7 | 0:55 |
| Galley Ring | 4 | 0:35 |

Three stars means within par on both; two means within double par on both.

On a portrait phone the view turns a quarter so the room fills the screen. There is no "up" in orbit; keyboard aiming follows the screen.

Rooms and tasks:

1. **Arrival Lounge:** you are stranded just beyond a handrail with a cushion. Throw it, drift back to the rail, then get the cushion back onto the sofa. It will return at an inconvenient moment.
2. **Conservatory:** put the fern beneath its lamp and rescue the runaway breakfast tray. The lounge-tidiness notice rotates past a cloud of perfectly intact biscuits.
3. **Galley Ring:** carry the covered tea through the revolving compartment to the guest.

A hatch opens when a room is tidy. The final evaluation reviews your shift.

## Code map

- `src/game/`: pure rules and state (momentum, collisions, rooms, tasks, hints, preview paths, evaluation). Tested in `tests/game.test.ts`.
- `src/scene/`: three.js stage (fixed, slightly tilted camera that turns for portrait; AgX tone mapping; key light and hemisphere light; soft shadows), padded room shell with denting wall pads and lamp light pools, planet shader with porthole parallax, fixtures, actors, atmosphere (dust, contact shadows, drift trail), guides and effects.
- `src/audio/`: the event-to-sound mapping (`cues.ts`, tested) and the Web Audio mixer (`engine.ts`), including the synthesised ring in the finale.
- `src/ui/`: React HUD, room star card, finale, input binding, the HUD store and local best records.
- `src/main.tsx`: wiring and the fixed-step loop. `src/loader.ts` lifts the arrival veil after the first frame.

## Development

```sh
bun install --frozen-lockfile
bun run dev      # http://127.0.0.1:4517/
bun run check    # tsc, Biome, bun test, production build into dist/
bun run preview  # http://127.0.0.1:4617/
bun run e2e      # Playwright: builds, serves the preview and plays room 1 headless
```

The end-to-end test (`e2e/room1.pw.ts`) drives the real keyboard and pointer. It uses the Chromium that Playwright 1.56.1 expects, or any SwiftShader-capable Chromium. It reads game state through a probe exposed only when the URL has `?e2e`. It is not part of `bun run check`, because it needs a browser.

`development/` holds the old smoke harness and is not part of the game.

## Credits

Design, code and all visuals by the project author. Everything visual is authored procedurally in code: geometry, the planet shader, the notice texture and the favicon. The finale's phone ring is synthesised with Web Audio. Text uses the system font stack. Built with three.js, React, GSAP and Tailwind CSS (see `package.json`).

### Audio (all CC0 1.0, public domain)

Sound starts on the first click, tap or key press. The files load after that and total about 2 MB in `public/audio/`. The game pauses audio while the tab is hidden, ducks the music under jingles, and remembers the mute setting (M or the speaker button).

| File(s) in `public/audio/` | Use | Source | Author | Licence |
| --- | --- | --- | --- | --- |
| `hold-music.mp3` (was `Elevator.mp3`) | Background music | [opengameart.org/content/elevator-music](https://opengameart.org/content/elevator-music) | Pro Sensory | CC0 |
| `throw-0..2.ogg` (`impactSoft_medium_000..002`), `catch.ogg` (`impactSoft_medium_003`), `push-0..1.ogg` (`impactSoft_heavy_000..001`), `bump-0..1.ogg` (`impactSoft_heavy_002..003`), `rail-0..1.ogg` (`impactMetal_light_000..001`), `tap-0..2.ogg` (`impactGeneric_light_000..002`), `bonk.ogg` (`impactPunch_medium_000`) | Throws, catches, push-offs, padded bumps, rail grabs, item knocks, bonks | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney (kenney.nl) | CC0 |
| `place.ogg` (`confirmation_001`), `restart.ogg` (`back_002`), `toggle.ogg` (`toggle_001`) | Delivery, room restart, mute toggle | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney (kenney.nl) | CC0 |
| `task.ogg` (`jingles_PIZZI04`), `done.ogg` (`jingles_SAX07`) | Task complete, end of shift | [Kenney Music Jingles](https://kenney.nl/assets/music-jingles) | Kenney (kenney.nl) | CC0 |
| `hatch.ogg` (`doorOpen_000`), `room.ogg` (`doorClose_000`), `hum.ogg` (`spaceEngineLow_002`), `revolve.ogg` (`engineCircular_000`) | Hatch opening, entering a room, station hum ambience, revolving-compartment loop | [Kenney Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) | Kenney (kenney.nl) | CC0 |

The Kenney pack licence files state "Creative Commons Zero, CC0". The OpenGameArt page lists the licence as CC0. No attribution is required; it is given here anyway.
