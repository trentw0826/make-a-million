import { DEFAULT_RULESET, RANKS, type Ruleset } from '@mam/engine';
import { money } from '../format';
import { Modal } from './Modal';

/** "$40k · $30k · $15k · 11 · $10k · …", highest first, straight from the engine's table. */
const RANK_ORDER = [...RANKS]
  .reverse()
  .map((rank) => (rank.endsWith('k') ? `$${rank}` : rank))
  .join(' · ');

const SHORTCUTS: readonly (readonly [string, string])[] = [
  ['?', 'Open or close How to play'],
  ['Esc', 'Close a dialog'],
  ['← →', 'Lower or raise your bid'],
  ['Enter', 'Main action: Ready to bid, Bid, Discard, Next hand'],
];

/** The rules in brief. Every number comes from the ruleset the table is playing. */
export function HowToPlay({
  ruleset = DEFAULT_RULESET,
  onClose,
}: {
  ruleset?: Ruleset;
  onClose: () => void;
}) {
  const { bidding, misdeal, targetScore } = ruleset;
  return (
    <Modal title="How to play" onClose={onClose} className="help">
      <section>
        <h3>The goal</h3>
        <p>
          Two partnerships, with partners sitting opposite, race to {money(targetScore)} by
          capturing Money cards in tricks.
        </p>
      </section>

      <section>
        <h3>The cards</h3>
        <p>
          55 cards: four colors (Red, Yellow, Black, Green) of 13 cards each, plus the Tiger, Bull
          and Bear. Each color ranks, from high to low:
        </p>
        <p className="rank-order">{RANK_ORDER}</p>
        <p>
          There is no 6, and the 11 sits between the $15k and the $10k. Only{' '}
          <strong>Money cards</strong> ($40k, $30k, $15k, $10k, $5k) score; the others are plain{' '}
          <strong>number cards</strong>.
        </p>
      </section>

      <section>
        <h3>Tiger, Bull and Bear</h3>
        <ul>
          <li>
            <strong>Tiger</strong>: the highest trump. It counts as the trump color, so a Tiger lead
            calls for trump, and it can’t be played to another color you could follow.
          </li>
          <li>
            <strong>Bull</strong>: doubles the Money in the trick it lands in.
          </li>
          <li>
            <strong>Bear</strong>: cancels the Money in its trick. When both fall in one trick, the
            one played last counts.
          </li>
          <li>
            Bull and Bear can be played only before the trick has a color or when you are out of
            that color, and can be led only when nothing else is left in your hand.
          </li>
        </ul>
      </section>

      <section>
        <h3>Deal{misdeal.enabled ? ' and misdeal' : ''}</h3>
        <p>
          Every card is dealt; three form the hidden widow. Everyone looks at their hand and
          confirms they are ready to bid.
          {misdeal.enabled &&
            ` A player holding ${money(misdeal.threshold)} or less in Money may call a misdeal instead, and the same dealer deals again.`}
        </p>
      </section>

      <section>
        <h3>Bidding</h3>
        <p>
          The player left of the dealer {bidding.openerMustBid ? 'must open' : 'opens'} at{' '}
          {money(bidding.minOpeningBid)} or more. Going clockwise, each player raises by at least{' '}
          {money(bidding.raiseIncrement)} or passes for the rest of the hand. The last bidder takes
          the contract: their side must capture at least that much.
        </p>
      </section>

      <section>
        <h3>Widow and trump</h3>
        <p>
          The winning bidder picks up the widow, discards three cards, then names trump. Number
          cards must go before Money, and the Tiger, Bull and Bear can never be discarded. Discards
          are out of play for the hand.
        </p>
      </section>

      <section>
        <h3>Playing tricks</h3>
        <p>
          The player to the bidder's left leads the first trick. Follow the color led if you can;
          otherwise play anything. The highest trump wins the trick, or else the highest card of the
          color led. The winner leads the next trick.
        </p>
      </section>

      <section>
        <h3>Scoring</h3>
        <p>
          Each side counts the Money it captured: Bull tricks count double, Bear tricks count
          nothing. If the bidders reach their bid they score everything they took; if not, they are{' '}
          <em>set</em> and lose the amount of the bid. The other side always scores what it took.
          The first side to {money(targetScore)} wins; if both get there on the same hand, the
          higher score wins.
        </p>
      </section>

      <section>
        <h3>What you can see</h3>
        <p>
          Just what you would see at a real table: your own hand, the trick in progress, the
          bidding, how many tricks each side has taken, and the score sheet. Taken tricks are face
          down. There is no replay of earlier tricks and no running Money count until the hand is
          over.
        </p>
      </section>

      <section>
        <h3>Keyboard</h3>
        <dl className="keys">
          {SHORTCUTS.map(([key, what]) => (
            <div key={key}>
              <dt>
                <kbd>{key}</kbd>
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Modal>
  );
}
