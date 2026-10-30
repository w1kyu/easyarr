import { describe, expect, it } from 'vitest';
import { describePackage } from './index.js';

describe('web placeholder', () => {
  it('resolves the shared brand', () => {
    expect(describePackage()).toBe('EasyArr web');
  });
});
