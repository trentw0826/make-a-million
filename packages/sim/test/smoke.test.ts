import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index';

describe('sim package', () => {
  it('loads', () => {
    expect(PACKAGE_NAME).toBe('@mam/sim');
  });
});
