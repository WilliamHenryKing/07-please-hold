# PLEASE HOLD

A tiny zero-gravity workplace comedy. You are the new attendant on a small orbital lounge, everything floats, and the guests keep requesting tea.

**Status:** v1 playable. Three compact rooms and five tasks, built on one movement rule (shared momentum). There is an in-place first-time hint, an end-of-shift evaluation, and replay. Desktop and phone layouts, mouse, touch and keyboard, and reduced-motion support. All visuals are procedural three.js: no external assets. Not deployed.

## How to play

You move only by pushing off rails or by throwing things. A thrown object goes one way and you recoil the other. A rail stops you dead. Anything you carry makes your push-offs slower.

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Aim | Move the pointer, or arrows / WASD | Drag on the room |
| Throw the held item, push off the rail, or grab what is near | Click or Space | Release the drag, or the red button |
| Grab the nearest rail or item | E or right-click | GRAB |
| Push off the rail while carrying the item | Q | PUSH OFF CARRYING |
| Restart the room | R | RESTART |

Dotted guides preview each move before you commit. Cream dots show where the thrown item (or you) will go. Coral dots show your recoil. A green ring marks whatever is in reach.

Rooms and tasks:

1. **Arrival Lounge:** you are stranded just beyond a handrail with a cushion. Throw it, drift back to the rail, then get the cushion back onto the sofa. It will return at an inconvenient moment.
2. **Conservatory:** put the fern beneath its lamp and rescue the runaway breakfast tray. The lounge-tidiness notice rotates past a cloud of perfectly intact biscuits.
3. **Galley Ring:** carry the covered tea through the revolving compartment to the guest.

A hatch opens when a room is tidy. The final evaluation reviews your shift.

## Code map

- `src/game/`: pure rules and state (momentum, collisions, rooms, tasks, hints, preview paths, evaluation). Tested in `tests/game.test.ts`.
- `src/scene/`: three.js stage (fixed camera, AgX tone mapping, key light and hemisphere light, soft shadows), padded room shell, planet shader, fixtures, actors, guides and effects.
- `src/ui/`: React HUD, end card, input binding and the HUD store.
- `src/main.tsx`: wiring and the fixed-step loop. `src/loader.ts` lifts the arrival veil after the first frame.

## Development

```sh
bun install --frozen-lockfile
bun run dev      # http://127.0.0.1:4517/
bun run check    # tsc, Biome, bun test, production build into dist/
bun run preview  # http://127.0.0.1:4617/
```

`development/` holds the old smoke harness and is not part of the game.

## Credits

Design, code and all visuals by the project author. Everything is authored procedurally in code: geometry, the planet shader and the notice texture. No third-party art, audio or fonts are used; text uses the system font stack. Built with three.js, React, GSAP and Tailwind CSS (see `package.json`).
