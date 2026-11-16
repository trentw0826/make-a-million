import { otherTeam, type TableView } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { useState } from 'react';
import { money, nameOf, SUIT_NAMES, shortMoney, signedShortMoney, teamLabel } from '../format';

/** The paper score sheet: cumulative totals and one line per completed hand, our side first. */
export function ScoreSheet({ view, room }: { view: TableView; room: RoomView }) {
  const target = view.ruleset.targetScore;
  const us = view.team;
  const sides = [
    { team: us, name: 'Us', side: 'us' },
    { team: otherTeam(us), name: 'Them', side: 'them' },
  ] as const;

  // Float each side's change once the result dialog closes; hands already on the sheet when
  // the table opened (a reload) don't float.
  const [seenAtMount] = useState(() => view.handHistory.at(-1)?.handNumber ?? 0);
  const latest = view.handHistory.at(-1);
  const fresh =
    latest && latest.handNumber > seenAtMount && view.phase !== 'hand-complete' ? latest : null;

  return (
    <section className="score-sheet" aria-label="Score sheet">
      <h2>Score sheet</h2>
      <div className="totals">
        {sides.map(({ team, name, side }) => {
          const score = view.scores[team];
          const progress = Math.max(0, Math.min(100, (score / target) * 100));
          return (
            <div key={team} className={`total side-${side}`}>
              <div className="total-head">
                <span className="side-dot" aria-hidden="true" />
                <strong>{name}</strong> <span className="muted small">{teamLabel(room, team)}</span>
              </div>
              <div className="total-score">
                <strong className={score < 0 ? 'neg' : ''}>{money(score)}</strong>
                {fresh && (
                  <span
                    key={fresh.handNumber}
                    className={`delta-float ${fresh.delta[team] < 0 ? 'neg' : 'pos'}`}
                  >
                    {signedShortMoney(fresh.delta[team])}
                  </span>
                )}
              </div>
              <div className="progress" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </div>
              <div className="muted small">of {money(target)}</div>
            </div>
          );
        })}
      </div>
      {view.handHistory.length > 0 && (
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
