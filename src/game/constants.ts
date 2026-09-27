import type { ItemKind } from "./types";

/** The one movement rule: momentum is shared. Every number the rules use lives here. */
export const PLAYER_MASS = 1;
export const PLAYER_RADIUS = 0.42;
/** Impulse delivered by a throw; the item gains J/m (capped), the attendant loses the same momentum. */
export const THROW_IMPULSE = 2.6;
export const THROW_MAX_SPEED = 6.5;
/** Impulse delivered by pushing off a rail, shared with whatever you carry. */
export const PUSH_IMPULSE = 4.2;
/** Centre-to-rail distance within which a rail can be grabbed. */
export const RAIL_REACH = 1.05;
/** Gap between the attendant's edge and an item's edge within which it can be grabbed. */
export const ITEM_REACH = 0.75;
export const PLAYER_RESTITUTION = 0.55;
export const ITEM_RESTITUTION = 0.8;
/** Gentle linear drag per second so the room settles instead of pinging forever. */
export const PLAYER_DRAG = 0.03;
export const ITEM_DRAG = 0.05;
export const SPINNER_THICKNESS = 0.14;
export const SPINNER_HUB = 0.38;
export const HATCH_RADIUS = 0.95;
export const GHOST_TIME = 0.35;
/** Wall hits softer than this are not counted as bumps. */
export const BUMP_SPEED = 1.4;
export const STRANDED_SPEED = 0.35;

export const ITEM_SPECS: Record<ItemKind, { mass: number; radius: number }> = {
  cushion: { mass: 0.4, radius: 0.34 },
  plant: { mass: 1.1, radius: 0.42 },
  tray: { mass: 0.6, radius: 0.38 },
  flask: { mass: 0.7, radius: 0.3 },
};
