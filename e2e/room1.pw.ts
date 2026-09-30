import { expect, type Page, test } from "@playwright/test";
import { aimAt, itemInReach, railInReach, throwHeld } from "../src/game/actions";
import { ITEM_REACH } from "../src/game/constants";
import { step } from "../src/game/step";
import type { GameState } from "../src/game/types";
import { aim, read, readableGuide, ready, shot } from "./support";

const wait = async (page: Page, predicate: (state: GameState) => boolean, timeout = 30_000) => {
  await expect
    .poll(async () => predicate(await read(page)), { timeout, intervals: [25] })
    .toBe(true);
};
async function catchItem(page: Page, id: string) {
  await wait(page, (state) => {
    const item = itemInReach(state);
    return (
      item?.id === id &&
      Math.hypot(item.pos.x - state.player.pos.x, item.pos.y - state.player.pos.y) -
        item.radius -
        state.player.radius <=
        ITEM_REACH - 0.12
    );
  });
  await page.keyboard.press("e");
  // A nearby rail has priority; once anchored, the second grab recovers the item.
  if (!(await read(page)).player.holding) await page.keyboard.press("e");
  expect((await read(page)).player.holding).toBe(id);
}
async function throwAt(page: Page, x: number, y: number) {
  await aim(page, x, y);
  await page.keyboard.press("Space");
}
async function pushAt(page: Page, x: number, y: number) {
  await aim(page, x, y);
  await page.keyboard.press("q");
}
async function pushVertical(page: Page, key: "ArrowDown" | "ArrowUp") {
  await page.keyboard.down(key);
  await page.keyboard.press("q");
  await page.keyboard.up(key);
}
function clearTeaThrow(state: GameState) {
  if (state.spinnerAngle < 2.4) return false;
  // Read-only planning tolerates screenshot/driver delay; only actual keys move the live game.
  const forecast = structuredClone(state);
  aimAt(forecast, { x: 5.5, y: -2.6 });
  throwHeld(forecast);
  for (let tick = 0; tick < 720 && forecast.phase === "playing"; tick++) step(forecast);
  return forecast.phase === "done";
}

