import { useEffect } from 'react';

const TITLE = 'Make-a-Million';

/** While the tab is in the background and the table waits on this player, say so in its title. */
export function useTurnTitle(myTurn: boolean): void {
  useEffect(() => {
    const update = () => {
      document.title = myTurn && document.hidden ? `● Your turn — ${TITLE}` : TITLE;
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      document.title = TITLE;
    };
  }, [myTurn]);
}
