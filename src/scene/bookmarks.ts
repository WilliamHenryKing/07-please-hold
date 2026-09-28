import type { Vec } from "../game/types";

/**
 * Fixed camera bookmarks for visual review. Each stages one room and poses the camera, so
 * before/after captures are comparable. The viewport is the capture size the bookmark expects.
 */
export interface Bookmark {
  name: string;
  room: number;
  viewport: { width: number; height: number; scale: number };
  /** null keeps the gameplay framing (including the portrait turn on phones). */
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  } | null;
  /** Where to put the attendant, and what they hold or grip. */
  player: { pos: Vec; aim: Vec; rail?: string; holding?: string };
}

const DESKTOP = { width: 1440, height: 900, scale: 1 };
const PHONE = { width: 390, height: 844, scale: 2 };

export const BOOKMARKS: Bookmark[] = [
  {
    name: "establishing-wide",
    room: 0,
    viewport: DESKTOP,
    camera: null,
    player: { pos: { x: -3.3, y: 0.3 }, aim: { x: 1, y: 0 }, holding: "cushion" },
  },
  {
    name: "hero",
    room: 1,
    viewport: DESKTOP,
    camera: { position: [-6.2, 1.2, 9.5], target: [-1.2, 0.2, -0.6], fov: 32 },
    player: { pos: { x: -2.2, y: 0.6 }, aim: { x: 0.8, y: 0.5 }, holding: "plant" },
  },
  {
    name: "close-up",
    room: 0,
    viewport: DESKTOP,
    camera: { position: [-3.4, 0.9, 2.6], target: [-4.6, 0.25, -0.7], fov: 36 },
    player: { pos: { x: -4.3, y: 0.3 }, aim: { x: 1, y: 0.2 }, rail: "port" },
  },
  {
    name: "grazing-material",
    room: 0,
    viewport: DESKTOP,
    camera: { position: [5.4, 2.6, 1.4], target: [-1.5, 0.8, -1.0], fov: 40 },
    player: { pos: { x: -3.3, y: -1.5 }, aim: { x: 1, y: 0 } },
  },
  {
    name: "porthole",
    room: 0,
    viewport: DESKTOP,
    camera: { position: [0.9, 0.9, 4.2], target: [0.4, 0.5, -1.1], fov: 42 },
    player: { pos: { x: -3.6, y: -2.4 }, aim: { x: 1, y: 0 } },
  },
  {
    name: "conservatory-play",
    room: 1,
    viewport: DESKTOP,
    camera: null,
    player: { pos: { x: -4.7, y: -0.6 }, aim: { x: 0.9, y: 0.45 }, rail: "west" },
  },
  {
    name: "phone-hero",
    room: 2,
    viewport: PHONE,
    camera: null,
    player: { pos: { x: -5.8, y: 0.6 }, aim: { x: 0.9, y: -0.4 }, rail: "west" },
  },
];
