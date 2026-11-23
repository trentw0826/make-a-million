import { createGame, observe, type TableView, tableView } from '@mam/engine';
import type { RoomView, ServerMessage } from '@mam/protocol';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Shell } from '../src/App';
import { ContractBar } from '../src/components/ContractBar';
import { DiscardTray } from '../src/components/DiscardTray';
import { Hand, partOffset } from '../src/components/Hand';
import { ScoreSheet } from '../src/components/ScoreSheet';
import { ScoreTracker } from '../src/components/ScoreTracker';
import { SeatPanel } from '../src/components/SeatPanel';
import { TableDrawer } from '../src/components/TableDrawer';
import { TrickPile } from '../src/components/TrickPile';
import { displayOrder } from '../src/handOrder';
import { GameProvider, useGame } from '../src/store';
import { RESULT_PAUSE_MS } from '../src/theme/motion';

/** Nothing listens here, so every send fails and shows the "Not connected" toast. */
const URL = 'ws://127.0.0.1:1/ws';
const NOT_CONNECTED = 'Not connected to the server.';

/** Feeds server messages straight into the store, as if they had arrived on the socket. */
function Seed({ messages }: { messages: readonly ServerMessage[] }) {
  const { dispatch } = useGame();
  useEffect(() => {
    for (const message of messages) dispatch({ kind: 'server', message });
  }, [dispatch, messages]);
  return null;
}

function renderWith(messages: readonly ServerMessage[] = []) {
  return render(
    <GameProvider url={URL}>
      <Seed messages={messages} />
      <Shell />
    </GameProvider>,
  );
}

function room(phase: RoomView['phase']): RoomView {
  return {
    code: 'ABC123',
    phase,
    hostId: 'p1',
    seats: [
      { kind: 'human', playerId: 'p1', name: 'Ann', connected: true, botControlled: false },
      { kind: 'bot', name: 'Bot 2', difficulty: 'easy' },
      { kind: 'bot', name: 'Bot 3', difficulty: 'normal' },
      { kind: 'bot', name: 'Bot 4', difficulty: 'normal' },
    ],
    yourSeat: 0,
  };
}

const welcome: ServerMessage = { type: 'welcome', playerId: 'p1', token: 't', name: 'Ann' };
/** A fresh deal by seat 3, so Ann (seat 0) opens the bidding. */
const dealt = tableView(observe(createGame({ seed: 'ui', dealer: 3 }), 0));
const atTable: readonly ServerMessage[] = [
  welcome,
  { type: 'room', room: room('playing') },
  { type: 'view', view: dealt },
];
const inLobby: readonly ServerMessage[] = [welcome, { type: 'room', room: room('lobby') }];

