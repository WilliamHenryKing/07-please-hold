import { ITEM_SPECS, PLAYER_MASS, PLAYER_RADIUS } from "./constants";
import { ROOMS } from "./rooms";
import type { GameState, Item, Player, RoomDef, Stats } from "./types";
import { add, scale } from "./vec";

export const emptyStats = (): Stats => ({
  time: 0,
  throws: 0,
  pushes: 0,
  grabs: 0,
  bumps: 0,
  bonks: 0,
  restarts: 0,
});

/** Where a held item sits: just in front of the attendant, along the aim. */
export function handPosition(player: Player, item: Item) {
  return add(player.pos, scale(player.aim, player.radius + item.radius * 0.7));
}

function buildRoom(room: RoomDef) {
  const player: Player = {
    pos: { ...room.start.pos },
    vel: { x: 0, y: 0 },
    radius: PLAYER_RADIUS,
    mass: PLAYER_MASS,
    rail: room.start.rail ?? null,
    holding: room.start.holding ?? null,
    aim: { x: 1, y: 0 },
  };
  const items: Item[] = room.items.map((def) => ({
    id: def.id,
    kind: def.kind,
    label: def.label,
    pos: { ...def.pos },
    vel: def.vel ? { ...def.vel } : { x: 0, y: 0 },
    radius: ITEM_SPECS[def.kind].radius,
    mass: ITEM_SPECS[def.kind].mass,
    held: def.id === player.holding,
    placed: null,
    handled: def.id === player.holding,
    ghost: 0,
  }));
  for (const item of items) if (item.held) item.pos = handPosition(player, item);
  return { player, items };
}

export function loadRoom(state: GameState, index: number, rooms: RoomDef[] = ROOMS): void {
  const room = rooms[index];
  if (!room) throw new Error(`No room ${index}`);
  const { player, items } = buildRoom(room);
  state.roomIndex = index;
  state.room = room;
  state.player = player;
  state.items = items;
  state.done = room.tasks.map(() => false);
  state.hatchOpen = false;
  state.spinnerAngle = room.spinner?.angle ?? 0;
  state.phase = "playing";
  state.events.push({ type: "room", index });
}

export function createGame(rooms: RoomDef[] = ROOMS, startRoom = 0): GameState {
  const first = rooms[startRoom];
  if (!first) throw new Error("No rooms");
  const state = {
    roomIndex: startRoom,
    room: first,
    phase: "playing",
    player: buildRoom(first).player,
    items: [],
    done: [],
    hatchOpen: false,
    spinnerAngle: 0,
    stats: emptyStats(),
    events: [],
  } as GameState;
  loadRoom(state, startRoom, rooms);
  return state;
}

export const findItem = (state: GameState, id: string | null) =>
  id ? state.items.find((i) => i.id === id) : undefined;

export const heldItem = (state: GameState) => findItem(state, state.player.holding);

export const isLastRoom = (state: GameState, rooms: RoomDef[] = ROOMS) =>
  state.roomIndex >= rooms.length - 1;
