import { otherTeam, type TableView, type Team } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { useReducedMotion } from 'motion/react';
import { SuitGlyph } from '../art/CardArt';
import { money, nameOf, SUIT_NAMES, shortMoney, signedShortMoney } from '../format';
import type { LogEntry } from '../state';
import { BidTrack } from './BidTrack';

/**
 * The game so far, on one sheet: the race to the target at the top, then a card for each
 * hand, newest first. The hand in play shows what has been said at the table; a finished
 * hand shows its bid, how it went (the same bar as the hand review), each side's change and
 * total, and its table log folded up beneath.
 */
export function ScoreSheet({
  view,
  room,
  log,
}: {
  view: TableView;
  room: RoomView;
  log: readonly LogEntry[];
}) {
  const us = view.team;
  const target = view.ruleset.targetScore;
  const still = useReducedMotion() ?? false;
  const linesOf = (hand: number) => log.filter((e) => e.hand === hand);
  const finished = [...view.handHistory].reverse();
  const scored = new Set(view.handHistory.map((h) => h.handNumber));
  // The hand in play, if it isn't scored yet.
  const live = [...new Set(log.map((e) => e.hand))].filter((h) => h > 0 && !scored.has(h));

  return (
    <section className="score-sheet" aria-label="Score sheet">
      <h2>Score sheet</h2>
      <section className="sheet-race" aria-label="The race">
        {(['us', 'them'] as const).map((side) => {
          const team = side === 'us' ? us : otherTeam(us);
          const score = view.scores[team];
          return (
            <div key={side} className={`sheet-race-side side-${side}`}>
              <span className="sheet-race-name">
                <span className="side-dot" aria-hidden="true" />
                {side === 'us' ? 'Us' : 'Them'}
              </span>
              <strong className={score < 0 ? 'neg' : undefined}>{money(score)}</strong>
              <div className="progress" aria-hidden="true">
                <span style={{ width: `${Math.max(0, Math.min(100, (score / target) * 100))}%` }} />
              </div>
            </div>
          );
        })}
        <p className="sheet-race-target">First to {money(target)}</p>
      </section>

      <ol className="sheet-hands">
        {live.reverse().map((hand) => (
          <li key={`live-${hand}`} className="sheet-hand sheet-hand-live">
            <h3 className="sheet-hand-head">
              <span>Hand {hand}</span>
              <span className="sheet-chip sheet-chip-live">In play</span>
            </h3>
            <Lines entries={linesOf(hand)} />
          </li>
        ))}
        {finished.map((h) => (
          <FinishedHand
            key={h.handNumber}
            result={h}
            team={us}
            bidder={nameOf(room, h.bidder)}
            lines={linesOf(h.handNumber)}
            still={still}
          />
        ))}
      </ol>
      {view.handHistory.length === 0 && <p className="sheet-dim">No hands scored yet.</p>}
    </section>
  );
}

function FinishedHand({
  result,
  team,
  bidder,
  lines,
  still,
}: {
  result: TableView['handHistory'][number];
  team: Team;
  bidder: string;
  lines: readonly LogEntry[];
  still: boolean;
}) {
  // Green when the hand went the viewer's way, red when it didn't, as in the review.
  const good = (result.biddingTeam === team) === result.made;
  const them = otherTeam(team);
  return (
    <li className="sheet-hand">
      <h3 className="sheet-hand-head">
        <span>Hand {result.handNumber}</span>
        <span className={`sheet-chip ${good ? 'good' : 'bad'}`}>
          {result.made ? 'Made' : 'Set'}
        </span>
      </h3>
      <p className="sheet-hand-bid">
        {bidder} bid <strong>{shortMoney(result.bid)}</strong> in{' '}
        <span className={`sheet-trump suit-${result.trump}`}>
          <SuitGlyph suit={result.trump} className="sheet-trump-glyph" />
          {SUIT_NAMES[result.trump]}
        </span>
      </p>
      <BidTrack result={result} team={team} still={still} compact />
      <div className="sheet-hand-sides">
        {(
          [
            ['us', team],
            ['them', them],
          ] as const
        ).map(([side, t]) => (
          <span key={side} className={`sheet-hand-side side-${side}`}>
            <span className={result.delta[t] < 0 ? 'neg' : 'pos'}>
              {signedShortMoney(result.delta[t])}
            </span>{' '}
            <span className="sheet-dim">→ {shortMoney(result.scoresAfter[t])}</span>
          </span>
        ))}
      </div>
      {lines.length > 0 && (
        <details className="sheet-log">
          <summary>Table log</summary>
          <Lines entries={lines} />
        </details>
      )}
    </li>
  );
}

function Lines({ entries }: { entries: readonly LogEntry[] }) {
  return (
    <ul className="sheet-lines">
      {entries.map((e) => (
        <li key={e.id} className={`tone-${e.tone}`}>
          {e.text}
        </li>
      ))}
    </ul>
  );
}
