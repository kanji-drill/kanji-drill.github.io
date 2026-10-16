import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import master from '../src/data/words.json';
import { buildNewSet, buildQuestion, buildReviewSet, checkQuestion, questionWordIds } from '../src/domain/generator';
import { buildIndex, sharesChar, splitOkurigana } from '../src/domain/master';
import { mulberry32 } from '../src/domain/rng';
import {
  advanceCycleIfExhausted,
  initialProgress,
  markUsed,
  type Progress,
  rankOf,
  unusedCount,
} from '../src/domain/scheduler';
import { CHOICES, type Word } from '../src/domain/types';

const words = master.words as Word[];

/** ランダムな同音グループを作る（漢字ごとに 2〜3 語、字は重ならない） */
const arbMaster = fc
  .array(
    fc.record({
      keys: fc.integer({ min: 5, max: 8 }),
      perKey: fc.array(fc.integer({ min: 2, max: 3 }), { minLength: 8, maxLength: 8 }),
    }),
    { minLength: 6, maxLength: 12 },
  )
  .map((groups) => {
    let code = 0x4e00;
    let id = 0;
    const out: Word[] = [];
    groups.forEach((g, gi) => {
      for (let k = 0; k < g.keys; k++) {
        const key = String.fromCodePoint(code++);
        for (let n = 0; n < (g.perKey[k] ?? 2); n++) {
          const other = String.fromCodePoint(code++);
          out.push({
            id: `w${id++}`,
            word: key + other,
            kana: `ア${gi}`,
            key,
            keyIndex: 0,
            reading: `R${gi}`,
            keyKana: 'ア',
            sentence: '{ア}',
            source: null,
            verified: true,
          });
        }
      }
    });
    return out;
  });

function runCycles(ws: Word[], seed: number, sets: number) {
  const index = buildIndex(ws);
  const rng = mulberry32(seed);
  let p: Progress = initialProgress();
  const cycleUse = new Map<string, number>();
  let lastCycle = p.cycle;
  for (let s = 0; s < sets; s++) {
    p = advanceCycleIfExhausted(p, index.usableIds);
    if (p.cycle !== lastCycle) {
      cycleUse.clear();
      lastCycle = p.cycle;
    }
    const unusedBefore = new Set(index.usableIds.filter((id) => rankOf(p)(id) === 0));
    const qs = buildNewSet(index, rankOf(p), rng, 5);
    expect(qs.length).toBe(5);
    const ids = qs.flatMap(questionWordIds);
    // セットの中で同じ語・同じ音を使わない
    expect(new Set(ids).size).toBe(ids.length);
    if (index.groups.size >= 5) expect(new Set(qs.map((q) => q.reading)).size).toBe(qs.length);
    for (const q of qs) expect(checkQuestion(q, index.byId)).toBeNull();
    // 未使用の語が残っている間は、使用済みの語で埋める前に未使用の語を使い切ろうとする
    for (const id of ids) {
      if (!unusedBefore.has(id)) continue;
      expect(cycleUse.has(id)).toBe(false);
      cycleUse.set(id, 1);
    }
    p = markUsed(p, ids);
  }
  return { p, index };
}

describe('訓読みの語', () => {
  it('送り仮名を分け、同じ字かどうかは漢字だけで比べる', () => {
    expect(splitOkurigana('恭しい')).toEqual(['恭', 'しい']);
    expect(splitOkurigana('沸騰')).toEqual(['沸騰', '']);
    expect(sharesChar('狭い', '恭しい')).toBe(false);
    expect(sharesChar('競う', '競技')).toBe(true);
  });

  it('訓読みの語を含む問題も、正解がちょうど 1 つになる', () => {
    const index = buildIndex(words);
    const isKun = (id: string) => index.byId.get(id)?.kun === true;
    // 1 周分の新しい問題で、訓読みの語が設問にも選択肢にも出る
    const rng = mulberry32(11);
    let p = initialProgress();
    let asTarget = 0;
    let asOption = 0;
    while (p.cycle === 1) {
      const qs = buildNewSet(index, rankOf(p), rng, 5);
      for (const q of qs) {
        expect(checkQuestion(q, index.byId)).toBeNull();
        if (isKun(q.target)) asTarget++;
        if (q.options.some(isKun)) asOption++;
      }
      p = advanceCycleIfExhausted(markUsed(p, qs.flatMap(questionWordIds)), index.usableIds);
    }
    expect(asTarget).toBeGreaterThan(0);
    expect(asOption).toBeGreaterThan(0);
  });
});