test("the complete shift: five tasks, three rooms, every guide step, ending and replay", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?e2e");
  await ready(page);
  await page.locator("#stage").focus();
  await readableGuide(page);
  await page.keyboard.down("ArrowRight");
  await page.keyboard.press("Space");
  await page.keyboard.up("ArrowRight");
  await expect(page.getByLabel("Shift guide", { exact: true })).toContainText("2/4");
  await wait(page, (state) => !!railInReach(state));
  await page.keyboard.press("e");
  await expect(page.getByLabel("Shift guide", { exact: true })).toContainText("3/4");
  await catchItem(page, "cushion");
  await expect(page.getByLabel("Shift guide", { exact: true })).toContainText("4/4");
  await shot(page, "cushion-recovered");
  await throwAt(page, 4.4, -2.85);
  await wait(page, (state) => state.hatchOpen);
  await expect(page.getByText("Arrival Lounge tidy")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("please-hold:guide"))).toBe("seen");
  await pushAt(page, 6, 2.4);
  await wait(page, (state) => state.roomIndex === 1);
  await expect(page.getByText(/Room 2 of 3/)).toBeVisible();
  await pushVertical(page, "ArrowDown");
  await catchItem(page, "plant");
  expect((await read(page)).player.rail).toBe("west");
  await page.getByRole("button", { name: "Replay the guide", exact: true }).click();
  await expect(page.getByLabel("Shift guide", { exact: true })).toContainText("Deliver the fern");
  await expect(page.getByLabel("Shift guide", { exact: true })).not.toContainText(/cushion|sofa/);
  await throwAt(page, 0, 1.85);
  await wait(page, (state) => !!state.items.find((item) => item.id === "plant")?.placed);
  await shot(page, "fern-delivered");
  await pushVertical(page, "ArrowUp");
  await wait(page, (state) => state.player.pos.y >= 0);
  await page.keyboard.press("e");
  expect((await read(page)).player.rail).toBe("west");
  await catchItem(page, "tray");
  await throwAt(page, 4.4, -2.8);
  await wait(page, (state) => state.hatchOpen);
  await shot(page, "conservatory-tidy");
  await pushAt(page, 6, 2.5);
  await wait(page, (state) => state.roomIndex === 2);
  await pushVertical(page, "ArrowDown");
  await catchItem(page, "flask");
  expect((await read(page)).player.rail).toBe("west");
  await page.getByRole("button", { name: "Replay the guide", exact: true }).click();
  await expect(page.getByLabel("Shift guide", { exact: true })).toContainText(
    "Deliver the covered tea",
  );
  await expect(page.getByLabel("Shift guide", { exact: true })).not.toContainText(/cushion|sofa/);
  await shot(page, "galley-tea");
  await wait(page, clearTeaThrow);
  await throwAt(page, 5.5, -2.6);
  await wait(page, (state) => state.phase === "done");
  const completed = await read(page);
  expect(completed.results.map((r) => r.roomId)).toEqual(["arrival", "conservatory", "galley"]);
  expect(completed.done.every(Boolean)).toBe(true);
  expect(completed.stats.restarts).toBe(0);
  await expect(page.getByRole("button", { name: "Start another shift", exact: true })).toBeVisible({
    timeout: 10_000,
  });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeFocused();
  expect(await dialog.evaluate((el) => el.scrollTop)).toBe(0);
  await shot(page, "ending");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: /Sound/ })).toBeFocused();
  for (const [width, height] of [
    [390, 844],
    [568, 320],
    [320, 568],
  ] as const) {
    await page.setViewportSize({ width, height });
    await dialog.evaluate((el) => {
      (el as HTMLElement).focus();
      el.scrollTop = 0;
    });
    await shot(page, `ending-${width}`);
  }
  const sound = dialog.getByRole("button", { name: /Sound/ });
  const replay = dialog.getByRole("button", { name: "Start another shift", exact: true });
  await page.keyboard.press("Tab");
  await expect(sound).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(replay).toBeFocused();
  await expect(replay).toBeInViewport();
  await page.keyboard.press("Shift+Tab");
  await expect(sound).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  // Native Chrome dialogs allow browser-chrome focus at the boundary, not background UI.
  expect(await page.evaluate(() => document.hasFocus())).toBe(false);
  await page.keyboard.press("Shift+Tab");
  await expect(replay).toBeFocused();
  await expect(replay).toBeInViewport();
  await shot(page, "ending-keyboard-replay");
  await page.getByRole("button", { name: "Start another shift", exact: true }).evaluate((el) => {
    (el as HTMLButtonElement).click();
    (el as HTMLButtonElement).click();
  });
  await wait(page, (state) => state.roomIndex === 0 && state.results.length === 0);
  await expect(page.locator("#stage")).toBeFocused();
  await page.waitForTimeout(3300);
  expect((await read(page)).phase).toBe("playing");
  expect((await read(page)).stats.throws).toBe(0);
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("render failure closes the final modal and focuses recovery", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?e2e");
  await ready(page);
  // A shipped capture bookmark isolates recovery; full progression is tested above.
  await page.evaluate(() =>
    (
      window as unknown as { __VISUAL_TEST__: { setBookmark(name: string): boolean } }
    ).__VISUAL_TEST__.setBookmark("phone-hero"),
  );
  await page.locator("#stage").focus();
  await pushVertical(page, "ArrowDown");
  await catchItem(page, "flask");
  await wait(page, clearTeaThrow);
  await throwAt(page, 5.5, -2.6);
  await wait(page, (state) => state.phase === "done");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>("#stage")?.getContext("webgl2");
    if (!gl) throw new Error("No game WebGL context");
    const draw = gl.drawElements;
    gl.drawElements = () => {
      gl.drawElements = draw;
      throw new Error("Injected render failure");
    };
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const reload = page.getByRole("button", { name: "Reload", exact: true });
  await expect(reload).toBeFocused();
  await reload.click({ trial: true });
  await shot(page, "ending-recovery");
});
