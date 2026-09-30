import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, useSyncExternalStore } from "react";
import { EndCard } from "./EndCard";
import { ActionPad, type Controls, HintBar, MuteButton, RestartButton, TaskCard } from "./Hud";
import { Guide, Title } from "./Opening";
import { RoomCard } from "./RoomCard";
import type { HudStore } from "./store";

/** Room title that floats past whenever a new room begins. */
function RoomBanner({ index, name, reduced }: { index: number; name: string; reduced: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!el.current) return;
      const tl = gsap.timeline();
      tl.fromTo(el.current, reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }, {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: reduced ? 0.2 : 0.6,
        ease: "power2.out",
      }).to(el.current, { opacity: 0, duration: 0.6, delay: 1.6 });
    },
    { dependencies: [index] },
  );
  return (
    <div
      ref={el}
      data-room-banner
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-[44%] z-10 sm:top-[40%] text-center opacity-0"
    >
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#e3c7a1]">
        Room {index + 1}
      </p>
      <p className="text-4xl font-extrabold text-[#fff4dc] drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
        {name}
      </p>
    </div>
  );
}

export function App({
  store,
  controls,
  reduced,
}: {
  store: HudStore;
  controls: Controls;
  reduced: boolean;
}) {
  const hud = useSyncExternalStore(store.subscribe, store.get);
  if (hud.opening !== "done")
    return hud.opening === "title" ? <Title onBegin={controls.begin} /> : null;
  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-5">
      <h1 className="sr-only">PLEASE HOLD: a tiny zero-gravity workplace comedy</h1>
      <div className="flex items-start justify-between gap-2">
        <TaskCard hud={hud} />
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-start">
          <button
            className="guide-replay pointer-events-auto"
            type="button"
            aria-label="Replay the guide"
            onClick={controls.replayGuide}
          >
            ?
          </button>
          <RestartButton hud={hud} onRestart={controls.restart} />
          <MuteButton hud={hud} onToggle={controls.toggleMute} />
        </div>
      </div>
      <RoomBanner index={hud.roomIndex} name={hud.roomName} reduced={reduced} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-1">
          {hud.roomCard && (
            <RoomCard
              key={`${hud.roomIndex}-${hud.roomCard.result.roomId}`}
              card={hud.roomCard}
              reduced={reduced}
            />
          )}
          {hud.guide >= 0 && !hud.finished ? (
            <Guide hud={hud} controls={controls} />
          ) : (
            <HintBar hint={hud.finished ? null : hud.hint} />
          )}
        </div>
        {!hud.finished && <ActionPad hud={hud} controls={controls} />}
      </div>
      {hud.result && <EndCard result={hud.result} onReplay={controls.replay} reduced={reduced} />}
    </div>
  );
}
