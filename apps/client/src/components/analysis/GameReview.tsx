import type { Action } from '@mam/engine';
import type { MoveLabel, ReviewedMove } from '@mam/protocol';
import { SUIT_NAMES, shortMoney } from '../../format';
import { Panel } from '../ui/Panel';
import { Text } from '../ui/Text';
import styles from './Analysis.module.css';
import { cardName, describeAction, LABEL_TEXT } from './describe';
import review from './GameReview.module.css';

/** The grades counted in the summary, best first. Forced moves are counted apart. */
const GRADES: readonly MoveLabel[] = ['best', 'good', 'inaccuracy', 'mistake', 'blunder'];

/** How many costly moments are listed. */
export const KEY_MOMENTS = 3;

/** A choice you made, in words: "played Red 2", "passed", "named Green trump". */
function choiceText(action: Action): string {
  switch (action.type) {
    case 'playCard':
      return `played ${cardName(action.cardId)}`;
    case 'bid':
      return `bid ${shortMoney(action.amount)}`;
    case 'pass':
      return 'passed';
    case 'callMisdeal':
      return 'called a misdeal';
    case 'nameTrump':
      return `named ${SUIT_NAMES[action.suit]} trump`;
    case 'discard':
      return `discarded ${action.cardIds.map(cardName).join(', ')}`;
    case 'continue':
      return 'went on';
  }
}

/** Where in the game a move was made: "Hand 2, trick 5", "Hand 3, bidding". */
function placeText(move: ReviewedMove): string {
  const step =
    move.trick !== null
      ? `trick ${move.trick}`
      : move.played.type === 'discard'
        ? 'discards'
        : move.played.type === 'nameTrump'
          ? 'trump'
          : 'bidding';
  return `Hand ${move.hand}, ${step}`;
}

function Grade({ label }: { label: MoveLabel }) {
  return <span className={`${styles.label} ${styles[`label-${label}`]}`}>{LABEL_TEXT[label]}</span>;
}

/**
 * The review of a solo game, on the game-over screen: how your graded decisions split by
 * grade, the money they gave up against the analysis's best, the costliest hand, and the
 * costliest moments. Everything comes from the server's reviews of your moves; nothing
 * shown here is worked out from hidden cards.
 */
export function GameReview({ moves }: { moves: readonly ReviewedMove[] }) {
  const chosen = moves.filter((m) => m.label !== 'forced');
  if (chosen.length === 0) return null;
  const forced = moves.length - chosen.length;
  const count = (label: MoveLabel) => chosen.filter((m) => m.label === label).length;
  const sound = count('best') + count('good');
  const givenUp = chosen.reduce((sum, m) => sum + m.lossK, 0);

  const byHand = new Map<number, number>();
  for (const m of chosen) byHand.set(m.hand, (byHand.get(m.hand) ?? 0) + m.lossK);
  const [worstHand, worstLoss] = [...byHand].reduce((a, b) => (b[1] > a[1] ? b : a));

  const moments = chosen
    .filter((m) => m.label === 'inaccuracy' || m.label === 'mistake' || m.label === 'blunder')
    .sort((a, b) => b.lossK - a.lossK || a.ply - b.ply)
    .slice(0, KEY_MOMENTS)
    .sort((a, b) => a.ply - b.ply);

  return (
    <Panel as="section" tone="raised" className={review.review} aria-label="Game review">
      <Text as="p" size="sm" weight="bold" caps className={review.title}>
        Your game review
      </Text>
      <ul className={review.grades} aria-label="Your decisions by grade">
        {GRADES.map((label) => (
          <li key={label}>
            <Grade label={label} />{' '}
            <Text weight="bold" numeric>
              {count(label)}
            </Text>
          </li>
        ))}
      </ul>
      <Text as="p" size="sm" className={review.summary}>
        {sound} of {chosen.length} decisions best or good
        {forced > 0 ? ` (and ${forced} forced)` : ''}. Given up against the best:{' '}
        <strong className={review.amount}>{shortMoney(givenUp * 1000)}</strong>
        {byHand.size > 1 && worstLoss >= 1
          ? `, most in hand ${worstHand} (${shortMoney(worstLoss * 1000)}).`
          : '.'}
      </Text>
      {moments.length > 0 && (
        <>
          <Text as="p" size="xs" tone="muted" caps className={review.title}>
            Key moments
          </Text>
          <ol className={review.moments}>
            {moments.map((m) => (
              <li key={m.ply}>
                <Grade label={m.label} />
                <span>
                  <Text tone="muted">{placeText(m)}:</Text> you {choiceText(m.played)}; best was{' '}
                  {describeAction(m.best)}{' '}
                  <Text tone="bad" className={review.amount}>
                    ({shortMoney(-m.lossK * 1000)})
                  </Text>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Panel>
  );
}
