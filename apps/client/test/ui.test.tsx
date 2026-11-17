import { createGame, observe, type TableView, tableView } from '@mam/engine';
import type { RoomView, ServerMessage } from '@mam/protocol';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { Shell } from '../src/App';
import { ActionBar } from '../src/components/ActionBar';
import { ContractBar } from '../src/components/ContractBar';
import { EventLog } from '../src/components/EventLog';
import { Hand, partOffset } from '../src/components/Hand';
import { Scoreboard } from '../src/components/Scoreboard';
import { SeatPanel } from '../src/components/SeatPanel';
import { TableDrawer } from '../src/components/TableDrawer';
import { TrickPile } from '../src/components/TrickPile';
import { GameProvider, useGame } from '../src/store';

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
    const dialog = screen.getByRole('dialog', { name: 'How to play' });
    expect(dialog).toHaveTextContent('$175,000 or more');
    expect(dialog).toHaveTextContent('$40k · $30k · $15k · 11 · $10k · 9 · 8 · 7 · $5k');
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

  it('shows the room code with an invite button', () => {
    renderWith(inLobby);
    expect(document.querySelector('.topbar')).toHaveTextContent('Room ABC123');
    expect(screen.getAllByRole('button', { name: 'Copy invite link' }).length).toBeGreaterThan(0);
  });

  it('leaves the lobby at once', () => {
    renderWith(inLobby);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(NOT_CONNECTED)).toBeInTheDocument();
  });

  it('asks before leaving a game in progress', () => {
    renderWith(atTable);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(screen.getByRole('dialog', { name: 'Leave the game?' })).toBeInTheDocument();
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

describe('table log', () => {
  it('folds earlier hands under their result and keeps the current hand open', () => {
    render(
      <EventLog
        entries={[
          { id: 1, hand: 1, text: 'Ann deals.', tone: 'info' },
          { id: 2, hand: 1, text: 'Ann & Cid made the $185k bid (+$210k).', tone: 'good' },
          { id: 3, hand: 2, text: 'Bot 2 deals.', tone: 'info' },
        ]}
      />,
    );
    const earlier = screen.getByText('Hand 1').closest('details');
    expect(earlier).not.toHaveAttribute('open');
    expect(earlier?.querySelector('summary')).toHaveTextContent('made the $185k bid');
    expect(screen.getByRole('heading', { name: 'Hand 2' })).toBeInTheDocument();
    expect(screen.getByText('Bot 2 deals.')).toBeVisible();
  });
});

describe('scoreboard', () => {
  it("shows each side's total on the felt, our side first", () => {
    const view: TableView = { ...dealt, team: 1, scores: [-40_000, 250_000] };
    render(<Scoreboard view={view} room={room('playing')} />);
    const totals = [...document.querySelectorAll('.scoreboard .total')].map((t) => t.textContent);
    expect(totals[0]).toMatch(/^Us\$250,000/);
    expect(totals[1]).toMatch(/^Them−\$40,000/);
    expect(screen.getByText('to $1,000,000')).toBeInTheDocument();
  });
});

describe('lobby', () => {
  it('turns the table so your chair is at the bottom, partner across', () => {
    const lobby: RoomView = {
      ...room('lobby'),
      seats: [
        null,
        { kind: 'bot', name: 'Bot 2', difficulty: 'hard' },
        { kind: 'human', playerId: 'p1', name: 'Ann', connected: true, botControlled: false },
        null,
      ],
      yourSeat: 2,
    };
    renderWith([welcome, { type: 'room', room: lobby }]);
    const chair = (n: number) => screen.getByRole('group', { name: `Seat ${n}` });
    expect(chair(3)).toHaveClass('chair-bottom', 'chair-mine', 'side-us');
    expect(chair(1)).toHaveClass('chair-top', 'chair-empty', 'side-us');
    expect(chair(2)).toHaveClass('chair-right', 'side-them');
    expect(chair(2)).toHaveTextContent('Bot 2 · Hard');
    expect(chair(4)).toHaveClass('chair-left', 'side-them');
    // The host fills an empty chair with a bot of the chosen strength.
    expect(within(chair(4)).getByRole('button', { name: '+ Bot · Hard' })).toBeInTheDocument();
    expect(within(chair(4)).getByRole('button', { name: 'Sit here' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled();
  });
});

describe('score sheet and log drawer', () => {
  const entries = [{ id: 1, hand: 1, text: 'Ann deals.', tone: 'info' as const }];

  it('opens from its button and puts itself away on Esc or its close button', () => {
    render(<TableDrawer view={dealt} room={room('playing')} log={entries} />);
    const toggle = screen.getByRole('button', { name: 'Score sheet & log' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('complementary')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const drawer = screen.getByRole('complementary', { name: 'Score sheet and table log' });
    expect(drawer).toHaveTextContent('No hands scored yet.');
    expect(drawer).toHaveTextContent('Ann deals.');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(toggle).toHaveFocus();

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Close the score sheet and log' }));
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('dims the table while open, and a click anywhere else puts it away', () => {
    render(
      <div>
        <p>The table</p>
        <TableDrawer view={dealt} room={room('playing')} log={entries} />
      </div>,
    );
    const toggle = screen.getByRole('button', { name: 'Score sheet & log' });
    expect(document.querySelector('.drawer-scrim')).toBeNull();
    fireEvent.click(toggle);
    expect(document.querySelector('.drawer-scrim')).not.toBeNull();

    // A press inside the sheet keeps it open.
    fireEvent.pointerDown(screen.getByText('Ann deals.'));
    expect(screen.getByRole('complementary')).toBeInTheDocument();

    fireEvent.pointerDown(document.querySelector('.drawer-scrim') as Element);
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(document.querySelector('.drawer-scrim')).toBeNull();

    fireEvent.click(toggle);
    fireEvent.pointerDown(screen.getByText('The table'));
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});

describe('trick piles', () => {
  it('shows each taken trick face down, and nothing of what is in it', () => {
    render(<TrickPile side="them" count={2} incoming={null} />);
    const pile = screen.getByRole('img', { name: 'Opponents: 2 tricks taken' });
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
    render(<TrickPile side="us" count={1} incoming={incoming} />);
    const pile = screen.getByRole('img', { name: 'Your side: 2 tricks taken' });
    expect(pile.querySelectorAll('.pile-card.trick-sweep .card-3d')).toHaveLength(4);
    expect(pile.querySelectorAll('.pile-card:not(.trick-sweep)')).toHaveLength(4);
  });

  it('says one trick, not one tricks', () => {
    render(<TrickPile side="us" count={1} incoming={null} />);
    expect(screen.getByRole('img', { name: 'Your side: 1 trick taken' })).toBeInTheDocument();
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
    expect(screen.getByText('Your turn.')).toHaveClass('visually-hidden');
  });

  it('keeps the score sheet, sound and How to play as icons in the corner', () => {
    renderWith(atTable);
    const corner = document.querySelector('.table-corner') as HTMLElement;
    for (const name of ['Score sheet & log', 'Mute sounds', 'How to play']) {
      const button = within(corner).getByRole('button', { name });
      expect(button).toHaveClass('icon-btn');
      expect(button.querySelector('svg')).not.toBeNull();
    }
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
    expect(document.querySelector('.me-line')).not.toHaveTextContent('bidder');
  });

  it('asks for the discard in two words, with the rules behind a ?', () => {
    const discarding: TableView = {
      ...dealt,
      phase: 'discarding',
      legal: { kind: 'discard', requiredNumberCards: 2, forbiddenIds: [] },
    };
    render(
      <GameProvider url={URL}>
        <ActionBar
          view={discarding}
          room={room('playing')}
          selected={new Set()}
          onClearSelection={() => {}}
        />
      </GameProvider>,
    );
    const bar = document.querySelector('.action-bar') as HTMLElement;
    expect(bar).toHaveTextContent(/^Your turn\.Discard 3Discard\?/);
    const tip = screen.getByRole('button', { name: 'Discard rules' });
    expect(tip).toHaveAccessibleDescription(/Number cards must go before Money/);
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
  });

  it('fades a seat that has passed, leaving its Pass chip clear', () => {
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
    expect(screen.getByText('Pass')).toBeInTheDocument();
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
    render(<Hand ids={[0, 1, 2, 3, 4]} trump={null} cardProps={() => ({})} />);
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

  it('parts the hand for keyboard focus too, but does not raise a card that cannot be played', () => {
    render(
      <Hand
        ids={[0, 1, 2]}
        trump={null}
        cardProps={() => ({ onClick: () => {}, disabled: true })}
      />,
    );
    const buttons = document.querySelectorAll<HTMLElement>('.hand button.card');
    act(() => (buttons[1] as HTMLElement).focus());
    expect(fans()).toEqual([
      { part: -0.5, raise: 0 },
      { part: 0, raise: 0 },
      { part: 1, raise: 0 },
    ]);
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

  it('shows who is ready and how long is left, and readies this seat', () => {
    renderWith([
      welcome,
      { type: 'room', room: room('playing') },
      { type: 'view', view: scored, resultTimer: { remainingMs: 12_400, totalMs: 20_000 } },
    ]);
    const dialog = screen.getByRole('dialog', { name: 'Hand 1' });
    expect(screen.getByRole('timer')).toHaveAccessibleName('Next hand in 13 seconds');
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
    expect(screen.queryByRole('button', { name: 'Ready' })).toBeNull();
    expect(screen.getByText('Waiting for the others…')).toBeInTheDocument();
  });

  it("weighs the capture against the bid and lays out each side's tricks as tiles", () => {
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
    expect(
      screen.getByRole('img', {
        name: /captured \$120,000 against a \$100,000 bid: made by \$20k/,
      }),
    ).toBeInTheDocument();
    const them = screen.getByRole('region', { name: 'Them' });
    const bull = within(them).getByRole('button', { name: 'Trick 1: $80,000 (Bull ×2)' });
    expect(bull).toHaveAccessibleDescription(/Bull/);
    expect(within(them).getByText('1 trick')).toBeInTheDocument();
    const us = screen.getByRole('region', { name: 'Us' });
    expect(within(us).getByRole('button', { name: 'Trick 2: $0' })).toBeInTheDocument();
    expect(us).toHaveTextContent('Captured $60,000 · Total $60,000');
  });
});
