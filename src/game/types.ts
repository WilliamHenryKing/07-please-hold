// Pure data shapes for PLEASE HOLD. The world is a flat side-view plane: x right, y up,
// origin at the centre of the room. Depth only exists in the renderer.

export interface Vec {
  x: number;
  y: number;
}

export type ItemKind = "cushion" | "plant" | "tray" | "flask";

export interface RailDef {
  id: string;
  a: Vec;
  b: Vec;
}

export interface ItemDef {
  id: string;
  kind: ItemKind;
  label: string;
  pos: Vec;
  vel?: Vec;
}

export interface SlotDef {
  id: string;
  item: string;
  pos: Vec;
  radius: number;
  label: string;
}

/** A slowly revolving divider: a bar through `centre`, `reach` long on each side. */
export interface SpinnerDef {
  centre: Vec;
  reach: number;
  speed: number;
  angle: number;
}

export type TaskDef =
  | { kind: "reach"; rail: string; text: string }
  | { kind: "deliver"; slot: string; text: string };

export interface RoomDef {
  id: string;
  name: string;
  width: number;
  height: number;
  start: { pos: Vec; rail?: string; holding?: string };
  rails: RailDef[];
  items: ItemDef[];
  slots: SlotDef[];
  spinner?: SpinnerDef;
  tasks: TaskDef[];
  /** Exit hatch on a wall; opens when every task in the room is done. Absent in the last room. */
  hatch?: Vec;
}

export interface Body {
  pos: Vec;
  vel: Vec;
  radius: number;
  mass: number;
}

export interface Item extends Body {
  id: string;
  kind: ItemKind;
  label: string;
  held: boolean;
  placed: string | null;
  /** True once the attendant has touched it: deliveries only count for handled items. */
  handled: boolean;
  /** Seconds during which the item passes through the attendant (just thrown). */
  ghost: number;
}

export interface Player extends Body {
  rail: string | null;
  holding: string | null;
  aim: Vec;
}

export interface Stats {
  time: number;
  throws: number;
  pushes: number;
  grabs: number;
  bumps: number;
  bonks: number;
  restarts: number;
}

export type GameEvent =
  | { type: "throw"; pos: Vec; dir: Vec; item: string }
  | { type: "push"; pos: Vec; dir: Vec }
  | { type: "grab"; pos: Vec; target: "rail" | "item"; id: string }
  | { type: "bump"; pos: Vec; strength: number; who: "player" | "item" }
  | { type: "bonk"; pos: Vec }
  | { type: "place"; pos: Vec; item: string; slot: string }
  | { type: "task"; index: number }
  | { type: "hatch" }
  | { type: "room"; index: number }
  | { type: "done" };

export type Phase = "playing" | "done";

export interface GameState {
  roomIndex: number;
  room: RoomDef;
  phase: Phase;
  player: Player;
  items: Item[];
  done: boolean[];
  hatchOpen: boolean;
  spinnerAngle: number;
  stats: Stats;
  events: GameEvent[];
}
