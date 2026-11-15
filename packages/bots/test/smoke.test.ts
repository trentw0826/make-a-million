import { PACKAGE_NAME as ENGINE } from '@mam/engine';
import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index';

describe('bots package', () => {
  it('loads and resolves the engine workspace package', () => {
    expect(PACKAGE_NAME).toBe('@mam/bots');
    expect(ENGINE).toBe('@mam/engine');
  });
});