describe('How to play', () => {
  it('opens from the top bar and closes with Esc', () => {
    renderWith();
    const button = screen.getByRole('button', { name: 'How to play' });
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'How to play' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens from the link on the home screen', () => {
    renderWith();
    fireEvent.click(screen.getByRole('button', { name: 'Read how to play' }));
    expect(screen.getByRole('dialog', { name: 'How to play' })).toBeInTheDocument();
  });

  it('toggles with ?, but not while typing a name', () => {
    renderWith();
    fireEvent.keyDown(screen.getByLabelText('Your name'), { key: '?' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(document.body, { key: '?' });
    expect(screen.getByRole('dialog', { name: 'How to play' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: '?' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('quotes the numbers of the ruleset in play', () => {
    renderWith(atTable);
    fireEvent.click(screen.getByRole('button', { name: 'How to play' }));
    fireEvent.click(screen.getByRole('tab', { name: /Deal and bidding/ }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('$175,000 or more');
    fireEvent.click(screen.getByRole('tab', { name: /The cards/ }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      '$40k · $30k · $15k · 11 · $10k · 9 · 8 · 7 · $5k',
    );
  });

  it('shows one topic at a time, starting from the goal away from a table', () => {
    renderWith();
    fireEvent.click(screen.getByRole('button', { name: 'Read how to play' }));
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    const goal = screen.getByRole('tab', { name: /The goal/ });
    expect(goal).toHaveAttribute('aria-selected', 'true');
    expect(goal).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: /The goal/ })).toBeInTheDocument();
  });

  it('opens on the topic for what the table is doing', () => {
    renderWith(atTable);
    fireEvent.click(screen.getByRole('button', { name: 'How to play' }));
    expect(screen.getByRole('tab', { name: /Deal and bidding/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('steps through the topics with the arrow keys and Previous and Next', () => {
    renderWith();
    fireEvent.click(screen.getByRole('button', { name: 'Read how to play' }));
    fireEvent.keyDown(screen.getByRole('tab', { name: /The goal/ }), { key: 'ArrowDown' });
    const cards = screen.getByRole('tab', { name: /The cards/ });
    expect(cards).toHaveAttribute('aria-selected', 'true');
    expect(cards).toHaveFocus();
    fireEvent.keyDown(cards, { key: 'End' });
    expect(screen.getByRole('tabpanel', { name: /Keyboard/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /← Scoring/ }));
    expect(screen.getByRole('tabpanel', { name: /Scoring/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Keyboard →/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('top bar', () => {
  it('mutes and unmutes sound, remembering the choice', () => {
    window.localStorage.removeItem('mam.muted');
    renderWith();
    const toggle = screen.getByRole('button', { name: 'Mute sounds' });
    const before = toggle.getAttribute('aria-pressed');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
    expect(window.localStorage.getItem('mam.muted')).toBe(before === 'true' ? null : '1');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', before ?? 'false');
  });

  it('shows the room code on the right, with no invite link', () => {
    renderWith(inLobby);
    const nav = screen.getByRole('navigation', { name: 'Game' });
    expect(nav).toHaveTextContent(/^Room ABC123/);
    expect(screen.queryByRole('button', { name: 'Copy invite link' })).toBeNull();
  });

  it('leaves the lobby at once', () => {
    renderWith(inLobby);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(NOT_CONNECTED)).toBeInTheDocument();
  });

  it('asks before leaving a game in progress, and says when it ends the game', () => {
    // Ann is the only human: leaving ends the game.
    const { unmount } = renderWith(atTable);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    const ending = screen.getByRole('dialog', { name: 'End the game?' });
    expect(ending).toHaveTextContent("You're the last player at the table");
    expect(within(ending).getByRole('button', { name: 'Leave and end the game' })).toBeVisible();
    unmount();

    // With Bob still at the table, a bot takes Ann's seat and the game goes on.
    const withBob = room('playing');
    renderWith([
      welcome,
      {
        type: 'room',
        room: {
          ...withBob,
          seats: [
            withBob.seats[0],
            withBob.seats[1],
            { kind: 'human', playerId: 'p3', name: 'Bob', connected: true, botControlled: false },
            withBob.seats[3],
          ],
        },
      },
      { type: 'view', view: dealt },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(screen.getByRole('dialog', { name: 'Leave the game?' })).toHaveTextContent(
      'A bot will play your seat',
    );
    expect(screen.queryByText(NOT_CONNECTED)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(NOT_CONNECTED)).toBeNull();
  });
});

describe('keyboard', () => {
  it('Enter places the bid shown', () => {
    renderWith(atTable);
    expect(screen.getByRole('button', { name: /^Bid \$/ })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(screen.getByText(NOT_CONNECTED)).toBeInTheDocument();
  });

  it('game keys stay quiet while a dialog is open', () => {
    renderWith(atTable);
    fireEvent.click(screen.getByRole('button', { name: 'How to play' }));
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(screen.queryByText(NOT_CONNECTED)).toBeNull();
  });
});

describe('score sheet', () => {
  it('lays out the race, then each hand newest first, its log folded under a finished one', () => {
    const hand1 = {
      handNumber: 1,
      dealer: 0,
      redeals: 0,
      bidder: 1,
      bid: 185_000,
      trump: 'red',
      biddingTeam: 1,
      captured: [20_000, 210_000],
      made: true,
      delta: [20_000, 210_000],
      scoresAfter: [20_000, 210_000],
      tricks: [],
    } as const;
    const view: TableView = {
      ...dealt,
      handNumber: 2,
      scores: [20_000, 210_000],
      handHistory: [hand1],
    };
    render(
      <ScoreSheet
        view={view}
        room={room('playing')}
        log={[
          { id: 1, hand: 1, text: 'Ann deals.', tone: 'info' },
          { id: 2, hand: 1, text: 'Bot 2 & Bot 4 made the $185k bid (+$210k).', tone: 'bad' },
          { id: 3, hand: 2, text: 'Bot 2 deals.', tone: 'info' },
        ]}
      />,
    );
    const race = screen.getByLabelText('The race');
    expect(race).toHaveTextContent(/Us\$20,000.*Them\$210,000.*First to \$1,000,000/);
    const hands = [...document.querySelectorAll('.sheet-hand')];
    // The hand in play first, its lines open.
    expect(hands[0]).toHaveTextContent(/^Hand 2In play/);
    expect(within(hands[0] as HTMLElement).getByText('Bot 2 deals.')).toBeVisible();
    // Then hand 1: who bid what, how it went for us (they made it: red), the bar, the totals.
    const done = hands[1] as HTMLElement;
    expect(done.querySelector('.sheet-chip')).toHaveTextContent('Made');
    expect(done.querySelector('.sheet-chip')).toHaveClass('bad');
    expect(done).toHaveTextContent('Bot 2 bid $185k in Red');
    expect(within(done).getByRole('img', { name: /made by \$25k/ })).toBeInTheDocument();
    expect(done.querySelector('.sheet-hand-sides')).toHaveTextContent(
      /\+\$20k → \$20k.*\+\$210k → \$210k/,
    );
    const folded = done.querySelector('details');
    expect(folded).not.toHaveAttribute('open');
    expect(folded).toHaveTextContent('made the $185k bid');
  });
});

describe('score trackers', () => {
  it("shows each side's total in its own tracker, with its pile beneath it", () => {
    const view: TableView = { ...dealt, team: 1, scores: [-40_000, 250_000] };
    render(
      <>
        <ScoreTracker view={view} room={room('playing')} side="us" pile={<i>our pile</i>} />
        <ScoreTracker view={view} room={room('playing')} side="them" pile={<i>their pile</i>} />
      </>,
    );
    const us = screen.getByRole('region', { name: 'Us' });
    const them = screen.getByRole('region', { name: 'Them' });
    expect(us).toHaveClass('tracker-us');
    expect(us.querySelector('.total')).toHaveTextContent(/^Us\$250,000$/);
    expect(us).toHaveTextContent('our pile');
    expect(them).toHaveClass('tracker-them');
    expect(them.querySelector('.total')).toHaveTextContent(/^Them−\$40,000/);
    expect(them).toHaveTextContent('their pile');
    // The other side's corner also says which hand it is, and the target.
    expect(them).toHaveTextContent('to $1,000,000');
    expect(us).not.toHaveTextContent('to $1,000,000');
  });
});

describe('lobby', () => {
  it('keeps every chair where it is, Seat 1 at the bottom, each marked with its partner', () => {
    const lobby: RoomView = {
      ...room('lobby'),
      seats: [
        { kind: 'bot', name: 'Bot 1', difficulty: 'normal' },
        { kind: 'bot', name: 'Bot 2', difficulty: 'hard' },
        { kind: 'human', playerId: 'p1', name: 'Ann', connected: true, botControlled: false },
        { kind: 'bot', name: 'Bot 4', difficulty: 'normal' },
      ],
      yourSeat: 2,
    };
    renderWith([welcome, { type: 'room', room: lobby }]);
    const chair = (n: number) => screen.getByRole('group', { name: `Seat ${n}` });
    expect(chair(3)).toHaveClass('chair-top', 'chair-mine', 'side-us');
    expect(chair(1)).toHaveClass('chair-bottom', 'chair-bot', 'side-us');
    expect(chair(2)).toHaveClass('chair-left', 'side-them');
    expect(chair(4)).toHaveClass('chair-right', 'side-them');
    expect(chair(2)).toHaveTextContent('Seat 2 · partner Seat 4');
    // Any bot's chair can be taken; the host picks each bot's level.
    expect(within(chair(4)).getByRole('button', { name: 'Sit here' })).toBeInTheDocument();
    const level = within(chair(2)).getByRole('group', { name: 'Bot level' });
    expect(within(level).getByRole('button', { name: 'Hard' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(level).getByRole('button', { name: 'Normal' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(chair(3)).queryByRole('button', { name: 'Sit here' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start game' })).toBeEnabled();
  });

  it('shows a guest each bot with its level, and no level picker', () => {
    const lobby: RoomView = {
      ...room('lobby'),
      hostId: 'someone-else',
      seats: [
        { kind: 'bot', name: 'Bot 1', difficulty: 'normal' },
        { kind: 'bot', name: 'Bot 2', difficulty: 'hard' },
        { kind: 'bot', name: 'Bot 3', difficulty: 'normal' },
        { kind: 'bot', name: 'Bot 4', difficulty: 'normal' },
      ],
      yourSeat: null,
    };
    renderWith([welcome, { type: 'room', room: lobby }]);
    const chair = (n: number) => screen.getByRole('group', { name: `Seat ${n}` });
    expect(chair(2)).toHaveTextContent('Bot 2 Hard');
    expect(within(chair(2)).getByText('Hard')).toHaveClass('seat-difficulty');
    expect(screen.queryByRole('group', { name: 'Bot level' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Sit here' })).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull();
  });
});

describe('score sheet and log drawer', () => {
  const entries = [{ id: 1, hand: 1, text: 'Ann deals.', tone: 'info' as const }];

  /** The sheet slides out before it is gone. */
  const gone = () =>
    waitFor(() => {
      expect(screen.queryByRole('complementary')).toBeNull();
      expect(document.querySelector('.drawer-scrim')).toBeNull();
    });

  it('opens from its button and puts itself away on Esc or its close button', async () => {
    render(<TableDrawer view={dealt} room={room('playing')} log={entries} />);
    const toggle = screen.getByRole('button', { name: 'Score sheet' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('complementary')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const drawer = screen.getByRole('complementary', { name: 'Score sheet' });
    expect(drawer).toHaveTextContent('No hands scored yet.');
    expect(drawer).toHaveTextContent('Ann deals.');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
    await gone();

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Close the score sheet' }));
    await gone();
  });

  it('dims the table while open, and a click anywhere else puts it away', async () => {
    render(
      <div>
        <p>The table</p>
        <TableDrawer view={dealt} room={room('playing')} log={entries} />
      </div>,
    );
    const toggle = screen.getByRole('button', { name: 'Score sheet' });
    expect(document.querySelector('.drawer-scrim')).toBeNull();
    fireEvent.click(toggle);
    expect(document.querySelector('.drawer-scrim')).not.toBeNull();

    // A press inside the sheet keeps it open.
    fireEvent.pointerDown(screen.getByText('Ann deals.'));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.pointerDown(document.querySelector('.drawer-scrim') as Element);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await gone();

    fireEvent.click(toggle);
    fireEvent.pointerDown(screen.getByText('The table'));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await gone();
  });
});

describe('trick piles', () => {
  it('shows each taken trick face down, and nothing of what is in it', () => {
    render(<TrickPile owner="Bot 2's" side="them" count={2} incoming={null} />);
    const pile = screen.getByRole('img', { name: "Bot 2's: 2 tricks taken" });
    expect(pile.querySelectorAll('.pile-card')).toHaveLength(8);
    expect(pile.querySelector('[data-card-id]')).toBeNull();
  });

  it('draws a trick being gathered in the pile already, turning over', () => {
    const incoming = [
      { seat: 0, cardId: 3 },
      { seat: 1, cardId: 7 },
      { seat: 2, cardId: 9 },
      { seat: 3, cardId: 12 },
    ] as const;
    render(<TrickPile owner="Your" side="us" count={1} incoming={incoming} />);
    const pile = screen.getByRole('img', { name: 'Your: 2 tricks taken' });
    expect(pile.querySelectorAll('.pile-card.trick-sweep .card-3d')).toHaveLength(4);
    expect(pile.querySelectorAll('.pile-card:not(.trick-sweep)')).toHaveLength(4);
  });

  it('says one trick, not one tricks', () => {
    render(<TrickPile owner="Your" side="us" count={1} incoming={null} />);
    expect(screen.getByRole('img', { name: 'Your: 1 trick taken' })).toBeInTheDocument();
  });
});

describe('trick piles at the table', () => {
  it("gathers each side's tricks into one pile beside its score", () => {
    renderWith([
      welcome,
      { type: 'room', room: room('playing') },
      {
        type: 'view',
        view: {
          ...dealt,
          phase: 'playing',
          trump: 'red',
          contract: { bidder: 1, amount: 175_000 },
          trickCounts: [3, 2],
          tricksWon: [1, 2, 2, 0],
        },
      },
    ]);
    const piles = document.querySelectorAll('.trick-pile');
    expect(piles).toHaveLength(2);
    const us = screen.getByRole('img', { name: 'Us: 3 tricks taken' });
    expect(us.closest('.tracker-us')).not.toBeNull();
    const them = screen.getByRole('img', { name: 'Them: 2 tricks taken' });
    expect(them.closest('.tracker-them')).not.toBeNull();
    // The seats hold only the players: name, badge and cards.
    for (const side of ['.top-side', '.left-side', '.right-side']) {
      expect(document.querySelector(side)?.children).toHaveLength(1);
    }
  });
});

describe('contract bar', () => {
  it('shows the contract, trump and tricks taken, our side first', () => {
    const playing: TableView = {
      ...dealt,
      phase: 'playing',
      contract: { bidder: 1, amount: 185_000 },
      trump: 'green',
      trickCounts: [3, 2],
    };
    render(<ContractBar view={playing} room={room('playing')} />);
    const bar = screen.getByRole('region', { name: 'Hand status' });
    expect(bar).toHaveTextContent('Bot 2 bid $185k');
    expect(bar).toHaveTextContent('Trump Green');
    expect(bar).toHaveTextContent('Tricks Us 3 – Them 2');
  });

  it('shows the high bid during the auction', () => {
    const bidding: TableView = {
      ...dealt,
      phase: 'bidding',
      auction: [{ seat: 3, kind: 'bid', amount: 180_000 }],
    };
    render(<ContractBar view={bidding} room={room('playing')} />);
    expect(screen.getByRole('region', { name: 'Hand status' })).toHaveTextContent(
      'High bid $180k: Bot 4',
    );
  });
});

describe('table status', () => {
  it('marks the turn and names who else must still confirm', () => {
    renderWith(atTable);
    expect(document.querySelector('.me')).toHaveClass('me-turn');
    // The gold ring is the visible cue; the words are there for screen readers only.
    expect(screen.getByText('Your turn to bid.')).toHaveClass('visually-hidden');
  });

  it('keeps the score sheet, sound and How to play as icons in the corner', () => {
    renderWith(atTable);
    const corner = document.querySelector('.table-corner') as HTMLElement;
    for (const name of ['Score sheet', 'Mute sounds', 'How to play']) {
      const button = within(corner).getByRole('button', { name });
      // An icon, named for screen readers, with no words of its own.
      expect(button.querySelector('svg')).not.toBeNull();
      expect(button).toHaveTextContent(/^$/);
    }
  });

  it('shows the contract and trump on the bidder, and the hand on the scoreboard', () => {
    renderWith([
      welcome,
      { type: 'room', room: room('playing') },
      {
        type: 'view',
        view: {
          ...dealt,
          phase: 'playing',
          handNumber: 2,
          turn: 1,
          trump: 'red',
          contract: { bidder: 1, amount: 185_000 },
          legal: { kind: 'none' },
        },
      },
    ]);
    const badge = document.querySelector('.seat-left .chip-contract') as HTMLElement;
    expect(badge).toHaveTextContent('Contract $185kRed');
    expect(badge.querySelector('[data-trump-suit="red"]')).not.toBeNull();
    // Trump is on the bidder's badge only, with no mark in the middle of the felt.
    expect(document.querySelector('.trick-area .suit-red')).toBeNull();
    expect(screen.getByRole('region', { name: 'Them' })).toHaveTextContent(/Hand 2 · to/);
    expect(screen.getByRole('region', { name: 'Hand status' })).toHaveClass('visually-hidden');
    // Your name tag is like the others', above your hand, with no bar between them in play.
    const name = document.querySelector('.me > .seat-name.me-name') as HTMLElement;
    expect(name).toHaveTextContent(/^You$/);
    expect(name.querySelector('.side-dot')).not.toBeNull();
    expect(name.nextElementSibling).toHaveClass('visually-hidden');
    expect(name.nextElementSibling?.nextElementSibling).toHaveClass('hand');
  });

  it('points the turn marker at the seat the table waits on', () => {
    renderWith([
      welcome,
      { type: 'room', room: room('playing') },
      { type: 'view', view: { ...dealt, turn: 2, legal: { kind: 'none' } } },
    ]);
    const marker = document.querySelector('.turn-marker') as HTMLElement;
    // Bot 3 sits across the table: the marker is at the top of the felt, pointing up.
    expect(marker.style.top).toBe('3%');
    expect(marker.style.transform).toMatch(/rotate\(-?180deg\)/);
  });

  it('leaves the felt, the bar and the seats unlabelled in play', () => {
    renderWith([
      welcome,
      { type: 'room', room: room('playing') },
      {
        type: 'view',
        view: {
          ...dealt,
          phase: 'playing',
          turn: 0,
          trump: 'red',
          contract: { bidder: 1, amount: 175_000 },
          trickCounts: [3, 2],
          legal: { kind: 'play', cardIds: dealt.hand },
        },
      },
    ]);
    expect(document.querySelector('.trick-area')).not.toHaveTextContent(/\d+\/13/);
    expect(document.querySelector('.seat-left')).not.toHaveTextContent('bidder');
    expect(document.querySelector('.action-bar')).toBeNull();
    expect(screen.getByText(/^Your turn\./)).toHaveClass('visually-hidden');
  });

  it('names trump from the felt or the hand: pointing at a color lights its token', () => {
    renderWith([
      welcome,
      { type: 'room', room: room('playing') },
      {
        type: 'view',
        view: {
          ...dealt,
          phase: 'naming-trump',
          turn: 0,
          contract: { bidder: 0, amount: 175_000 },
          // Red 1, Red 2, Green 1, the Tiger.
          hand: [0, 1, 39, 52],
          legal: { kind: 'trump', suits: ['red', 'yellow', 'black', 'green'] },
        },
      },
    ]);
    const picker = screen.getByRole('region', { name: 'Choose trump' });
    expect(picker.closest('.me')).toBeNull();
    expect(document.querySelector('.action-bar')).toBeNull();
    // Every color has a token, with how many of it the hand holds, none lit yet.
    const tokens = within(picker).getAllByRole('button');
    expect(tokens.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Red, 2 in your hand',
      'Yellow, 0 in your hand',
      'Black, 0 in your hand',
      'Green, 1 in your hand',
    ]);
    expect(picker.querySelector('.trump-pick-lit')).toBeNull();
    expect(screen.getByText('Your turn to name trump.')).toHaveClass('visually-hidden');

    const slot = (id: number) =>
      document.querySelector(`[data-card-id="${id}"]`)?.closest('.hand-slot') as HTMLElement;
    const fan = (id: number) => slot(id).querySelector('.hand-fan') as HTMLElement;
    fireEvent.pointerEnter(slot(1), { pointerType: 'mouse' });
    expect(fan(0).style.getPropertyValue('--raise')).toBe('1');
    expect(fan(1).style.getPropertyValue('--raise')).toBe('1');
    expect(fan(39).style.getPropertyValue('--raise')).toBe('0');
    expect(Number(fan(39).style.getPropertyValue('--part'))).toBeGreaterThan(0);
    expect(picker.querySelector('.trump-pick-lit')).toHaveAccessibleName('Red, 2 in your hand');

    // The Tiger has no color: it fades back and can't be chosen.
    expect(document.querySelector('[data-card-id="52"]')).toHaveClass('card-disabled');
    fireEvent.click(within(picker).getByRole('button', { name: /^Yellow/ }));
    expect(screen.getByText(NOT_CONNECTED)).toBeInTheDocument();
  });

  it("doesn't tag your own seat as the bidder", () => {
    renderWith([
      welcome,
      { type: 'room', room: room('playing') },
      {
        type: 'view',
        view: { ...dealt, phase: 'playing', contract: { bidder: 0, amount: 175_000 } },
      },
    ]);
    expect(document.querySelector('.me-name')).not.toHaveTextContent('bidder');
  });

  it('counts down the discards on the button below the slots, with the rules behind a ?', () => {
    const legal = { kind: 'discard', requiredNumberCards: 0, forbiddenIds: [] } as const;
    const tray = (ids: readonly number[]) => (
      <GameProvider url={URL}>
        <DiscardTray ids={ids} legal={legal} onReturn={() => {}} onDone={() => {}} />
      </GameProvider>
    );
    const { rerender } = render(tray([]));
    const region = screen.getByRole('region', { name: 'Your discards' });
    expect(screen.getByRole('button', { name: 'Discard 3 More' })).toBeDisabled();
    // The ? sits on the last slot.
    const tip = screen.getByRole('button', { name: 'Discard rules' });
    expect(tip.closest('.discard-slot')).toBe(region.querySelectorAll('.discard-slot')[2]);
    expect(tip).toHaveAccessibleDescription(/Number cards must go before Money/);
    rerender(tray([1, 2]));
    expect(screen.getByRole('button', { name: 'Discard 1 More' })).toBeDisabled();
    rerender(tray([1, 2, 3]));
    expect(screen.getByRole('button', { name: 'Discard' })).toBeEnabled();
  });

  it('leaves the kept cards in place and lays picked discards out on the felt', async () => {
    renderWith([
      welcome,
      { type: 'room', room: room('playing') },
      {
        type: 'view',
        view: {
          ...dealt,
          phase: 'discarding',
          turn: 0,
          contract: { bidder: 0, amount: 175_000 },
          // Red 1, 2, 3, Red $40k, the Tiger, Green 1: four number cards, so Money stays.
          hand: [0, 1, 2, 12, 52, 39],
          legal: { kind: 'discard', requiredNumberCards: 3, forbiddenIds: [52] },
        },
      },
    ]);
    const handIds = () =>
      [...document.querySelectorAll('.hand [data-card-id]')].map((c) =>
        Number(c.getAttribute('data-card-id')),
      );
    // The Red $40k and the Tiger must be kept: they stay in their places, greyed out, with
    // nothing setting them apart.
    expect(handIds()).toEqual(displayOrder([0, 1, 2, 12, 52, 39], null));
    expect(document.querySelector('.kept-start')).toBeNull();
    for (const id of [12, 52]) {
      expect(document.querySelector(`.hand [data-card-id="${id}"]`)).toHaveClass('card-disabled');
    }

    const tray = screen.getByRole('region', { name: 'Your discards' });
    fireEvent.click(document.querySelector('.hand [data-card-id="1"]') as Element);
    // It flies to the tray (in jsdom the hand's copy lingers, as its exit never runs).
    await waitFor(() => expect(tray.querySelector('[data-card-id="1"]')).not.toBeNull());
    expect(within(tray).getByRole('button', { name: 'Discard 2 More' })).toBeDisabled();

    fireEvent.click(tray.querySelector('[data-card-id="1"]') as Element);
    expect(tray.querySelector('[data-card-id="1"]')).toBeNull();
    expect(handIds()).toContain(1);
    expect(within(tray).getByRole('button', { name: 'Discard 3 More' })).toBeDisabled();
    // The bar below your hand has nothing to add.
    expect(document.querySelector('.me .action-bar')).toBeNull();
  });

  it('puts your bid controls at your spot: the amount between − and +, then Pass and Bid', () => {
    renderWith(atTable);
    const yours = document.querySelector('.bid-spot-bottom .your-bid') as HTMLElement;
    expect(
      within(yours)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label') ?? b.textContent),
    ).toEqual(['lower bid', 'raise bid', 'Pass', 'Bid $175k']);
    expect(within(yours).getByRole('status')).toHaveTextContent('$175k');
    fireEvent.click(screen.getByRole('button', { name: 'raise bid' }));
    expect(within(yours).getByRole('status')).toHaveTextContent('$180k');
    expect(within(yours).getByRole('button', { name: 'Bid $180k' })).toHaveClass('bid-submit');
    expect(document.querySelector('.action-bar')).toBeNull();
  });

  it('says nothing while you wait, with no bar', () => {
    const waiting = (phase: TableView['phase']): readonly ServerMessage[] => [
      welcome,
      { type: 'room', room: room('playing') },
      { type: 'view', view: { ...dealt, phase, turn: 1, legal: { kind: 'none' } } },
    ];
    const { unmount } = renderWith(waiting('bidding'));
    expect(document.querySelector('.action-bar')).toBeNull();
    expect(screen.getByText('Waiting for Bot 2 to bid…')).toHaveClass('visually-hidden');
    unmount();
    renderWith(waiting('playing'));
    expect(document.querySelector('.action-bar')).toBeNull();
  });

  it('gives each player in the auction a chip, the high bid marked, and none once passed', () => {
    const auction = (entries: TableView['auction']): readonly ServerMessage[] => [
      welcome,
      { type: 'room', room: room('playing') },
      { type: 'view', view: { ...dealt, turn: 2, legal: { kind: 'none' }, auction: entries } },
    ];
    const chip = (spot: string) => document.querySelector(`.bid-spot-${spot} .bid-chip`);
    const { unmount } = renderWith(auction([]));
    for (const spot of ['bottom', 'left', 'top', 'right']) {
      expect(chip(spot)).toHaveTextContent('No bid');
      expect(chip(spot)).toHaveClass('bid-chip-none');
    }
    unmount();
    renderWith(
      auction([
        { seat: 0, kind: 'bid', amount: 175_000 },
        { seat: 1, kind: 'bid', amount: 180_000 },
        { seat: 2, kind: 'pass' },
      ]),
    );
    expect(chip('bottom')).toHaveTextContent('$175k');
    expect(chip('bottom')).not.toHaveClass('bid-chip-high');
    expect(chip('left')).toHaveTextContent('$180k');
    expect(chip('left')).toHaveClass('bid-chip-high');
    expect(chip('left')).not.toHaveTextContent(/high/i);
    expect(document.querySelector('.bid-spot-top')).toBeNull();
    expect(chip('right')).toHaveTextContent('No bid');
    expect(document.querySelector('.seat-chip')).toBeNull();
  });

  it('fades the whole of a seat that has passed, and says so to screen readers', () => {
    const bidding: TableView = {
      ...dealt,
      phase: 'bidding',
      auction: [
        { seat: 0, kind: 'bid', amount: 175_000 },
        { seat: 1, kind: 'pass' },
      ],
    };
    const { rerender } = render(
      <SeatPanel seat={1} room={room('playing')} view={bidding} position="left" />,
    );
    expect(document.querySelector('.seat-panel')).toHaveClass('seat-passed');
    expect(document.querySelector('.seat-name')).toHaveTextContent(/passed/);
    expect(document.querySelector('.seat-chip')).toBeNull();
    rerender(<SeatPanel seat={2} room={room('playing')} view={bidding} position="top" />);
    expect(document.querySelector('.seat-panel')).not.toHaveClass('seat-passed');
  });
});

describe('hand', () => {
  it('lays the trump group out first, marked, with a gap after it', () => {
    // Red 1, Tiger, Green $40k, Bull, Green 1.
    render(<Hand ids={[0, 52, 51, 53, 39]} trump="green" cardProps={() => ({})} />);
    const cards = [...document.querySelectorAll('.hand [data-card-id]')];
    expect(cards.map((c) => c.getAttribute('data-card-id'))).toEqual(['52', '51', '39', '0', '53']);
    expect(cards.map((c) => c.hasAttribute('data-trump'))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    const slots = [...document.querySelectorAll('.hand-slot')];
    expect(slots.map((s) => s.classList.contains('group-start'))).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
  });
});

describe('hovering the hand', () => {
  const fans = () =>
    [...document.querySelectorAll<HTMLElement>('.hand-fan')].map((f) => ({
      part: Number(f.style.getPropertyValue('--part')),
      raise: Number(f.style.getPropertyValue('--raise')),
    }));

  it('parts the cards away from the hovered one, most where they are closest', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => partOffset(i, 2))).toEqual([-0.35, -0.5, 0, 1, 0.7, 0.45]);
    expect(partOffset(3, -1)).toBe(0);
    expect(partOffset(9, 2)).toBe(0);
  });

  it('raises the hovered card without reordering, and settles when the pointer leaves', () => {
    render(<Hand ids={[0, 1, 2, 3, 4]} trump={null} cardProps={() => ({ onClick: () => {} })} />);
    const slots = [...document.querySelectorAll('.hand-slot')];
    const before = slots.map((s) => s.textContent);
    fireEvent.pointerEnter(slots[2] as Element, { pointerType: 'mouse' });
    expect(fans()).toEqual([
      { part: -0.35, raise: 0 },
      { part: -0.5, raise: 0 },
      { part: 0, raise: 1 },
      { part: 1, raise: 0 },
      { part: 0.7, raise: 0 },
    ]);
    expect([...document.querySelectorAll('.hand-slot')].map((s) => s.textContent)).toEqual(before);
    fireEvent.pointerLeave(document.querySelector('.hand') as Element);
    expect(fans().every((f) => f.part === 0 && f.raise === 0)).toBe(true);
  });

  it('parts the hand for keyboard focus too', () => {
    render(<Hand ids={[0, 1, 2]} trump={null} cardProps={() => ({ onClick: () => {} })} />);
    const buttons = document.querySelectorAll<HTMLElement>('.hand button.card');
    act(() => (buttons[1] as HTMLElement).focus());
    expect(fans()).toEqual([
      { part: -0.5, raise: 0 },
      { part: 0, raise: 1 },
      { part: 1, raise: 0 },
    ]);
  });

  it("leaves the hand still under a card you can't click, greyed out or while you wait", () => {
    const { unmount } = render(
      <Hand
        ids={[0, 1, 2]}
        trump={null}
        cardProps={(id) => ({ onClick: () => {}, disabled: id === 1 })}
      />,
    );
    const slots = () => [...document.querySelectorAll('.hand-slot')];
    // Hovering a playable card, then moving onto a greyed-out one, settles the hand.
    fireEvent.pointerEnter(slots()[0] as Element, { pointerType: 'mouse' });
    expect(fans()[0]?.raise).toBe(1);
    fireEvent.pointerEnter(slots()[1] as Element, { pointerType: 'mouse' });
    expect(fans().every((f) => f.part === 0 && f.raise === 0)).toBe(true);
    act(() => document.querySelector<HTMLElement>('[data-card-id="1"]')?.focus());
    expect(fans().every((f) => f.part === 0 && f.raise === 0)).toBe(true);
    unmount();
    // While you wait, the cards can't be clicked and aren't greyed out: still no movement.
    render(<Hand ids={[0, 1, 2]} trump={null} cardProps={() => ({})} />);
    fireEvent.pointerEnter(slots()[1] as Element, { pointerType: 'mouse' });
    expect(fans().every((f) => f.part === 0 && f.raise === 0)).toBe(true);
    expect(document.querySelector('.card-disabled')).toBeNull();
  });
});

describe('Hand result', () => {
  const scored: TableView = {
    ...dealt,
    phase: 'hand-complete',
    turn: null,
    legal: { kind: 'continue' },
    continuePending: [0, 3],
    result: {
      handNumber: 1,
      dealer: 0,
      redeals: 0,
      bidder: 1,
      bid: 100_000,
      trump: 'red',
      biddingTeam: 1,
      captured: [60_000, 120_000],
      made: true,
      delta: [60_000, 120_000],
      scoresAfter: [60_000, 120_000],
      tricks: [],
    },
  };

  // The review opens a moment after the hand ends (the last trick is already gathered here).
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const openReview = () => act(() => vi.advanceTimersByTime(RESULT_PAUSE_MS));

  it('lets the end of the hand sink in before the review opens', () => {
    renderWith([welcome, { type: 'room', room: room('playing') }, { type: 'view', view: scored }]);
    act(() => vi.advanceTimersByTime(RESULT_PAUSE_MS - 100));
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole('dialog', { name: /^Hand 1/ })).toBeInTheDocument();
  });

  it('shows who is ready and how long is left, and readies this seat', () => {
    renderWith([
      welcome,
      { type: 'room', room: room('playing') },
      { type: 'view', view: scored, resultTimer: { remainingMs: 12_400, totalMs: 20_000 } },
    ]);
    openReview();
    const dialog = screen.getByRole('dialog', { name: /^Hand 1\W+They made their bid$/ });
    // The outcome is in the title, in green or red as it went for this seat's side.
    expect(dialog.querySelector('.result-status')).toHaveClass('bad');
    // The bar says how the bid went; there is no separate line restating the bid.
    expect(dialog).not.toHaveTextContent('Bot 2 bid');
    expect(screen.getByRole('timer')).toHaveAccessibleName('Next hand in 11 seconds');
    const list = screen.getByRole('list', { name: 'Ready for the next hand' });
    expect(list).toHaveTextContent('You: still reading');
    expect(list).toHaveTextContent('Bot 2: ready');
    expect(list).toHaveTextContent('Bot 4: still reading');
    fireEvent.click(screen.getByRole('button', { name: 'Ready' }));
    expect(screen.getByText(NOT_CONNECTED)).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });

  it('waits on the others once this seat is ready', () => {
    renderWith([
      welcome,
      { type: 'room', room: room('playing') },
      {
        type: 'view',
        view: { ...scored, legal: { kind: 'none' }, continuePending: [3] },
        resultTimer: { remainingMs: 5_000, totalMs: 20_000 },
      },
    ]);
    openReview();
    expect(screen.queryByRole('button', { name: 'Ready' })).toBeNull();
    expect(screen.getByText('Waiting for the others…')).toBeInTheDocument();
  });

  it("puts the hand on one bar, each side's score and total at its end, the cards behind a button", () => {
    const result = scored.result;
    if (!result) throw new Error('fixture has a result');
    renderWith([
      welcome,
      { type: 'room', room: room('playing') },
      {
        type: 'view',
        view: {
          ...scored,
          result: {
            ...result,
            tricks: [
              // Bot 2 (them) takes Green $40k and the Bull: doubled.
              {
                leader: 1,
                winner: 1,
                cardIds: [51, 53, 39, 0],
                money: 40_000,
                modifier: 'bull',
                value: 80_000,
              },
              // Ann (us) takes a trick with no Money in it.
              { leader: 0, winner: 0, cardIds: [1, 2, 3, 4], money: 0, modifier: 'none', value: 0 },
            ],
          },
        },
      },
    ]);
    openReview();
    expect(
      screen.getByRole('img', {
        name: /captured \$120,000 against a \$100,000 bid: made by \$20k/,
      }),
    ).toBeInTheDocument();
    // Your side on the left, with what it scored and what it now holds.
    const sides = screen.getAllByRole('region').filter((r) => r.closest('.score-bar'));
    expect(sides.map((r) => r.getAttribute('aria-label'))).toEqual(['Us', 'Them']);
    expect(sides[0]).toHaveTextContent('+$60,000');
    expect(sides[0]).toHaveTextContent('Total $60,000');
    expect(sides[1]).toHaveTextContent('Total $120,000');
    // Them bid, so the bid is marked from the right: $100k of $180k.
    const notch = document.querySelector('.score-bar-notch') as HTMLElement;
    expect(Number.parseFloat(notch.style.left)).toBeCloseTo(100 - (100 / 180) * 100, 1);

    // The cards wait behind a button.
    expect(screen.queryByRole('region', { name: 'Cards played' })).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Show the cards' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const cards = screen.getByRole('region', { name: 'Cards played' });
    expect(toggle).toHaveAccessibleName('Hide the cards');
    const tricks = within(cards).getAllByRole('listitem');
    expect(tricks[0]).toHaveTextContent(/^1\. Bot 2\$80k ×2/);
    expect(tricks[0]).toHaveClass('side-them');
    expect(within(tricks[0] as HTMLElement).getAllByRole('img')).toHaveLength(4);
    expect(tricks[1]).toHaveTextContent(/^2\. You\$0/);
  });
});
