import { describe, expect, it } from 'vitest';
import { buildGameData } from './generateGameData.mjs';

const rawData = {
  hints: {},
  wordEmojis: {},
  levels: [{ sections: [{ words: ['Rose', 'Light'], slots: ['Red', 'Bright'] }] }],
};

describe('game data generation', () => {
  it('is deterministic when no generated file exists', () => {
    expect(buildGameData(rawData)).toEqual(buildGameData(rawData));
  });

  it('preserves committed IDs so installs cannot invalidate saved progress', () => {
    const existing = buildGameData(rawData);
    existing.levels[0].sections[0].words[0].id = 'existing-rose-id';

    expect(buildGameData(rawData, existing).levels[0].sections[0].words[0].id).toBe('existing-rose-id');
  });

  it('assigns different IDs to repeated text in different positions', () => {
    const repeated = {
      ...rawData,
      levels: [{ sections: [{ words: ['Rose', 'Rose'], slots: ['Red', 'Flower'] }] }],
    };
    const words = buildGameData(repeated).levels[0].sections[0].words;
    expect(words[0].id).not.toBe(words[1].id);
  });
});
