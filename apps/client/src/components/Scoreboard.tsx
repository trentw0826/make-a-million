import { otherTeam, type TableView } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { useState } from 'react';
import { money, signedShortMoney, teamLabel } from '../format';

/**
 * Each side's total and how far it is toward the target, in the corner of the felt, our side
 * first. Each side's change floats up once the result dialog closes.
 */
export function Scoreboard({ view, room }: { view: TableView; room: RoomView }) {
  const target = view.ruleset.targetScore;
  const us = view.team;
  const sides = [
    { team: us, name: 'Us', side: 'us' },
    { team: otherTeam(us), name: 'Them', side: 'them' },
  ] as const;

  // Hands already on the sheet when the table opened (a reload) don't float.
  const [seenAtMount] = useState(() => view.handHistory.at(-1)?.handNumber ?? 0);
  const latest = view.handHistory.at(-1);
  const fresh =
    latest && latest.handNumber > seenAtMount && view.phase !== 'hand-complete' ? latest : null;

  return (
    <section className="scoreboard" aria-label="Scores">
      {sides.map(({ team, name, side }) => {
        const score = view.scores[team];
        const progress = Math.max(0, Math.min(100, (score / target) * 100));
        return (
          <div key={team} className={`total side-${side}`} title={teamLabel(room, team)}>
            <div className="total-head">
              <span className="side-dot" aria-hidden="true" />
              <span className="total-name">{name}</span>
              <strong className={score < 0 ? 'total-score neg' : 'total-score'}>
                {money(score)}
              </strong>
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
          </div>
        );
      })}
      <div className="scoreboard-target">to {money(target)}</div>
    </section>
  );
}
