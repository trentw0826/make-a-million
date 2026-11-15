import { DEFAULT_RULESET } from '@mam/engine';
import { HowToPlay } from './components/HowToPlay';
import { Toast } from './components/Toast';
import { ConnectionBanner, TopBar } from './components/TopBar';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Table } from './screens/Table';
import { GameProvider, useGame } from './store';
import { useHelpKey } from './useHotkeys';

function Screen() {
  const { state } = useGame();
  const { room, view } = state;
  if (!room) return <Home />;
  if (room.phase === 'lobby' || !view || room.yourSeat === null) return <Lobby room={room} />;
  return <Table room={room} view={view} />;
}

/** Everything inside the provider; exported so tests can seed the store first. */
export function Shell() {
  const { state, dispatch } = useGame();
  const helpOpen = state.helpOpen;
  useHelpKey(() => dispatch({ kind: 'help', open: !helpOpen }));
  return (
    <div className="app">
      <TopBar />
      <ConnectionBanner />
      <Screen />
      {helpOpen && (
        <HowToPlay
          ruleset={state.view?.ruleset ?? DEFAULT_RULESET}
          onClose={() => dispatch({ kind: 'help', open: false })}
        />
      )}
      <Toast />
    </div>
  );
}

export function App({ url }: { url?: string }) {
  return (
    <GameProvider {...(url ? { url } : {})}>
      <Shell />
    </GameProvider>
  );
}
