import { Toast } from './components/Toast';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Table } from './screens/Table';
import { GameProvider, useGame } from './store';

function Screen() {
  const { state } = useGame();
  const { room, view } = state;
  if (!room) return <Home />;
  if (room.phase === 'lobby' || !view || room.yourSeat === null) return <Lobby room={room} />;
  return <Table room={room} view={view} />;
}

export function App({ url }: { url?: string }) {
  return (
    <GameProvider {...(url ? { url } : {})}>
      <Screen />
      <Toast />
    </GameProvider>
  );
}
