import type { TableView } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { useEffect, useId, useRef, useState } from 'react';
import type { LogEntry } from '../state';
import { EventLog } from './EventLog';
import { Icon } from './Icon';
import { isModalOpen } from './Modal';
import { ScoreSheet } from './ScoreSheet';

interface Props {
  readonly view: TableView;
  readonly room: RoomView;
  readonly log: readonly LogEntry[];
}

/**
 * The score sheet and the table log, kept off the table until asked for: a sheet icon in the
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
        aria-label="Score sheet & log"
        title="Score sheet & log"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="sheet" />
      </button>
      {open && <div className="drawer-scrim" aria-hidden="true" />}
      {open && (
        <aside ref={drawer} id={id} className="drawer" aria-label="Score sheet and table log">
          <button
            type="button"
            className="drawer-close"
            aria-label="Close the score sheet and log"
            onClick={() => {
              setOpen(false);
              toggle.current?.focus();
            }}
          >
            ✕
          </button>
          <ScoreSheet view={view} room={room} />
          <EventLog entries={log} />
        </aside>
      )}
    </>
  );
}
