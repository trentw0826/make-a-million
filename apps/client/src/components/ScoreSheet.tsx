import { otherTeam, type TableView } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { nameOf, SUIT_NAMES, shortMoney } from '../format';

/** The paper score sheet: one line per completed hand, our side first. */
export function ScoreSheet({ view, room }: { view: TableView; room: RoomView }) {
  const us = view.team;
  return (
    <section className="score-sheet" aria-label="Score sheet">
      <h2>Score sheet</h2>
      {view.handHistory.length === 0 ? (
        <p className="muted small">No hands scored yet.</p>
      ) : (
        <table className="sheet">
          <thead>
            <tr>
              <th>#</th>
              <th>Bidder</th>
              <th>Bid</th>
              <th>Trump</th>
              <th className="num">Us</th>
              <th className="num">Them</th>
            </tr>
          </thead>
          <tbody>
            {view.handHistory.map((h) => (
              <tr key={h.handNumber} className={h.made ? '' : 'set'}>
                <td>{h.handNumber}</td>
                <td>{nameOf(room, h.bidder)}</td>
                <td className="nowrap">
                  {shortMoney(h.bid)} {h.made ? '✓' : '✗'}
                </td>
                <td>{SUIT_NAMES[h.trump]}</td>
                <td className="num">{shortMoney(h.scoresAfter[us])}</td>
                <td className="num">{shortMoney(h.scoresAfter[otherTeam(us)])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
