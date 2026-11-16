import type { Seat, Suit } from '@mam/engine';
import type { Difficulty, RoomView, SeatView } from '@mam/protocol';

export function money(amount: number): string {
  const sign = amount < 0 ? '−' : '';
  return `${sign}$${Math.abs(amount).toLocaleString('en-US')}`;
}

export function shortMoney(amount: number): string {
  const sign = amount < 0 ? '−' : '';
  return `${sign}$${Math.round(Math.abs(amount) / 1000).toLocaleString('en-US')}k`;
}

/** "+$210k" for a gain, "−$185k" for a loss. */
export function signedShortMoney(amount: number): string {
  return amount > 0 ? `+${shortMoney(amount)}` : shortMoney(amount);
}

export const SUIT_NAMES: Record<Suit, string> = {
  red: 'Red',
  yellow: 'Yellow',
  black: 'Black',
  green: 'Green',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  expert: 'Expert',
};

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'normal', 'hard', 'expert'];

export function seatLabel(seat: SeatView): string {
  if (!seat) return 'Empty seat';
  if (seat.kind === 'bot') return `${seat.name} · ${DIFFICULTY_LABELS[seat.difficulty]}`;
  return seat.name;
}

export function nameOf(room: RoomView | null, seat: Seat): string {
  const s = room?.seats[seat];
  if (!s) return `Seat ${seat + 1}`;
  return s.kind === 'bot' ? s.name : s.name;
}

export function teamLabel(room: RoomView | null, team: 0 | 1): string {
  const a = nameOf(room, team);
  const b = nameOf(room, (team + 2) as Seat);
  return `${a} & ${b}`;
}
