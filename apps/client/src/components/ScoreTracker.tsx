import { otherTeam, type TableView } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { type ReactNode, useState } from 'react';
import { money, signedShortMoney, teamLabel } from '../format';

/**
 * One side's total and how far it is toward the target, in its own corner of the felt: ours
 * bottom left, by your seat, and theirs top right. The side's taken tricks (`pile`) lie
 * beside it, toward the middle. The change from the last hand floats up once the result
 * dialog closes; the other side's corner also says which hand this is and the target.
 */
export function ScoreTracker({
  view,
  room,
  side,
  pile,
}: {
  view: TableView;
  room: RoomView;
  side: 'us' | 'them';
  pile: ReactNode;
}) {
  const target = view.ruleset.targetScore;
  const team = side === 'us' ? view.team : otherTeam(view.team);
  const score = view.scores[team];
  const progress = Math.max(0, Math.min(100, (score / target) * 100));

  // Hands already on the sheet when the table opened (a reload) don't float.
  const [seenAtMount] = useState(() => view.handHistory.at(-1)?.handNumber ?? 0);
  const latest = view.handHistory.at(-1);
  const fresh =
    latest && latest.handNumber > seenAtMount && view.phase !== 'hand-complete' ? latest : null;

  return (
    <section
      className={`tracker tracker-${side} side-${side}`}
      aria-label={side === 'us' ? 'Us' : 'Them'}
    >
      <div className="total" title={teamLabel(room, team)}>
        <div className="total-head">
          <span className="side-dot" aria-hidden="true" />
          <span className="total-name">{side === 'us' ? 'Us' : 'Them'}</span>
          <strong className={score < 0 ? 'total-score neg' : 'total-score'}>{money(score)}</strong>
        </div>
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        {side === 'them' && (
          <div className="total-caption">
            {view.handNumber > 0 && `Hand ${view.handNumber} · `}to {money(target)}
          </div>
        )}
        {fresh && (
          <span
            key={fresh.handNumber}
            className={`delta-float delta-float-${side} ${fresh.delta[team] < 0 ? 'neg' : 'pos'}`}
          >
            {signedShortMoney(fresh.delta[team])}
          </span>
        )}
      </div>
      {pile}
    </section>
  );
}
