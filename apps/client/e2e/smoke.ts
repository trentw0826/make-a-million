/**
 * Browser smoke test. Starts the built server, then in headless Chromium plays one hand
 * against three bots, checking the table's signals, the hand order and the motion along the
 * way; a second pass checks that reduced motion switches the animations off.
 *
 *   pnpm e2e                         # builds first
 *   CHROMIUM_PATH=/path/to/chrome pnpm e2e
 *
 * Screenshots land in apps/client/e2e/out/. Exits non-zero if any check fails.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import type { CardId, Suit } from '@mam/engine';
import { type Browser, chromium, type Page } from 'playwright-core';
import { displayOrder } from '../src/handOrder';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(import.meta.dirname, 'out');
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium';
const HAND_TIMEOUT_MS = 4 * 60_000;
const VIEWPORT = { width: 1280, height: 860 };

const failures: string[] = [];
function check(ok: boolean, what: string): void {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures.push(what);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(test: () => Promise<boolean>, what: string, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await test()) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port')),
      );
    });
  });
}

async function startServer(port: number): Promise<ChildProcess> {
  const server = spawn(process.execPath, [path.join(ROOT, 'apps/server/dist/index.js')], {
    env: { ...process.env, PORT: String(port), STATIC_DIR: path.join(ROOT, 'apps/client/dist') },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  await until(async () => {
    try {
      return (await fetch(`http://127.0.0.1:${port}/healthz`)).ok;
    } catch {
      return false;
    }
  }, 'the server to start');
  return server;
}

/**
 * Records which motion classes ever appear, since a sweep lasts only 350 ms. Plain source
 * text on purpose: tsx compiles named functions with a `__name` helper that the page lacks.
 */
const WATCH_CLASSES = `
  window.__seen = new Set();
  new MutationObserver(function () {
    for (const name of ['trick-enter', 'trick-sweep', 'card-winning']) {
      if (document.querySelector('.' + name)) window.__seen.add(name);
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
`;

const seenClasses = (page: Page) =>
  page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen]);

/** Home → room → seat 1 → three Normal bots → start. */
async function openTable(page: Page, base: string): Promise<void> {
  await page.goto(base);
  await page.getByLabel('Your name').fill('Tester');
  await page.getByRole('button', { name: 'Create a room' }).click();
  await page.getByRole('button', { name: 'Sit here' }).first().click();
  const addBot = page.getByRole('button', { name: '+ Bot · Normal' });
  for (let left = 3; left > 0; left--) {
    await until(async () => (await addBot.count()) === left, `${left} empty seats`);
    await addBot.first().click();
  }
  await until(async () => (await addBot.count()) === 0, 'a full table');
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.locator('.felt').waitFor();
}

type Shoot = (name: string) => Promise<void>;

/** Takes this seat's action if the table is waiting on it; true if it acted. */
async function act(page: Page, shoot: Shoot): Promise<boolean> {
  const quick = { timeout: 2_000 };
  try {
    if (!(await page.locator('.action-turn').isVisible())) return false;
    const ready = page.getByRole('button', { name: 'Ready to bid' });
    if (await ready.isVisible()) {
      await ready.click(quick);
      return true;
    }
    const pass = page.getByRole('button', { name: 'Pass', exact: true });
    if (await pass.isVisible()) {
      await shoot('3-bidding');
      if (await pass.isEnabled()) await pass.click(quick);
      else await page.getByRole('button', { name: /^Bid \$/ }).click(quick);
      return true;
    }
    const discard = page.getByRole('button', { name: 'Discard', exact: true });
    if (await discard.isVisible()) {
      await shoot('4-discard');
      for (let i = 0; i < 3; i++) {
        await page
          .locator('.hand button.card:not([disabled])[aria-pressed="false"]')
          .first()
          .click(quick);
      }
      await discard.click(quick);
      return true;
    }
    const suit = page.locator('.suit-btn').first();
    if (await suit.isVisible()) {
      await suit.click(quick);
      return true;
    }
    const card = page.locator('.hand button.card:not([disabled])').first();
    if (await card.isVisible()) {
      await card.click(quick);
      return true;
    }
  } catch {
    // The table moved on between looking and clicking; look again.
  }
  return false;
}

/** Acts for this seat until `done`, calling `each` between steps. */
async function playUntil(
  page: Page,
  done: () => Promise<boolean>,
  each: () => Promise<void> = async () => {},
  shoot: Shoot = async () => {},
): Promise<void> {
  const deadline = Date.now() + HAND_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await done()) return;
    await each();
    if (!(await act(page, shoot))) await sleep(120);
  }
  throw new Error('the hand did not finish in time');
}

