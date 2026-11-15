import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index';

describe('server package', () => {
  it('loads', () => {
    expect(PACKAGE_NAME).toBe('@mam/server');
  });
});
