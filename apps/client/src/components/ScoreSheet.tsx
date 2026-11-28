import { otherTeam, type TableView, type Team } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { useReducedMotion } from 'motion/react';
import { SuitGlyph } from '../art/CardArt';
import { money, nameOf, SUIT_NAMES, shortMoney, signedShortMoney } from '../format';
import type { LogEntry } from '../state';
import { BidTrack } from './BidTrack';
import { Badge } from './ui/Badge';
import { Heading } from './ui/Heading';
import { Meter } from './ui/Meter';
import { Panel } from './ui/Panel';
import { Text } from './ui/Text';

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
      <Heading level={2} size="lg" className="score-sheet-title">
        Score sheet
      </Heading>
      <Panel as="section" tone="raised" pad="sm" className="sheet-race" aria-label="The race">
        {(['us', 'them'] as const).map((side) => {
          const team = side === 'us' ? us : otherTeam(us);
          const score = view.scores[team];
          return (
            <div key={side} className={`sheet-race-side side-${side}`}>
              <span className="sheet-race-name">
                <span className="side-dot" aria-hidden="true" />
                {side === 'us' ? 'Us' : 'Them'}
              </span>
              <Text as="strong" numeric tone={score < 0 ? 'bad' : undefined}>
                {money(score)}
              </Text>
              <Meter value={score / target} fill={side} size="md" className="sheet-race-meter" />
            </div>
          );
        })}
        <Text as="p" size="xs" tone="muted" className="sheet-race-target">
          First to {money(target)}
        </Text>
      </Panel>

      <ol className="sheet-hands">
        {live.reverse().map((hand) => (
          <Panel
            as="li"
            tone="outlined"
            pad="sm"
            key={`live-${hand}`}
            className="sheet-hand sheet-hand-live"
          >
            <Heading level={3} size="sm" className="sheet-hand-head">
              <span>Hand {hand}</span>
              <Badge tone="accent">In play</Badge>
            </Heading>
            <Lines entries={linesOf(hand)} />
          </Panel>
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
      {view.handHistory.length === 0 && (
        <Text as="p" tone="muted">
          No hands scored yet.
        </Text>
      )}
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
    <Panel as="li" tone="outlined" pad="sm" className="sheet-hand">
      <Heading level={3} size="sm" className="sheet-hand-head">
        <span>Hand {result.handNumber}</span>
        <Badge tone={good ? 'good' : 'bad'}>{result.made ? 'Made' : 'Set'}</Badge>
      </Heading>
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
            <Text tone={result.delta[t] < 0 ? 'bad' : 'good'}>
              {signedShortMoney(result.delta[t])}
            </Text>{' '}
            <Text tone="muted" weight="regular">
              → {shortMoney(result.scoresAfter[t])}
            </Text>
          </span>
        ))}
      </div>
      {lines.length > 0 && (
        <details className="sheet-log">
          <summary>Table log</summary>
          <Lines entries={lines} />
        </details>
      )}
    </Panel>
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
