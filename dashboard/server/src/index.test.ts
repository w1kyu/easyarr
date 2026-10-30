import { describe, expect, it } from 'vitest';
import { describePackage } from './index.js';

describe('server placeholder', () => {
  it('resolves the shared brand', () => {
    expect(describePackage()).toBe('EasyArr server');
  });
});
