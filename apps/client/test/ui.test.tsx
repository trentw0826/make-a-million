import { createGame, observe, tableView } from '@mam/engine';
import type { RoomView, ServerMessage } from '@mam/protocol';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { Shell } from '../src/App';
import { EventLog } from '../src/components/EventLog';
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
