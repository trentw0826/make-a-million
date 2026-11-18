/**
 * Browser smoke test. Starts the built server, then in headless Chromium plays one hand
 * against three bots (one Hard, two Normal), checking the table's signals, the hand order
 * and the motion along the way; a second pass checks that reduced motion switches the
 * animations off.
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
/** E2E_VIEWPORT=1366x768 tries another window size. */
const VIEWPORT = (() => {
  const [w, h] = (process.env.E2E_VIEWPORT ?? '1280x860').split('x').map(Number);
  return { width: w ?? 1280, height: h ?? 860 };
})();

/** Nothing on screen scrolls: not the page, not the felt, not an open dialog. */
async function checkNoScroll(page: Page, where: string): Promise<void> {
  const over = await page.evaluate(() => {
    const out: string[] = [];
    const root = document.scrollingElement ?? document.documentElement;
    if (root.scrollHeight > window.innerHeight + 1)
      out.push(`page +${root.scrollHeight - window.innerHeight}px`);
    for (const sel of ['.felt', '.modal']) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.scrollHeight > el.clientHeight + 1)
          out.push(`${sel} +${el.scrollHeight - el.clientHeight}px`);
      }
    }
    return out;
  });
  check(
    over.length === 0,
    `${where} fits the window without scrolling${over.length ? ` (${over.join(', ')})` : ''}`,
  );
}

const failures: string[] = [];
/** Checked once, on the first turn that has an unplayable card. */
let passedSeatChecked = false;
let discardChecked = false;
let cursorChecked = false;
let trumpChecked = false;
let trayChecked = false;
let blockedCardChecked = false;
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
 * Records which motion classes ever appear, since a sweep lasts only a few hundred ms, and
 * whether each dealt or played card moved: its transform on its first frame against 120 ms
 * later (Motion animates inline, so there is no CSS animation name to read). Plain source
 * text on purpose: tsx compiles named functions with a `__name` helper that the page lacks.
 */
const WATCH_CLASSES = `
  window.__seen = new Set();
  window.__moves = { deal: [], trick: [], mine: [], skid: [] };
  const tracked = new WeakSet();
  new MutationObserver(function () {
    for (const name of ['trick-enter', 'trick-sweep', 'card-winning']) {
      if (document.querySelector('.' + name)) window.__seen.add(name);
    }
    for (const el of document.querySelectorAll('.hand .card-3d, .trick-enter, .trick-skid')) {
      if (tracked.has(el)) continue;
      tracked.add(el);
      const kind = el.classList.contains('trick-skid')
        ? 'skid'
        : el.classList.contains('card-3d')
          ? 'deal'
          : el.closest('.trick-mine') ? 'mine' : 'trick';
      requestAnimationFrame(function () {
        const first = getComputedStyle(el).transform;
        setTimeout(function () {
          window.__moves[kind].push(first !== getComputedStyle(el).transform);
        }, 120);
      });
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
`;

const seenClasses = (page: Page) =>
  page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen]);

/** For dealt and played cards: whether each one moved after it appeared. */
const cardMoves = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __moves: { deal: boolean[]; trick: boolean[]; mine: boolean[]; skid: boolean[] };
        }
      ).__moves,
  );

/**
 * Home → room → seat 1 → a Hard bot and two Normal bots → start. The Hard bot searches on
 * a server worker thread, so this also checks that the built server runs one.
 */
