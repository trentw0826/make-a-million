import type { HandResult as Result } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { money, nameOf, SUIT_NAMES, teamLabel } from '../format';
import { useGame } from '../store';
import { CardFace } from './CardFace';

/** Shown when the last trick is taken: both sides count their Money openly. */
export function HandResult({
  result,
  room,
  canContinue,
}: {
  result: Result;
  room: RoomView;
  canContinue: boolean;
}) {
  const { act } = useGame();
  const bt = result.biddingTeam;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-labelledby="hand-result-title">
        <h2 id="hand-result-title">Hand {result.handNumber}</h2>
        <p>
          {nameOf(room, result.bidder)} bid {money(result.bid)} in {SUIT_NAMES[result.trump]} and{' '}
          <strong>{result.made ? 'made it' : 'was set'}</strong>.
        </p>
        <div className="result-teams">
          {([0, 1] as const).map((team) => (
            <div key={team} className="result-team">
              <h3>{teamLabel(room, team)}</h3>
              <div>Captured {money(result.captured[team])}</div>
              <div className={result.delta[team] < 0 ? 'neg' : ''}>
                {team === bt && !result.made ? 'Set back ' : 'Scores '}
                {money(result.delta[team])}
              </div>
              <div className="muted small">Total {money(result.scoresAfter[team])}</div>
              <div className="result-tricks">
                {result.tricks
                  .filter((t) => t.winner % 2 === team)
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
      </div>
    </div>
  );
}
