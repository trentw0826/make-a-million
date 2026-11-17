import { otherTeam, type Phase, type TableView, teamOf } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import type { ReactNode } from 'react';
import { nameOf, SUIT_NAMES, shortMoney } from '../format';
import { highBid } from '../hints';

const CONTRACT_PHASES: ReadonlySet<Phase> = new Set([
  'discarding',
  'naming-trump',
  'playing',
  'hand-complete',
]);

/**
 * The hand's status in words: the hand number, then the auction's high bid, then the
 * contract, trump and tricks taken. Read by screen readers only; on screen the same facts
 * are shown by the seats' badges, the trump mark on the felt, the piles and the scoreboard.
 */
export function ContractBar({ view, room }: { view: TableView; room: RoomView }) {
  const contract = view.contract;
  let body: ReactNode = null;

  if (contract && CONTRACT_PHASES.has(view.phase)) {
    const us = view.team;
    const them = otherTeam(us);
    const bidderSide = teamOf(contract.bidder) === us ? 'us' : 'them';
    body = (
      <>
        <span className={`side-${bidderSide}`}>
          <span className="side-dot" aria-hidden="true" />
          {nameOf(room, contract.bidder)} bid <strong>{shortMoney(contract.amount)}</strong>
        </span>
        <span>
          Trump{' '}
          {view.trump ? (
            <strong className={`suit-chip suit-${view.trump}`} data-trump-suit={view.trump}>
              {SUIT_NAMES[view.trump]}
            </strong>
          ) : (
            <em>not named yet</em>
          )}
        </span>
        <span>
          Tricks{' '}
          <strong className="side-us">
            <span className="side-dot" aria-hidden="true" />
            Us {view.trickCounts[us]}
          </strong>{' '}
          –{' '}
          <strong className="side-them">
            <span className="side-dot" aria-hidden="true" />
            Them {view.trickCounts[them]}
          </strong>
        </span>
      </>
    );
  } else if (view.phase === 'bidding') {
    const high = highBid(view.auction);
    body = high ? (
      <span>
        High bid <strong>{shortMoney(high.amount)}</strong>: {nameOf(room, high.seat)}
      </span>
    ) : (
      <span>
        Bidding opens at <strong>{shortMoney(view.ruleset.bidding.minOpeningBid)}</strong>
      </span>
    );
  }

  return (
    <section className="contract-bar visually-hidden" aria-label="Hand status">
      {view.handNumber > 0 && <span className="contract-hand">Hand {view.handNumber}</span>}
      {body}
    </section>
  );
}