async function handIds(page: Page): Promise<CardId[]> {
  const ids = await page
    .locator('.hand [data-card-id]')
    .evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-card-id'))));
  return ids;
}

async function fullHand(browser: Browser, base: string): Promise<void> {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.addInitScript(WATCH_CLASSES);
  // Screenshots wait out the entrance motions (dialogs, the deal) so they show the settled page.
  const shots = new Set<string>();
  const shoot: Shoot = async (name) => {
    if (shots.has(name)) return;
    shots.add(name);
    await sleep(name === '2-dealt' || name === '7-next-hand' ? 1_000 : 350);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  };

  // How to play, from the home screen.
  await page.goto(base);
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  const help = page.getByRole('dialog', { name: 'How to play' });
  check(await help.isVisible(), 'How to play opens from the top bar');
  await shoot('1-how-to-play');
  await page.keyboard.press('Escape');
  check(await help.isHidden(), 'Esc closes How to play');
  await page.keyboard.press('?');
  check(await help.isVisible(), '? opens How to play');
  await page.keyboard.press('Escape');

  await openTable(page, base);
  await shoot('2-dealt');
  check(await page.locator('.me.me-turn').isVisible(), 'the table marks your turn after the deal');

  // Leaving mid-game asks first.
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Leave the game?' });
  check(await confirm.isVisible(), 'Leave mid-game asks for confirmation');
  await page.getByRole('button', { name: 'Stay' }).click();
  check(await confirm.isHidden(), 'Stay keeps you at the table');

  let orderChecked = false;
  const result = page.getByRole('dialog', { name: /^Hand \d+$/ });
  await playUntil(
    page,
    () => result.isVisible(),
    async () => {
      const trump = (await page
        .locator('.contract-bar [data-trump-suit]')
        .getAttribute('data-trump-suit', { timeout: 50 })
        .catch(() => null)) as Suit | null;
      if (trump && !orderChecked) {
        orderChecked = true;
        await sleep(400); // let the re-sort settle
        const ids = await handIds(page);
        check(
          JSON.stringify(ids) === JSON.stringify(displayOrder(ids, trump)),
          `after ${trump} is named, the hand is shown in trump order`,
        );
        const marks = await page
          .locator('.hand [data-card-id]')
          .evaluateAll((els) => els.map((el) => el.hasAttribute('data-trump')));
        const firstPlain = marks.indexOf(false);
        check(
          firstPlain === -1 || marks.slice(firstPlain).every((m) => !m),
          'trump-marked cards come first',
        );
      }
      if ((await page.locator('.trick-motion').count()) >= 2) await shoot('5-playing');
    },
    shoot,
  );

  await shoot('6-result');
  check(
    await result.locator('.result-banner').isVisible(),
    'the hand result shows a made/set banner',
  );
  check(orderChecked, 'trump was named during the hand');
  const seen = await seenClasses(page);
  check(seen.includes('trick-enter'), 'played cards slide in');
  check(seen.includes('trick-sweep'), 'taken tricks sweep to the winner');
  check(seen.includes('card-winning'), 'the winning card is highlighted');

  const log = (await page.locator('.event-log').textContent()) ?? '';
  check((log.match(/Auction:/g) ?? []).length === 1, 'the log sums up the auction in one line');
  check(!/takes trick|bids \$|passes\./.test(log), 'the log has no per-trick or per-bid lines');
  check(/(made|were set on) the \$\d+k bid/.test(log), 'the log records the result');

  check(await result.getByRole('timer').isVisible(), 'the result counts down to the next hand');
  await until(
    async () => (await result.locator('.ready-list .is-ready').count()) === 3,
    'the bots ready up',
  );
  await shoot('6b-result-ready');
  await page.getByRole('button', { name: 'Ready' }).click();
  await until(() => result.isHidden(), 'the next hand');
  await shoot('7-next-hand');
  check(
    (await page.locator('.event-log details').count()) === 1,
    'the finished hand folds up in the log',
  );
  await page.close();
}

async function reducedMotion(browser: Browser, base: string): Promise<void> {
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await openTable(page, base);
  const animation = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
  check((await animation('.hand-slot')) === 'none', 'reduced motion: cards are not dealt in');
  await playUntil(page, async () => (await page.locator('.trick-motion').count()) > 0);
  check((await animation('.trick-motion')) === 'none', 'reduced motion: trick cards do not slide');
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  check((await animation('.modal')) === 'none', 'reduced motion: dialogs do not animate');
  await context.close();
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const port = await freePort();
  const server = await startServer(port);
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
  const base = `http://127.0.0.1:${port}/`;
  try {
    await fullHand(browser, base);
    await reducedMotion(browser, base);
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(failures.length === 0 ? '\nAll checks passed.' : `\n${failures.length} failed.`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
