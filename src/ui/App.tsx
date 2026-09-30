import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { EndCard } from "./EndCard";
import { focusPlaySurface } from "./focus";
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
    { scope: el, dependencies: [index, reduced], revertOnUpdate: true },
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
}: {
  store: HudStore;
  controls: Controls;
  reduced?: boolean;
}) {
  const hud = useSyncExternalStore(store.subscribe, store.get);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Entering a new room restores neutral play focus after the old controls change.
  useLayoutEffect(() => {
    if (hud.opening !== "done" || hud.finished) return;
    const frame = requestAnimationFrame(focusPlaySurface);
    return () => cancelAnimationFrame(frame);
  }, [hud.opening, hud.finished, hud.roomIndex]);
  if (hud.opening !== "done")
    return hud.opening === "title" ? <Title onBegin={controls.begin} /> : null;
  return (
    <div className="ui-shell pointer-events-none fixed inset-0 z-10">
      <h1 className="sr-only">PLEASE HOLD: a tiny zero-gravity workplace comedy</h1>
      <div className="play-hud" inert={hud.finished}>
        <div className="hud-top">
          <TaskCard hud={hud} />
          <div className="hud-utilities">
            <button
              className="guide-replay pointer-events-auto"
              type="button"
              aria-label="Replay the guide"
              onClick={() => {
                controls.replayGuide();
                focusPlaySurface();
              }}
            >
              ?
            </button>
            <RestartButton hud={hud} onRestart={controls.restart} />
            <MuteButton hud={hud} onToggle={controls.toggleMute} />
          </div>
        </div>
        <RoomBanner index={hud.roomIndex} name={hud.roomName} reduced={hud.reduced} />
        <div className="hud-bottom">
          <div className="hud-notes">
            {hud.roomCard && !hud.guidePrompt && (
              <RoomCard
                key={`${hud.roomIndex}-${hud.roomCard.result.roomId}`}
                card={hud.roomCard}
                reduced={hud.reduced}
              />
            )}
            {hud.guidePrompt && !hud.finished ? (
              <Guide hud={hud} controls={controls} />
            ) : (
              !hud.roomCard && <HintBar hint={hud.finished ? null : hud.hint} />
            )}
          </div>
          {!hud.finished && <ActionPad hud={hud} controls={controls} />}
        </div>
      </div>
      {hud.result && (
        <EndCard
          result={hud.result}
          onReplay={controls.replay}
          reduced={hud.reduced}
          sound={<MuteButton hud={hud} onToggle={controls.toggleMute} label />}
        />
      )}
    </div>
  );
}
