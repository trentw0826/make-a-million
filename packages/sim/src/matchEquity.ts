import { writeFileSync } from 'node:fs';
import { teamOf } from '@mam/engine';
import type { MatchEquityTable } from '@mam/search';
import type { PlayOutput } from './tasks';

/** One observed position: a team's score, the opponents', who deals, and whether it won. */
export interface EquitySample {
  readonly own: number;
  readonly opp: number;
  readonly ownDeals: boolean;
  readonly win: boolean;
}

/** Every hand start of a finished game, seen from both teams. */
export function samplesFromGame(game: PlayOutput): EquitySample[] {
  if (game.winner === null) return [];
  const out: EquitySample[] = [];
  for (const h of game.hands) {
    for (const team of [0, 1] as const) {
      out.push({
        own: h.scoresBefore[team],
        opp: h.scoresBefore[1 - team] as number,
        ownDeals: teamOf(h.dealer) === team,
        win: game.winner === team,
      });
    }
  }
  return out;
}

export interface BuildOptions {
  readonly source: string;
  readonly target?: number;
  readonly min?: number;
  readonly step?: number;
  readonly size?: number;
  /** Minimum effective sample weight behind each smoothed cell. */
  readonly minWeight?: number;
}

/**
 * Turns samples into a smooth, monotone table:
 * 1. soft-bin samples onto the grid (bilinear weights);
 * 2. Nadaraya–Watson smoothing with the narrowest Gaussian bandwidth that has enough data;
 * 3. enforce symmetry (E(a,b,d) = 1 − E(b,a,¬d)) and monotonicity (more own score never
 *    hurts, more opponent score never helps).
 */
export function buildTable(samples: readonly EquitySample[], opts: BuildOptions): MatchEquityTable {
  const min = opts.min ?? -400_000;
  const step = opts.step ?? 20_000;
  const size = opts.size ?? 71;
  const target = opts.target ?? 1_000_000;
  const minWeight = opts.minWeight ?? 40;
  const cells = size * size;
  const w = new Float64Array(2 * cells);
  const s = new Float64Array(2 * cells);

  for (const x of samples) {
    const fi = clamp((x.own - min) / step, 0, size - 1);
    const fj = clamp((x.opp - min) / step, 0, size - 1);
    const i0 = Math.floor(fi);
    const j0 = Math.floor(fj);
    const ti = fi - i0;
    const tj = fj - j0;
    const base = (x.ownDeals ? 1 : 0) * cells;
    for (const [di, wi] of [
      [0, 1 - ti],
      [1, ti],
    ] as const) {
      for (const [dj, wj] of [
        [0, 1 - tj],
        [1, tj],
      ] as const) {
        const i = Math.min(i0 + di, size - 1);
        const j = Math.min(j0 + dj, size - 1);
        const k = base + i * size + j;
        const weight = wi * wj;
        w[k] = (w[k] as number) + weight;
        if (x.win) s[k] = (s[k] as number) + weight;
      }
    }
  }

  const values = new Float64Array(2 * cells);
  const bandwidths = [0.75, 1.5, 3, 6, 12];
  for (let d = 0; d < 2; d++) {
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        let value = Number.NaN;
        for (const h of bandwidths) {
          const r = Math.ceil(3 * h);
          let sw = 0;
          let ss = 0;
          for (let a = Math.max(0, i - r); a <= Math.min(size - 1, i + r); a++) {
            for (let b = Math.max(0, j - r); b <= Math.min(size - 1, j + r); b++) {
              const k = d * cells + a * size + b;
              const cw = w[k] as number;
              if (cw === 0) continue;
              const g = Math.exp(-((a - i) ** 2 + (b - j) ** 2) / (2 * h * h));
              sw += g * cw;
              ss += g * (s[k] as number);
            }
          }
          if (sw >= minWeight || (h === bandwidths[bandwidths.length - 1] && sw > 1e-9)) {
            value = ss / sw;
            break;
          }
        }
        if (Number.isNaN(value)) {
          // No data anywhere near: fall back to a logistic guess on the score difference.
          const diff = (i - j) * step;
          value = 1 / (1 + Math.exp(-diff / 150_000));
        }
        values[d * cells + i * size + j] = value;
      }
    }
  }

  const at = (d: number, i: number, j: number) => d * cells + i * size + j;
  for (let round = 0; round < 4; round++) {
    // Symmetry.
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const a = at(1, i, j);
        const b = at(0, j, i);
        const m = ((values[a] as number) + 1 - (values[b] as number)) / 2;
        values[a] = m;
        values[b] = 1 - m;
      }
    }
    // Monotone in own score (rows) and opponent score (columns).
    for (let d = 0; d < 2; d++) {
      for (let j = 0; j < size; j++) {
        for (let i = 1; i < size; i++) {
          values[at(d, i, j)] = Math.max(
            values[at(d, i, j)] as number,
            values[at(d, i - 1, j)] as number,
          );
        }
      }
      for (let i = 0; i < size; i++) {
        for (let j = 1; j < size; j++) {
          values[at(d, i, j)] = Math.min(
            values[at(d, i, j)] as number,
            values[at(d, i, j - 1)] as number,
          );
        }
      }
    }
  }

  return {
    version: 1,
    source: opts.source,
    target,
    min,
    step,
    size,
    values: Array.from(values, (v) => Math.round(clamp(v, 0.0005, 0.9995) * 10_000) / 10_000),
  };
}

/** Writes the table as a TypeScript module so every runtime (tsx, Vite, tsup) can import it. */
export function writeTableModule(table: MatchEquityTable, path: string): void {
  const { values, ...meta } = table;
  const body = `// Generated by \`pnpm sim me-table\`. Do not edit by hand.\nimport type { MatchEquityTable } from '../equity';\n\nexport const ME_TABLE: MatchEquityTable = {\n  ...${JSON.stringify(meta)},\n  values: ${JSON.stringify(values)},\n};\n`;
  writeFileSync(path, body);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
