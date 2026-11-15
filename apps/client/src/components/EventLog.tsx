import { useEffect, useRef } from 'react';
import type { LogEntry } from '../state';

interface HandGroup {
  readonly hand: number;
  readonly entries: readonly LogEntry[];
}

export function groupByHand(entries: readonly LogEntry[]): HandGroup[] {
  const groups: { hand: number; entries: LogEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    if (last && last.hand === entry.hand) last.entries.push(entry);
    else groups.push({ hand: entry.hand, entries: [entry] });
  }
  return groups;
}

function Lines({ entries }: { entries: readonly LogEntry[] }) {
  return (
    <ul>
      {entries.map((e) => (
        <li key={e.id} className={`tone-${e.tone}`}>
          {e.text}
        </li>
      ))}
    </ul>
  );
}

/**
 * What was said at the table, a few lines per hand. The current hand is open; earlier hands
 * fold up under their result.
 */
export function EventLog({ entries }: { entries: readonly LogEntry[] }) {
  const box = useRef<HTMLElement>(null);
  // Follow new lines only while the reader is at the bottom, so scrolling back stays put.
  const atBottom = useRef(true);
  useEffect(() => {
    const el = box.current;
    if (el && atBottom.current && entries.length > 0) el.scrollTop = el.scrollHeight;
  }, [entries]);

  const groups = groupByHand(entries);
  return (
    <section
      ref={box}
      className="event-log"
      aria-label="Table log"
      onScroll={(e) => {
        const el = e.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      <h2>Table log</h2>
      {groups.length === 0 && <p className="muted small">Nothing yet.</p>}
      {groups.map((group, i) => {
        const title = group.hand > 0 ? `Hand ${group.hand}` : 'This hand';
        if (i === groups.length - 1) {
          return (
            <div key={group.hand} className="log-hand log-current">
              <h3>{title}</h3>
              <Lines entries={group.entries} />
            </div>
          );
        }
        const outcome = group.entries.findLast((e) => e.tone !== 'info') ?? group.entries.at(-1);
        return (
          <details key={group.hand} className="log-hand">
            <summary>
              <span className="log-hand-title">{title}</span>{' '}
              {outcome && <span className={`tone-${outcome.tone}`}>{outcome.text}</span>}
            </summary>
            <Lines entries={group.entries} />
          </details>
        );
      })}
    </section>
  );
}
