import type { Action } from "../game/actions";
import { focusPlaySurface } from "./focus";
import type { HudSnapshot } from "./store";

export interface Controls {
  begin: () => void;
  skipGuide: () => void;
  replayGuide: () => void;
  primary: () => void;
  grab: () => void;
  push: () => void;
  restart: () => void;
  replay: () => void;
  toggleMute: () => void;
}

const PRIMARY_LABEL: Record<Action, string> = {
  throw: "Throw",
  push: "Push off",
  grab: "Grab",
  none: "Drifting…",
};

const base =
  "hud-button rounded-2xl border-2 border-[#3a2a22]/15 px-4 py-3 font-semibold shadow-[0_4px_0_rgba(58,42,34,0.25)] transition active:translate-y-0.5 active:shadow-none disabled:opacity-45 disabled:shadow-none";
const btn = `${base} bg-[#f4ead8] text-[#3a2a22]`;
const hot = `${base} bg-[#8c3b3b] text-[#fff4dc]`;

function Key({ k, show }: { k: string; show: boolean }) {
  if (!show) return null;
  return (
    <kbd className="ml-2 rounded-md bg-current/10 px-1.5 py-0.5 font-mono text-xs opacity-75">
      {k}
    </kbd>
  );
}

export function TaskCard({ hud }: { hud: HudSnapshot }) {
  return (
    <section
      aria-label="Current room and tasks"
      data-keyboard-scroll
      // biome-ignore lint/a11y/noNoninteractiveTabindex: The bounded task list must be keyboard scrollable on short screens.
      tabIndex={0}
      className="task-card pointer-events-auto rounded-2xl bg-[#f4ead8]/92 px-4 py-3 text-[#3a2a22] shadow-lg backdrop-blur-sm"
    >
      <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-[#8c3b3b]">
        Room {hud.roomIndex + 1} of {hud.roomCount} · {hud.roomName}
      </p>
      <ul className="mt-1.5 space-y-1 text-sm leading-snug">
        {hud.tasks.map((t) => (
          <li
            key={t.text}
            className={`flex gap-2 ${t.done ? "text-[#3a2a22]/50 line-through" : ""}`}
          >
            <span aria-hidden="true" className={t.done ? "text-[#4f8a4b]" : "text-[#b0894a]"}>
              {t.done ? "✓" : "○"}
            </span>
            <span>
              <span className="sr-only">{t.done ? "Done: " : "To do: "}</span>
              {t.text}
            </span>
          </li>
        ))}
        {hud.hatchOpen && (
          <li className="flex gap-2 font-semibold text-[#4f8a4b]">
            <span aria-hidden="true">→</span>
            <span>Hatch open: float through it</span>
          </li>
        )}
      </ul>
    </section>
  );
}

export function RestartButton({ hud, onRestart }: { hud: HudSnapshot; onRestart: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        onRestart();
        focusPlaySurface();
      }}
      disabled={hud.finished}
      aria-label="Restart this room (R)"
      className={`${btn} restart-button pointer-events-auto px-3 py-2 text-sm`}
    >
      ↺ Restart
      <Key k="R" show={hud.mode === "pointer"} />
    </button>
  );
}

export function MuteButton({
  hud,
  onToggle,
  label = false,
}: {
  hud: HudSnapshot;
  onToggle: () => void;
  label?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={hud.muted}
      aria-label={hud.muted ? "Sound off. Turn sound on (M)" : "Sound on. Mute (M)"}
      className={`${btn} sound-button pointer-events-auto px-3 py-2 text-sm`}
    >
      <span aria-hidden="true">{hud.muted ? "🔇" : "🔊"}</span>
      {label && <span>Sound {hud.muted ? "off" : "on"}</span>}
      <Key k="M" show={hud.mode === "pointer"} />
    </button>
  );
}

export function HintBar({ hint }: { hint: string | null }) {
  return (
    <p
      aria-live="polite"
      className={`hint-bar rounded-full bg-[#1d2130]/80 px-4 py-2 text-center text-sm text-[#fff4dc] shadow-lg transition-opacity duration-300 ${hint ? "opacity-100" : "opacity-0"}`}
    >
      {hint ?? " "}
    </p>
  );
}

export function ActionPad({ hud, controls }: { hud: HudSnapshot; controls: Controls }) {
  const keys = hud.mode === "pointer";
  return (
    <fieldset
      aria-label="Actions"
      className="action-pad pointer-events-auto m-0 flex min-w-0 flex-wrap justify-end gap-2 border-0 p-0"
    >
      {hud.canPush && (
        <button
          type="button"
          className={btn}
          onClick={() => {
            controls.push();
            focusPlaySurface();
          }}
          aria-label="Push off carrying the item (Q)"
        >
          Push off carrying
          <Key k="Q" show={keys} />
        </button>
      )}
      <button
        type="button"
        className={btn}
        onClick={() => {
          controls.grab();
          focusPlaySurface();
        }}
        disabled={!hud.canGrab}
        aria-label="Grab the nearest rail or item (E)"
      >
        Grab
        <Key k="E" show={keys} />
      </button>
      <button
        type="button"
        className={`${hot} min-w-[7.5rem]`}
        onClick={() => {
          controls.primary();
          focusPlaySurface();
        }}
        disabled={hud.primary === "none"}
        aria-label={`${PRIMARY_LABEL[hud.primary]} toward your aim (Space)`}
      >
        {PRIMARY_LABEL[hud.primary]}
        <Key k="Space" show={keys} />
      </button>
    </fieldset>
  );
}
