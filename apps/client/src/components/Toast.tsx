import { useEffect } from 'react';
import { useGame } from '../store';
import { Panel } from './ui/Panel';

export function Toast() {
  const { state, dispatch } = useGame();
  const toast = state.toast;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => dispatch({ kind: 'toast', toast: null }), 4000);
    return () => clearTimeout(timer);
  }, [toast, dispatch]);

  if (!toast) return null;
  return (
    <Panel
      as="output"
      tone="paper"
      pad="sm"
      className={`toast toast-${toast.kind}`}
      aria-live="polite"
    >
      {toast.text}
    </Panel>
  );
}
