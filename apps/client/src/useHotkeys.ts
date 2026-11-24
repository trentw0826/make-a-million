import { useEffect } from 'react';
import { isModalOpen } from './components/Modal';

/** True when a key press belongs to a text field rather than to the page. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

function hasModifier(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey || e.altKey;
}

/** Calls `handler` for every keydown on the page while mounted (pass null to stop). */
export function useKeydown(handler: ((e: KeyboardEvent) => void) | null): void {
  useEffect(() => {
    if (!handler) return;
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}

/** `?` toggles How to play from anywhere except a text field. */
export function useHelpKey(toggle: () => void): void {
  useKeydown((e) => {
    if (e.key !== '?' || hasModifier(e) || isTyping(e.target)) return;
    e.preventDefault();
    toggle();
  });
}

/**
 * Keys for the decision in front of the player, such as `{ Enter: bid }`. They are ignored
 * while a dialog is open, while typing, with a modifier held, and (for Enter) while a button
 * has focus, since the browser already presses a focused button on Enter.
 */
export function useGameKeys(keys: Readonly<Record<string, () => void>>): void {
  useKeydown((e) => {
    if (e.defaultPrevented || hasModifier(e) || isModalOpen() || isTyping(e.target)) return;
    if (e.key === 'Enter' && e.target instanceof HTMLButtonElement) return;
    const run = keys[e.key];
    if (!run) return;
    e.preventDefault();
    run();
  });
}

/**
 * Ctrl+Z (⌘Z) undoes, and Ctrl+Shift+Z or Ctrl+Y (⌘⇧Z) redoes, except while typing or with
 * a dialog open. Pass null to turn them off.
 */
export function useUndoKeys(keys: { undo: () => void; redo: () => void } | null): void {
  useKeydown(
    keys
      ? (e) => {
          if (!(e.ctrlKey || e.metaKey) || e.altKey || isModalOpen() || isTyping(e.target)) return;
          const key = e.key.toLowerCase();
          const redo = (key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey);
          if (key !== 'z' && !redo) return;
          e.preventDefault();
          if (redo) keys.redo();
          else keys.undo();
        }
      : null,
  );
}
