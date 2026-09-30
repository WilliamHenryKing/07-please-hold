import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import type { GameState } from "../src/game/types";

export interface Probe {
  state(): GameState;
  canGrab(): boolean;
  toScreen(x: number, y: number): { x: number; y: number };
}
export const read = (page: Page): Promise<GameState> =>
  page.evaluate(() => (window as unknown as { __hold: Probe }).__hold.state());
export const screen = (page: Page, x: number, y: number) =>
  page.evaluate(({ x, y }) => (window as unknown as { __hold: Probe }).__hold.toScreen(x, y), {
    x,
    y,
  });
export async function ready(page: Page) {
  await expect(page.locator("#arrival")).toHaveCount(0, { timeout: 90_000 });
  await page.waitForFunction(
    () => (window as unknown as { __VISUAL_TEST__?: { ready: boolean } }).__VISUAL_TEST__?.ready,
  );
  if (process.env.REQUIRE_REAL_GPU === "1") {
    const renderer = await page.evaluate(
      () =>
        (window as unknown as { __VISUAL_TEST__: { renderer: string } }).__VISUAL_TEST__.renderer,
    );
    expect(renderer).toMatch(/NVIDIA|RTX/i);
    expect(renderer).not.toMatch(/SwiftShader|llvmpipe/i);
  }
}
export async function shot(page: Page, name: string) {
  const out = path.resolve("../../.workspace/bug-pass-2026-09-30/07");
  mkdirSync(out, { recursive: true });
  await page.screenshot({ path: path.join(out, `${name}.png`) });
}
export async function aim(page: Page, x: number, y: number) {
  const point = await screen(page, x, y);
  await page.mouse.move(point.x, point.y);
}
export async function clearGuide(page: Page) {
  const skip = page.getByRole("button", { name: "Skip the guide", exact: true });
  if (await skip.count()) await skip.click();
  await page.locator("#stage").focus();
}
export async function readableGuide(page: Page) {
  const guide = page.getByLabel("Shift guide", { exact: true });
  await expect(guide).toBeVisible();
  expect(
    await guide.evaluate((el) => {
      const p = el.querySelector("p");
      if (!p) return false;
      const r = p.getBoundingClientRect();
      return (
        r.top >= 0 &&
        r.top + 10 < innerHeight &&
        el.contains(document.elementFromPoint(r.x + 20, r.y + 10))
      );
    }),
  ).toBe(true);
}
