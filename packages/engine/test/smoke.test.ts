import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index';

describe('engine package', () => {
  it('loads', () => {
    expect(PACKAGE_NAME).toBe('@mam/engine');
  });
});
