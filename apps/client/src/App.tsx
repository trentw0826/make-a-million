import { DEFAULT_RULESET } from '@mam/engine';
import { MotionConfig } from 'motion/react';
import { HowToPlay } from './components/HowToPlay';
import { Toast } from './components/Toast';
import { ConnectionBanner, TopBar } from './components/TopBar';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Table } from './screens/Table';
import { GameProvider, useGame } from './store';
import { useHelpKey } from './useHotkeys';

/** The screen for where the player is; each fades in as it takes over the window. */
function Screen() {
  const { state } = useGame();
  const { room, view } = state;
  if (!room) {
    return (
      <div key="home" className="screen">
        <Home />
      </div>
    );
  }
  if (room.phase === 'lobby' || !view || room.yourSeat === null) {
    return (
      <div key="lobby" className="screen">
        <Lobby room={room} />
      </div>
    );
  }
  return (
    <div key="table" className="screen">
      <Table room={room} view={view} />
    </div>
  );
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
      {/* Movement follows the player's reduced-motion setting; fades still play. */}
      <MotionConfig reducedMotion="user">
        <Shell />
      </MotionConfig>
    </GameProvider>
  );
}
