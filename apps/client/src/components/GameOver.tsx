import { otherTeam, type TableView } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { money, teamLabel } from '../format';
import { sound } from '../sound/player';
import { useGame } from '../store';
import { AFTER_MODAL_MS, POP_IN, POP_SPRING } from '../theme/motion';
import { Confetti } from './Confetti';
import styles from './GameOver.module.css';
import { Modal } from './Modal';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';
import { Text } from './ui/Text';

/**
 * The end of the game, told from the viewer's side: who made the million, then each side's
 * final total on the race to the target, the winner's in gold. A win throws confetti and
 * plays a fanfare. The host can deal a new game; anyone can leave.
 */
export function GameOver({ view, room }: { view: TableView; room: RoomView }) {
  const { state, send } = useGame();
  const isHost = state.me?.playerId === room.hostId;
  const winner = view.winner;
  const us = view.team;
  const won = winner === us;
  const still = useReducedMotion() ?? false;
  const target = view.ruleset.targetScore;
  const hands = view.handHistory.length;

  // Once per game over (a ref outlives StrictMode's second run of the effect).
  const cheered = useRef(false);
  useEffect(() => {
    if (!won || cheered.current) return;
    cheered.current = true;
    sound.play('gameWon');
  }, [won]);

  const headline =
    winner === null
      ? 'Game over'
      : won
        ? 'Your side makes a million!'
        : `${teamLabel(room, winner)} make a million`;

  return (
    <>
      {won && !still && <Confetti />}
      <Modal
        title={
          <motion.span
            className={`${styles.headline} ${won ? styles.won : styles.lost}`}
            initial={still ? false : POP_IN.initial}
            animate={POP_IN.animate}
            transition={{ ...POP_SPRING, delay: AFTER_MODAL_MS / 1000 }}
          >
            {headline}
          </motion.span>
        }
        className={styles.modal}
      >
        <Text as="p" size="sm" tone="muted" caps className={styles.eyebrow}>
          Game over · {hands} {hands === 1 ? 'hand' : 'hands'} played
        </Text>
        <div className={styles.sides}>
          {(['us', 'them'] as const).map((side) => {
            const team = side === 'us' ? us : otherTeam(us);
            const score = view.scores[team];
            const isWinner = team === winner;
            return (
              <Panel
                key={side}
                as="section"
                tone="raised"
                className={`${styles.side} side-${side}${isWinner ? ` ${styles.winner}` : ''}`}
                aria-label={side === 'us' ? 'Us' : 'Them'}
              >
                <span className={styles.name}>
                  <span className="side-dot" aria-hidden="true" />
                  {side === 'us' ? 'Us' : 'Them'}
                  {isWinner && <span className={styles.chip}>Winner</span>}
                </span>
                <Text size="sm" tone="muted">
                  {teamLabel(room, team)}
                </Text>
                <Text size="2xl" weight="bold" numeric tone={score < 0 ? 'bad' : undefined}>
                  {money(score)}
                </Text>
                <div className={`progress ${styles.progress}`} aria-hidden="true">
                  <span
                    style={{ width: `${Math.max(0, Math.min(100, (score / target) * 100))}%` }}
                  />
                </div>
              </Panel>
            );
          })}
        </div>
        <Text as="p" size="xs" tone="muted" className={styles.target}>
          First to {money(target)}
        </Text>
        <div className={`result-foot ${styles.foot}`}>
          <Button variant="ghost" onClick={() => send({ type: 'leaveRoom' })}>
            Leave room
          </Button>
          {isHost ? (
            <Button variant="primary" data-autofocus onClick={() => send({ type: 'playAgain' })}>
              Play again
            </Button>
          ) : (
            <Text size="sm" tone="muted" className="ready-wait">
              The host can start a new game.
            </Text>
          )}
        </div>
      </Modal>
    </>
  );
}
