import type { RoomDef } from "./types";
import { v } from "./vec";

/** Three compact rooms, five tasks. Rails sit on the back wall; the attendant floats in front. */
export const ROOMS: RoomDef[] = [
  {
    id: "arrival",
    name: "Arrival Lounge",
    width: 12,
    height: 8,
    start: { pos: v(-3.3, 0.3), holding: "cushion" },
    rails: [
      { id: "port", a: v(-4.9, -0.9), b: v(-4.9, 1.4) },
      { id: "starboard", a: v(4.9, -1), b: v(4.9, 1.2) },
      { id: "ceiling", a: v(-1.2, 3.25), b: v(1.2, 3.25) },
    ],
    items: [{ id: "cushion", kind: "cushion", label: "cushion", pos: v(-2.9, 0.3) }],
    slots: [{ id: "sofa", item: "cushion", pos: v(4.4, -2.85), radius: 0.8, label: "sofa" }],
    tasks: [
      { kind: "reach", rail: "port", text: "Throw the cushion, drift back and grab the handrail" },
      { kind: "deliver", slot: "sofa", text: "Put the cushion back on the sofa" },
    ],
    hatch: v(6, 2.4),
  },
  {
    id: "conservatory",
    name: "Conservatory",
    width: 12,
    height: 8,
    start: { pos: v(-4.7, -0.6), rail: "west" },
    rails: [
      { id: "west", a: v(-5.3, -2), b: v(-5.3, 1) },
      { id: "ceiling", a: v(-3.6, 3.25), b: v(-2, 3.25) },
      { id: "floor", a: v(-1.2, -3.25), b: v(1.2, -3.25) },
      { id: "east", a: v(5.3, -0.4), b: v(5.3, 1.9) },
    ],
    items: [
      { id: "plant", kind: "plant", label: "fern", pos: v(-3.4, -2.5), vel: v(0.12, 0.05) },
      { id: "tray", kind: "tray", label: "breakfast tray", pos: v(2, 1), vel: v(-2.2, 1.5) },
    ],
    slots: [
      { id: "lamp", item: "plant", pos: v(0, 1.85), radius: 0.75, label: "lamp" },
      { id: "table", item: "tray", pos: v(4.4, -2.8), radius: 0.8, label: "table" },
    ],
    tasks: [
      { kind: "deliver", slot: "lamp", text: "Put the fern beneath its lamp" },
      { kind: "deliver", slot: "table", text: "Rescue the runaway breakfast tray" },
    ],
    hatch: v(6, 2.5),
  },
  {
    id: "galley",
    name: "Galley Ring",
    width: 14,
    height: 8,
    start: { pos: v(-5.8, 0.6), rail: "west" },
    rails: [
      { id: "west", a: v(-6.4, -1), b: v(-6.4, 2) },
      { id: "pantry", a: v(-6.1, -3.35), b: v(-4.5, -3.35) },
      { id: "east", a: v(6.4, -0.6), b: v(6.4, 2.2) },
      { id: "service", a: v(4.5, 3.35), b: v(6.1, 3.35) },
    ],
    items: [{ id: "flask", kind: "flask", label: "covered tea", pos: v(-5.1, -2.3) }],
    slots: [{ id: "guest", item: "flask", pos: v(5.5, -2.6), radius: 0.8, label: "guest" }],
    spinner: { centre: v(0, 0), reach: 3.3, speed: 0.3, angle: Math.PI / 2 },
    tasks: [
      {
        kind: "deliver",
        slot: "guest",
        text: "Deliver the covered tea through the revolving compartment",
      },
    ],
  },
];

export const TOTAL_TASKS = ROOMS.reduce((n, r) => n + r.tasks.length, 0);
