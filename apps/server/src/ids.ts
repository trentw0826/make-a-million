import { randomBytes, randomInt, randomUUID } from 'node:crypto';

/** Letters and digits that are hard to confuse when read aloud or typed. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function newPlayerId(): string {
  return randomUUID();
}

export function newToken(): string {
  return randomBytes(24).toString('base64url');
}

export function newGameSeed(): string {
  return randomUUID();
}