async function openTable(page: Page, base: string): Promise<void> {
  await page.goto(base);
  await page.getByLabel('Your name').fill('Tester');
  await sleep(1_200); // let the showcase cards land
  await page.screenshot({ path: path.join(OUT, '0-home.png') });
  await checkNoScroll(page, 'the home page');
  await page.getByRole('button', { name: 'Create a room' }).click();
  await page.getByRole('button', { name: 'Sit here' }).first().click();
  const addHard = page.getByRole('button', { name: '+ Bot · Hard' });
  const addNormal = page.getByRole('button', { name: '+ Bot · Normal' });
  await until(async () => (await addHard.count()) === 3, '3 empty seats');
  check(
    (await page.getByRole('button', { name: '+ Bot · Expert' }).count()) === 0,
    'the lobby offers no Expert bot yet',
  );
  check(
    (await page.locator('.chair-mine.chair-bottom').count()) === 1,
    'your chair sits at the bottom of the lobby table',
  );
  await addHard.first().click();
  await until(async () => (await addHard.count()) === 2, 'a Hard bot seated');
  await page.screenshot({ path: path.join(OUT, '0-lobby.png') });
  await checkNoScroll(page, 'the lobby');
  for (let left = 2; left > 0; left--) {
    await until(async () => (await addNormal.count()) === left, `${left} empty seats`);
    await addNormal.first().click();
  }
  await until(async () => (await addNormal.count()) === 0, 'a full table');
  check(
    (await page.locator('.chair-name', { hasText: /^Bot \d Hard$/ }).count()) === 1,
    'a seat shows "Bot 2 Hard", its strength in quiet type',
  );
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.locator('.felt').waitFor();
}

type Shoot = (name: string) => Promise<void>;

