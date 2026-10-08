import { GoogleTokenMinterProvider } from './googleTokenMinter.ts';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

describe('the Google token minter provider', () => {
  test('provides the same minter for the same key', () => {
    const provider = new GoogleTokenMinterProvider();

    assert.equal(provider.provide('{"key": 1}'), provider.provide('{"key": 1}'));
  });

  test('refuses another key', () => {
    const provider = new GoogleTokenMinterProvider();
    provider.provide('{"key": 1}');

    assert.throws(() => provider.provide('{"key": 2}'));
  });
});
