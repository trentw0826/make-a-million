import { otherTeam, type HandResult as Result, type Team } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { money, nameOf, SUIT_NAMES, teamLabel } from '../format';
import { useGame } from '../store';
import { CardFace } from './CardFace';
import { Modal } from './Modal';

/** Shown when the last trick is taken: both sides count their Money openly. */
export function HandResult({
  result,
  room,
  team,
  canContinue,
}: {
  result: Result;
  room: RoomView;
  /** The viewer's side, listed first. */
  team: Team;
  canContinue: boolean;
}) {
  const { act } = useGame();
  const bt = result.biddingTeam;
  const sides = [
    { side: team, name: 'Us', key: 'us' },
    { side: otherTeam(team), name: 'Them', key: 'them' },
  ] as const;
  return (
    <Modal title={`Hand ${result.handNumber}`}>
      <p className={`result-banner ${result.made ? 'made' : 'set'}`}>
        {result.made ? 'Bid made' : 'Bid set'}
        {bt === team ? ' (your side)' : ''}
      </p>
      <p>
        {nameOf(room, result.bidder)} bid {money(result.bid)} in {SUIT_NAMES[result.trump]} and{' '}
        <strong>{result.made ? 'made it' : 'was set'}</strong>.
      </p>
      <div className="result-teams">
        {sides.map(({ side, name, key }) => (
          <div key={side} className={`result-team side-${key}`}>
            <h3>
              <span className="side-dot" aria-hidden="true" />
              {name} <span className="muted small">{teamLabel(room, side)}</span>
            </h3>
            <div>Captured {money(result.captured[side])}</div>
            <div className={result.delta[side] < 0 ? 'neg' : ''}>
              {side === bt && !result.made ? 'Set back ' : 'Scores '}
              {money(result.delta[side])}
            </div>
            <div className="muted small">Total {money(result.scoresAfter[side])}</div>
            <div className="result-tricks">
              {result.tricks
                .filter((t) => t.winner % 2 === side)
                .map((t) => (
                  <div
                    key={t.cardIds.join('-')}
                    className={`result-trick mod-${t.modifier}`}
                    title={`${money(t.value)}`}
                  >
                    {t.cardIds.map((id) => (
                      <CardFace key={id} id={id} size="small" />
                    ))}
                    <span className="small">
                      {money(t.value)}
                      {t.modifier === 'bull'
                        ? ' (Bull ×2)'
                        : t.modifier === 'bear'
                          ? ' (Bear)'
                          : ''}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
      {canContinue && (
        <button type="button" className="primary" onClick={() => act({ type: 'continue' })}>
          Next hand
        </button>
      )}
    </Modal>
  );
}