/** Takes this seat's action if the table is waiting on it; true if it acted. */
async function act(page: Page, shoot: Shoot): Promise<boolean> {
  const quick = { timeout: 2_000 };
  try {
    // The gold ring round your seat says the table is waiting on you.
    if (!(await page.locator('.me.me-turn').isVisible())) return false;
    const pass = page.getByRole('button', { name: 'Pass', exact: true });
    if (await pass.isVisible()) {
      await shoot('3-bidding');
      check(
        (await page.locator('.plaque-bottom .your-bid').isVisible()) &&
          (await page.locator('.action-bar').count()) === 0 &&
          (await page.locator('.seat-chip').count()) === 0,
        'the auction is bid on the felt, with no badges on the seats and no action bar',
      );
      const passed = page.locator('.seat-panel.seat-passed');
      if (!passedSeatChecked && (await passed.count()) > 0) {
        await sleep(400); // let the fade finish
        const faded = await passed.first().evaluate((el) => ({
          name: Number(getComputedStyle(el.querySelector('.seat-name') as Element).opacity),
          cards: Number(getComputedStyle(el.querySelector('.card-backs') as Element).opacity),
        }));
        check(faded.name < 1 && faded.cards < 1, 'a seat that has passed fades back');
        passedSeatChecked = true;
      }
      if (await pass.isEnabled()) await pass.click(quick);
      else await page.getByRole('button', { name: /^Bid \$/ }).click(quick);
      return true;
    }
    // The button counts down, "Discard (3 left)", until three cards are chosen.
    const discard = page.getByRole('button', { name: /^Discard( \(\d left\))?$/ });
    if (await discard.isVisible()) {
      if (!discardChecked) {
        check(
          (await discard.textContent()) === 'Discard (3 left)',
          'the discard button counts the cards still to choose',
        );
        discardChecked = true;
      }
      await shoot('4-discard');
      // The fanned cards overlap, so a pointer click can land on a neighbour; choose by
      // the card's own click, as a keyboard or screen reader would.
      for (let i = 0; i < 3; i++) {
        await page
          .locator(
            '.hand .hand-present:not([inert]) button.card:not([aria-disabled])[aria-pressed="false"]',
          )
          .first()
          .dispatchEvent('click');
        await sleep(450); // the card flies to the discard tray before the next pick
      }
      if (!trayChecked) {
        check(
          (await page.locator('.discard-tray .discard-card').count()) === 3,
          'picked discards are laid out in the tray on the felt',
        );
        await shoot('4c-discard-tray');
        trayChecked = true;
      }
      await page.getByRole('button', { name: 'Discard', exact: true }).click(quick);
      return true;
    }
    // Trump is named from the hand: point at a color, read it in the bar, click.
    if (await page.locator('.trump-bar').isVisible()) {
      const colored = page
        .locator('.hand .hand-present:not([inert]) button.card:not([aria-disabled])')
        .first();
      if ((await colored.count()) > 0) {
        await colored.hover(quick);
        await sleep(350);
        if (!trumpChecked) {
          const raised = await page.locator('.hand-fan-hovered').count();
          const preview = (await page.locator('.trump-word').textContent()) ?? '';
          const ofColor = await page
            .locator(`.hand [data-card-id]`)
            .evaluateAll(
              (cards, color) =>
                cards.filter((c) =>
                  (c.getAttribute('aria-label') ?? '').toLowerCase().includes(color),
                ).length,
              preview,
            );
          check(
            raised === ofColor && raised > 0 && /^(red|yellow|black|green)$/.test(preview),
            `pointing at a color raises its group and names it in the bar (${raised} cards, ${preview})`,
          );
          trumpChecked = true;
        }
        await shoot('4b-trump');
        await colored.click(quick);
        return true;
      }
    }
    const suit = page.locator('.suit-btn').first();
    if (await suit.isVisible()) {
      await suit.click(quick);
      return true;
    }
    const card = page
      .locator('.hand .hand-present:not([inert]) button.card:not([aria-disabled])')
      .first();
    if (await card.isVisible()) {
      const blocked = page
        .locator('.hand .hand-present:not([inert]) button.card[aria-disabled="true"]')
        .first();
      if (!blockedCardChecked && (await blocked.count()) > 0) {
        const reason = await blocked.getAttribute('title', quick);
        check(Boolean(reason), 'a greyed-out card carries a tooltip saying why');
        // Playwright won't click an aria-disabled element unless forced; a person can.
        await blocked.click({ ...quick, force: true });
        check(
          await page
            .locator('.toast')
            .getByText(reason ?? '')
            .isVisible(),
          'clicking a greyed-out card shows the reason',
        );
        blockedCardChecked = true;
      }
      if (!cursorChecked) {
        const box = await card.boundingBox();
        const cursor =
          box &&
          (await page.evaluate(
            ([x, y]) => {
              const el = document.elementFromPoint(x, y);
              return el ? getComputedStyle(el).cursor : null;
            },
            [box.x + box.width / 2, box.y + box.height / 2] as const,
          ));
        check(cursor === 'pointer', 'the pointer turns to a hand over a card you can play');
        cursorChecked = true;
      }
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
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
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
  await checkNoScroll(page, 'How to play');
  await page.keyboard.press('Escape');
  check(await help.isHidden(), 'Esc closes How to play');
  await page.keyboard.press('?');
  check(await help.isVisible(), '? opens How to play');
  await page.keyboard.press('Escape');

  await openTable(page, base);
  await shoot('2-dealt');
  await checkNoScroll(page, 'the table');
  check(
    ((await page.locator('.contract-bar').getAttribute('class')) ?? '').includes(
      'visually-hidden',
    ) && /Bidding opens|High bid/.test((await page.locator('.contract-bar').textContent()) ?? ''),
    'bidding begins as soon as the cards are dealt',
  );
  await until(() => page.locator('.me.me-turn').isVisible(), 'your turn to bid');
  check(
    await page.getByRole('button', { name: /^Bid \$/ }).isVisible(),
    'the table marks your turn to bid',
  );
  const seatText = (await page.locator('.seat-panel').allTextContents()).join(' ');
  check(
    !/\b(dealer|Partner|Opponent|You)\b/.test(seatText.replace(/your partner|opponent/g, '')) &&
      (await page.locator('.me-line .you-tag').textContent()) === 'You',
    'only your own seat is tagged, with You',
  );
  const corner = page.locator('.table-corner');
  check(
    (await corner.locator('.icon-btn svg').count()) === 3 &&
      (await corner.getByRole('button', { name: 'Score sheet', exact: true }).count()) === 1 &&
      (await corner.getByRole('button', { name: 'How to play' }).count()) === 1 &&
      (await page.locator('.topbar').getByRole('button', { name: 'How to play' }).count()) === 0,
    'the score sheet, sound and How to play sit as icons in the corner by your seat',
  );
  check(
    (await page.locator('.action-bar .turn-pill').count()) === 0 &&
      (await page
        .locator('.me .visually-hidden')
        .getByText(/^Your turn/)
        .count()) === 1,
    'no "Your turn" badge: the ring round your seat marks the turn',
  );

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
  await checkNoScroll(page, 'the hand review');
  check(
    await result.locator('.result-banner').isVisible(),
    'the hand result shows a made/set banner',
  );
  check(orderChecked, 'trump was named during the hand');
  check(blockedCardChecked, 'a greyed-out card was checked during the hand');
  const seen = await seenClasses(page);
  check(seen.includes('trick-enter'), 'played cards slide in');
  check(seen.includes('trick-sweep'), 'taken tricks sweep to the winner');
  check(seen.includes('card-winning'), 'the winning card is marked (for screen readers)');
  const moves = await cardMoves(page);
  check(moves.deal.some(Boolean), 'the deal flies cards into the hand');
  check(moves.trick.some(Boolean), "the others' cards fly onto the felt");
  check(moves.mine.some(Boolean), 'your card flies from your hand to the felt');
  check(moves.skid.some(Boolean), 'played cards slide to a stop on the felt');

  check(await result.getByRole('timer').isVisible(), 'the result counts down to the next hand');
  await until(
    async () => (await result.locator('.ready-list .is-ready').count()) === 3,
    'the bots ready up',
  );
  await shoot('6b-result-ready');
  // By now the last trick has been gathered too: every trick lies in a pile, face down.
  const piled = async () =>
    (await page
      .locator('.trick-pile')
      .evaluateAll((piles) =>
        piles.map((p) =>
          Number(/(\d+) tricks? taken/.exec(p.getAttribute('aria-label') ?? '')?.[1]),
        ),
      )) as number[];
  const counts = await piled();
  check(
    counts.length === 4 && counts.reduce((a, b) => a + b, 0) === 13,
    `each player's taken tricks lie in their own pile (${counts.join(' + ')})`,
  );
  check(
    (await page.locator('.trick-pile .pile-card').count()) === 52 &&
      (await page.locator('.trick-pile [data-card-id]').count()) === 0,
    'every card in the piles is face down',
  );
  await page.getByRole('button', { name: 'Ready' }).click();
  await until(() => result.isHidden(), 'the next hand');
  await shoot('7-next-hand');
  check(
    (await page.locator('.trick-pile .pile-card').count()) === 0,
    'a new hand starts with no piles',
  );
  check(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight <= window.innerHeight &&
        document.documentElement.scrollWidth <= window.innerWidth,
    ),
    'the table fits the window without scrolling',
  );

  // The score sheet and log wait in a drawer off the table.
  const drawer = page.getByRole('complementary', { name: 'Score sheet' });
  check(await drawer.isHidden(), 'the score sheet and log start put away');
  await page.getByRole('button', { name: 'Score sheet', exact: true }).click();
  check(await drawer.isVisible(), 'the score sheet and log open from the felt');
  await shoot('8-score-sheet');
  check(
    (await drawer.locator('.sheet tbody tr').count()) === 1,
    'the score sheet has a line for the hand',
  );
  const folded = drawer.locator('.event-log details');
  check((await folded.count()) === 1, 'the finished hand folds up in the log');
  const log = (await folded.textContent()) ?? '';
  check((log.match(/Auction:/g) ?? []).length === 1, 'the log sums up the auction in one line');
  check(!/takes trick|bids \$|passes\./.test(log), 'the log has no per-trick or per-bid lines');
  check(/(made|were set on) the \$\d+k bid/.test(log), 'the log records the result');
  await page.keyboard.press('Escape');
  // It slides back out before it is gone.
  await drawer.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
  check(await drawer.isHidden(), 'Esc puts the score sheet and log away');
  check(
    pageErrors.length === 0,
    `the page threw no errors${pageErrors.length ? `: ${pageErrors.join('; ')}` : ''}`,
  );
  await page.close();
}

async function reducedMotion(browser: Browser, base: string): Promise<void> {
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.addInitScript(WATCH_CLASSES);
  await openTable(page, base);
  const animation = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
  await playUntil(page, async () => (await page.locator('.trick-motion').count()) >= 2);
  await sleep(300);
  const moves = await cardMoves(page);
  check(
    moves.deal.length > 0 && !moves.deal.some(Boolean),
    'reduced motion: cards are not dealt in',
  );
  check(
    moves.trick.length > 0 && ![...moves.trick, ...moves.mine, ...moves.skid].some(Boolean),
    'reduced motion: trick cards do not slide',
  );
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
