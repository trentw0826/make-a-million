// Writes a data-free match-equity table (logistic prior) so the workspace typechecks before
// the first `pnpm sim me-table` run. Usage: tsx scripts/placeholder-me-table.ts
import { fileURLToPath } from 'node:url';
import { buildTable, writeTableModule } from '../src/matchEquity';

writeTableModule(
  buildTable([], { source: 'placeholder: logistic prior, no data' }),
  fileURLToPath(new URL('../../search/src/generated/meTable.ts', import.meta.url)),
);
