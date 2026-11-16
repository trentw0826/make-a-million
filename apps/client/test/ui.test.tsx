import { createGame, observe, type TableView, tableView } from '@mam/engine';
import type { RoomView, ServerMessage } from '@mam/protocol';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { Shell } from '../src/App';
import { ContractBar } from '../src/components/ContractBar';
import { EventLog } from '../src/components/EventLog';
import { Hand } from '../src/components/Hand';
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
/** A fresh deal: every seat must confirm it is ready to bid. */
const dealt = tableView(observe(createGame({ seed: 'ui' }), 0));
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
  it('Enter confirms Ready to bid', () => {
    renderWith(atTable);
    expect(screen.getByRole('button', { name: 'Ready to bid' })).toBeInTheDocument();
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
    expect(screen.getByText('Your turn')).toBeInTheDocument();
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
});
