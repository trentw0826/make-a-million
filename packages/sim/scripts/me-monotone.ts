// Checks the match-equity table for monotonicity: equity must rise with own score and fall
// with the opponents'. Prints how many neighbouring cells break that, and by how much.
import { ME_TABLE } from '@mam/search';

const { size, values, min, step } = ME_TABLE;
const at = (d: number, i: number, j: number) => values[d * size * size + i * size + j] as number;
let ownBad = 0;
let oppBad = 0;
let worst = 0;
let worstAt = '';
let pairs = 0;
for (let d = 0; d < 2; d++) {
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (i + 1 < size) {
        pairs += 1;
        const drop = at(d, i, j) - at(d, i + 1, j);
        if (drop > 1e-9) {
          ownBad += 1;
          if (drop > worst) {
            worst = drop;
            worstAt = `own ${min + i * step}→${min + (i + 1) * step}, opp ${min + j * step}, d=${d}`;
          }
        }
      }
      if (j + 1 < size) {
        pairs += 1;
        const rise = at(d, i, j + 1) - at(d, i, j);
        if (rise > 1e-9) {
          oppBad += 1;
          if (rise > worst) {
            worst = rise;
            worstAt = `opp ${min + j * step}→${min + (j + 1) * step}, own ${min + i * step}, d=${d}`;
          }
        }
      }
    }
  }
}
console.log(ME_TABLE.source);
console.log(
  `neighbour pairs ${pairs}: own-score violations ${ownBad}, opp-score violations ${oppBad}`,
);
console.log(`worst violation ${worst.toFixed(4)} at ${worstAt}`);
// Symmetry: P(A wins | a, b, A deals next) should equal 1 − P(B wins | b, a, B deals next).
let asym = 0;
for (let i = 0; i < size; i++)
  for (let j = 0; j < size; j++) asym = Math.max(asym, Math.abs(at(1, i, j) + at(0, j, i) - 1));
console.log(`max asymmetry |ME(a,b,deal) + ME(b,a,other) − 1| = ${asym.toFixed(4)}`);
