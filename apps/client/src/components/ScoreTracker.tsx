import { otherTeam, type TableView } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { type ReactNode, useState } from 'react';
import { money, signedShortMoney, teamLabel } from '../format';
import { Panel } from './ui/Panel';
import { Text } from './ui/Text';

/**
 * One side's total and how far it is toward the target, in its own top corner of the felt:
 * ours on the left and theirs on the right. The side's taken tricks (`pile`) lie
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
      <Panel tone="felt" pad="sm" className="total" title={teamLabel(room, team)}>
        <div className="total-head">
          <span className="side-dot" aria-hidden="true" />
          <span className="total-name">{side === 'us' ? 'Us' : 'Them'}</span>
          <Text as="strong" numeric tone={score < 0 ? 'bad' : undefined}>
            {money(score)}
          </Text>
        </div>
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        {side === 'them' && (
          <Text as="div" size="xs" tone="muted" className="total-caption">
            {view.handNumber > 0 && `Hand ${view.handNumber} · `}to {money(target)}
          </Text>
        )}
        {fresh && (
          <Text
            key={fresh.handNumber}
            size="sm"
            weight="bold"
            tone={fresh.delta[team] < 0 ? 'bad' : 'good'}
            className={`delta-float delta-float-${side}`}
          >
            {signedShortMoney(fresh.delta[team])}
          </Text>
        )}
      </Panel>
      {pile}
    </section>
  );
}
