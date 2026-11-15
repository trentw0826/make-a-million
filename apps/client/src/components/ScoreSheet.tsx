import type { TableView } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { money, nameOf, SUIT_NAMES, teamLabel } from '../format';

/** The paper score sheet: cumulative totals and one line per completed hand. */
export function ScoreSheet({ view, room }: { view: TableView; room: RoomView }) {
  const target = view.ruleset.targetScore;
  return (
    <section className="score-sheet" aria-label="Score sheet">
      <h2>Score sheet</h2>
      <div className="totals">
        {([0, 1] as const).map((team) => (
          <div key={team} className={`total ${view.team === team ? 'total-mine' : ''}`}>
            <div className="muted small">{teamLabel(room, team)}</div>
            <strong>{money(view.scores[team])}</strong>
            <div className="muted small">of {money(target)}</div>
          </div>
        ))}
      </div>
      {view.contract && view.trump && view.phase !== 'hand-complete' && (
        <p className="small">
          Contract: {nameOf(room, view.contract.bidder)} {money(view.contract.amount)} in{' '}
          {SUIT_NAMES[view.trump]}. Tricks: {view.trickCounts[0]} – {view.trickCounts[1]}.
        </p>
      )}
      {view.handHistory.length > 0 && (
        <table className="sheet">
          <thead>
            <tr>
              <th>#</th>
              <th>Bidder</th>
              <th>Bid</th>
              <th>Trump</th>
              <th>A</th>
              <th>B</th>
            </tr>
          </thead>
          <tbody>
            {view.handHistory.map((h) => (
              <tr key={h.handNumber} className={h.made ? '' : 'set'}>
                <td>{h.handNumber}</td>
                <td>{nameOf(room, h.bidder)}</td>
                <td>
                  {money(h.bid)} {h.made ? '✓' : 'set'}
                </td>
                <td>{SUIT_NAMES[h.trump]}</td>
                <td>{money(h.scoresAfter[0])}</td>
                <td>{money(h.scoresAfter[1])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
