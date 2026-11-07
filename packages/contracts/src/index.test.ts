import { describe, expect, it } from 'vitest';

describe('workspace bootstrap', () => {
  it('loads the contracts package', async () => {
    const contracts = await import('./index');
    expect(contracts).toBeDefined();
  });
});
