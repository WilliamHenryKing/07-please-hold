import { useEffect, useRef } from "react";
import type { Controls } from "./Hud";
import type { HudSnapshot } from "./store";

export function Title({ onBegin }: { onBegin: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <section className="opening" aria-labelledby="opening-title">
      <div className="opening-copy">
        <p className="rise eyebrow">Orbital hospitality · Your first shift</p>
        <h1 className="rise" id="opening-title">
          Please
          <br />
          <em>hold.</em>
        </h1>
        <p className="rise premise">
          Your call is important.
          <br />
          Your furniture is escaping.
        </p>
        <div className="rise">
          <button ref={button} type="button" className="intro-button" onClick={onBegin}>
            Start the shift
          </button>
          <span className="enter-note">or press Enter</span>
        </div>
      </div>
    </section>
  );
}

export function Guide({ hud, controls }: { hud: HudSnapshot; controls: Controls }) {
  const touch = hud.mode === "touch";
  const steps = [
    [
      "A cushion is an engine",
      `${touch ? "Drag toward the far wall and release" : "Aim right with the pointer or arrow keys; click or press Space"} to throw. The cushion goes one way; you drift the other.`,
    ],
    [
      "Catch your breath",
      `${touch ? "Tap Grab" : "Press E or tap Grab"} when the rail is within the green ring. Holding a rail stops you drifting.`,
    ],
    [
      "Nothing stays lost",
      `The cushion bounces back from the wall. Wait for it to come within reach, then ${touch ? "tap Grab" : "press E"}. Restart is always available.`,
    ],
    [
      "Return it to the sofa",
      `Aim at the sofa's glowing ring and throw the cushion. Anchored to a rail, you will not recoil. Tidying the room opens the hatch.`,
    ],
  ];
  return (
    <aside className="shift-guide" aria-label="Shift guide" aria-live="polite">
      <p className="eyebrow">
        {hud.guide + 1}/4 · {steps[hud.guide]?.[0]}
      </p>
      <p>{steps[hud.guide]?.[1]}</p>
      <div className="guide-foot">
        <span aria-hidden="true">{steps.map((_, i) => (i === hud.guide ? "● " : "○ "))}</span>
        <button type="button" onClick={controls.skipGuide}>
          Skip the guide
        </button>
      </div>
    </aside>
  );
}
