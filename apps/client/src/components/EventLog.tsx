import { useEffect, useRef } from 'react';
import type { LogEntry } from '../state';

/** What has been said and done at the table, as a human would hear it. */
export function EventLog({ entries }: { entries: readonly LogEntry[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (entries.length > 0) end.current?.scrollIntoView({ block: 'nearest' });
  }, [entries]);
  return (
    <section className="event-log" aria-label="Table talk">
      <h2>At the table</h2>
      <ul>
        {entries.map((e) => (
          <li key={e.id}>{e.text}</li>
        ))}
      </ul>
      <div ref={end} />
    </section>
  );
}
