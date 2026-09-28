import { expect, type Page, test } from "@playwright/test";

interface Probe {
  state: () => {
    roomIndex: number;
    done: boolean[];
    hatchOpen: boolean;
    player: { rail: string | null; holding: string | null };
  };
  canGrab: () => boolean;
  toScreen: (x: number, y: number) => { x: number; y: number };
}
declare global {
  interface Window {
    __hold: Probe;
  }
}

/** Run a small read-only function against the game probe inside the page. */
const probe = <T>(page: Page, fn: (p: Probe) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__hold)`) as Promise<T>;

/** Wait until something is in reach, then press E; retry if the moment slipped by. */
async function grabWhenReachable(page: Page, done: () => Promise<boolean>, tries = 6) {
  for (let i = 0; i < tries; i++) {
    await page.waitForFunction(() => window.__hold.canGrab(), undefined, { timeout: 20_000 });
    await page.keyboard.press("KeyE");
    if (await done()) return;
  }
  throw new Error("never managed to grab");
}

test("room 1: throw, catch the rail, recover the cushion, leave through the hatch", async ({
  page,
}) => {
  await page.goto("/?e2e");
  await expect(page.locator("#arrival")).toHaveCount(0, { timeout: 30_000 });
  await page.waitForFunction(() => !!window.__hold);
  await page.locator("#stage").focus();

  // Throw the cushion toward the far wall: aim right with the keyboard, then Space.
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(300);
  await page.keyboard.press("Space");
  await page.keyboard.up("ArrowRight");
  await expect.poll(() => probe(page, (p) => p.state().player.holding)).toBeNull();

  // Recoil carries us back toward the port handrail: grab it.
  await grabWhenReachable(page, () => probe(page, (p) => p.state().player.rail === "port"));
  await expect.poll(() => probe(page, (p) => p.state().done[0])).toBe(true);

  // The cushion bounces back: catch it.
  await grabWhenReachable(page, () => probe(page, (p) => p.state().player.holding === "cushion"));

  // Throw it from the rail onto the sofa (no recoil while anchored).
  const sofa = await probe(page, (p) => p.toScreen(4.4, -2.85));
  await page.mouse.move(sofa.x, sofa.y);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => probe(page, (p) => p.state().hatchOpen), { timeout: 15_000 }).toBe(true);
  await expect(page.getByText("Arrival Lounge tidy")).toBeVisible();

  // Push off toward the open hatch and float through it into room 2.
  const hatch = await probe(page, (p) => p.toScreen(6, 2.4));
  await page.mouse.move(hatch.x, hatch.y);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => probe(page, (p) => p.state().roomIndex), { timeout: 20_000 }).toBe(1);
  await expect(page.getByText("Room 2 of 3")).toBeVisible();
});