describe('generator', () => {
  it('実際のマスタで、正解がちょうど 1 つの問題だけを作る', () => {
    runCycles(words, 1, 60);
  });

  it('ランダムなマスタでも条件を守り、周回が必ず進む', () => {
    fc.assert(
      fc.property(arbMaster, fc.integer({ min: 0, max: 2 ** 31 }), (ws, seed) => {
        const setsPerCycle = Math.ceil(ws.length / 30);
        const { p, index } = runCycles(ws, seed, setsPerCycle * 4);
        expect(p.cycle).toBeGreaterThan(1);
        expect(unusedCount(p, index.usableIds)).toBeLessThan(index.usableIds.length);
      }),
      { numRuns: 40 },
    );
  });

  it('周回の中では、すべての語を使い切るまで同じ語を出さない', () => {
    const index = buildIndex(words);
    const rng = mulberry32(7);
    let p = initialProgress();
    const seen = new Set<string>();
    while (p.cycle === 1) {
      const qs = buildNewSet(index, rankOf(p), rng, 5);
      const ids = qs.flatMap(questionWordIds);
      const fresh = ids.filter((id) => !seen.has(id));
      const unusedLeft = unusedCount(p, index.usableIds);
      // 未使用の語が 1 セット分以上残っている間は、使用済みの語で埋めることはほぼない
      if (unusedLeft >= 60) expect(fresh.length).toBeGreaterThanOrEqual(ids.length - 2);
      for (const id of ids) seen.add(id);
      p = advanceCycleIfExhausted(markUsed(p, ids), index.usableIds);
    }
    expect(seen.size).toBe(index.usableIds.length);
  });

  it('1 漢字 2 語・漢字 3 の倍数種のグループは、1 周を未使用の語だけで組み切れる', () => {
    for (const kinds of [6, 9, 12, 15]) {
      const ws: Word[] = [];
      for (let k = 0; k < kinds; k++) {
        const key = String.fromCodePoint(0x4e00 + k);
        for (let n = 0; n < 2; n++) {
          ws.push({
            id: `w${k * 2 + n}`,
            word: key + String.fromCodePoint(0x5000 + k * 2 + n),
            kana: 'ア',
            key,
            keyIndex: 0,
            reading: 'R',
            keyKana: 'ア',
            sentence: '{ア}',
            source: null,
            verified: true,
          });
        }
      }
      const group = buildIndex(ws).groups.get('R');
      if (!group) throw new Error('グループがありません');
      for (let seed = 1; seed <= 20; seed++) {
        const rng = mulberry32(seed);
        const used = new Set<string>();
        for (let i = 0; i < ws.length / (CHOICES + 1); i++) {
          const q = buildQuestion(group, { rank: (id) => (used.has(id) ? 1 : 0), exclude: new Set(), rng });
          if (!q) throw new Error(`漢字 ${kinds} 種・seed ${seed}: ${i + 1} 問目を組めません`);
          const ids = questionWordIds(q);
          expect(
            ids.filter((id) => used.has(id)),
            `漢字 ${kinds} 種・seed ${seed}・${i + 1} 問目`,
          ).toEqual([]);
          for (const id of ids) used.add(id);
        }
        expect(used.size).toBe(ws.length);
      }
    }
  });

  it('復習のセットは、期日を迎えた語を古い順に設問にする', () => {
    const index = buildIndex(words);
    // 別々のグループから 1 語ずつ
    const due = [...index.groups.values()].slice(0, 7).map((g) => (g.words[0] as Word).id);
    const qs = buildReviewSet(index, due, mulberry32(3), 5);
    expect(qs.map((q) => q.target)).toEqual(due.slice(0, 5));
    for (const q of qs) expect(checkQuestion(q, index.byId)).toBeNull();
    const ids = qs.flatMap(questionWordIds);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('復習の語が同じグループに偏っていても、組める分は組み、同じ語を 2 回使わない', () => {
    const index = buildIndex(words);
    const group = [...index.groups.values()][0];
    const due = (group?.words ?? []).slice(0, 8).map((w) => w.id);
    for (let seed = 0; seed < 50; seed++) {
      const qs = buildReviewSet(index, due, mulberry32(seed), 5);
      expect(qs.length).toBeGreaterThanOrEqual(1);
      for (const q of qs) {
        expect(due).toContain(q.target);
        expect(checkQuestion(q, index.byId)).toBeNull();
      }
      const ids = qs.flatMap(questionWordIds);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('同じ seed なら同じ問題になる', () => {
    const index = buildIndex(words);
    const p = initialProgress();
    const a = buildNewSet(index, rankOf(p), mulberry32(42), 5);
    const b = buildNewSet(index, rankOf(p), mulberry32(42), 5);
    expect(a).toEqual(b);
  });
});
