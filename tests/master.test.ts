import { describe, expect, it } from 'vitest';
import master from '../src/data/words.json';
import type { Word } from '../src/domain/types';
import { FILL_THRESHOLD, simulate } from '../tools/simulate';
import { validate } from '../tools/validate';

const words = master.words as Word[];

describe('語彙マスタ', () => {
  it('検査でエラーが 0 件', () => {
    expect(validate(words).errors).toEqual([]);
  });

  it('例文に同じ音の問われる字があると、エラーにする', () => {
    const gaika = words.find((w) => w.word === '外貨') as Word;
    const errors = validate(words.map((w) => (w === gaika ? { ...w, sentence: '{ガイカ}を稼ぐ' } : w))).errors;
    expect(errors).toContainEqual(expect.stringContaining('外貨: 例文に同じ音「カ」の問われる字「稼」'));
  });

  it(`数周させても、使用済みの語で埋める割合が ${FILL_THRESHOLD * 100}% 以下`, () => {
    const r = simulate(words, 10, 3);
    expect(r.invalid).toBe(0);
    expect(r.shortSets).toBe(0);
    expect(r.fillRatio).toBeLessThanOrEqual(FILL_THRESHOLD);
  });
});
