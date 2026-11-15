/**
 * Registers every simulator-visible strategy beyond Easy and Normal. Imported for its side
 * effects by tasks.ts and the CLI, so worker threads see the same set.
 */
import { OracleBot } from './oracle';
import { registerStrategy } from './strategies';

registerStrategy('oracle', (o) => new OracleBot(Number(o.exact ?? 7), Number(o.depth ?? 3)));
