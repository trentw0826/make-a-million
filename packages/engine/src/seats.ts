/** Seats run clockwise 0→3. Seats 0 and 2 are team 0; seats 1 and 3 are team 1. */
export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;

export const SEATS: readonly Seat[] = [0, 1, 2, 3];
export const TEAMS: readonly Team[] = [0, 1];

export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team;
}

export function otherTeam(team: Team): Team {
  return team === 0 ? 1 : 0;
}

export function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export function isSeat(value: unknown): value is Seat {
  return value === 0 || value === 1 || value === 2 || value === 3;
}
