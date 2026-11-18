import type { TableView } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import type { LogEntry } from '../state';
import { EASE_OUT } from '../theme/motion';
import { Icon } from './Icon';
import { isModalOpen } from './Modal';
import { ScoreSheet } from './ScoreSheet';

const DRAWER_S = 0.22;

interface Props {
  readonly view: TableView;
  readonly room: RoomView;
  readonly log: readonly LogEntry[];
}

/**
 * The score sheet, with each hand's table log in it, kept off the table until asked for: a sheet icon in the
 * corner by your seat slides them in over the felt's right edge, and the table dims behind
 * them. Play goes on while it is open. The button, its close button, Esc, or a click anywhere
 * else put it away; a click on the dimmed table only closes the sheet, so it can't play a
 * card by accident.
 */
export function TableDrawer({ view, room, log }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isModalOpen()) return;
      e.preventDefault();
      setOpen(false);
      toggle.current?.focus();
    };
    // A press anywhere but the sheet and its own button (which toggles it) puts it away.
    const onPress = (e: PointerEvent) => {
      const target = e.target as Node;
      if (drawer.current?.contains(target) || toggle.current?.contains(target)) return;
      if (isModalOpen()) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress);
    };
  }, [open]);

  return (
    <>
      <button
        ref={toggle}
        type="button"
        className="ghost small icon-btn drawer-toggle"
        aria-label="Score sheet"
        title="Score sheet"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="sheet" />
      </button>
      {/* It leaves the way it came: the sheet slides back out and the table brightens. */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="scrim"
            className="drawer-scrim"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DRAWER_S, ease: EASE_OUT }}
          />
        )}
        {open && (
          <motion.aside
            key="sheet"
            ref={drawer}
            id={id}
            className="drawer"
            aria-label="Score sheet"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: DRAWER_S, ease: EASE_OUT }}
          >
            <button
              type="button"
              className="drawer-close"
              aria-label="Close the score sheet"
              onClick={() => {
                setOpen(false);
                toggle.current?.focus();
              }}
            >
              ✕
            </button>
            <ScoreSheet view={view} room={room} log={log} />
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
