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
import { createSession, outcomesOf } from '../src/domain/session';
import { CHOICES, type Question, type Word } from '../src/domain/types';

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

  it('訓読みの設問の選択肢に訓読みの語があれば、検査で見つける', () => {
    const index = buildIndex(words);
    const kun = words.filter((w) => w.kun && index.groups.has(w.reading));
    const target = kun.find((t) => kun.some((w) => w.reading === t.reading && w.key !== t.key)) as Word;
    const other = kun.find((w) => w.reading === target.reading && w.key !== target.key) as Word;
    const group = index.groups.get(target.reading);
    const q =
      group && buildQuestion(group, { rank: () => 0, exclude: new Set(), rng: mulberry32(1), targetId: target.id });
    if (!q) throw new Error('問題を組めません');
    expect(checkQuestion(q, index.byId)).toBeNull();
    const wrong = q.options.findIndex((_, i) => i !== q.correct);
    const broken = { ...q, options: q.options.map((id, i) => (i === wrong ? other.id : id)) };
    expect(checkQuestion(broken, index.byId)).toContain('訓読み');
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
        if (isKun(q.target)) {
          asTarget++;
          // 訓読みの設問では、選択肢はすべて音読みの語
          expect(q.options.filter(isKun)).toEqual([]);
        }
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

  it('選択肢専用の語を含む、語数 6 の倍数のグループも、1 周を未使用の語だけで組み切れる', () => {
    // [漢字ごとの語数]（選択肢専用の語は 1 語の漢字として、末尾の数だけ足す）
    const shapes: [number[], number][] = [
      [[2, 2, 2, 2, 2], 2],
      [[3, 2, 2, 2, 2, 2, 2, 2], 1],
      [[3, 3, 3, 2, 2, 2, 2, 2, 2, 2], 1],
      [[2, 2, 2, 2, 2, 2, 2, 2, 2], 6],
    ];
    for (const [pairs, extra] of shapes) {
      const ws: Word[] = [];
      let code = 0x4e00;
      const add = (key: string, distractorOnly: boolean) =>
        ws.push({
          id: `w${ws.length}`,
          word: key + String.fromCodePoint(0x6000 + ws.length),
          kana: 'ア',
          key,
          keyIndex: 0,
          reading: 'R',
          keyKana: 'ア',
          sentence: '{ア}',
          source: null,
          verified: true,
          ...(distractorOnly ? { distractorOnly } : {}),
        });
      for (const n of pairs) {
        const key = String.fromCodePoint(code++);
        for (let i = 0; i < n; i++) add(key, false);
      }
      for (let i = 0; i < extra; i++) add(String.fromCodePoint(code++), true);
      const label = `形 ${pairs.join(',')}+選${extra}`;
      expect(ws.length % (CHOICES + 1), label).toBe(0);
      const index = buildIndex(ws);
      const group = index.groups.get('R');
      if (!group) throw new Error('グループがありません');
      for (let seed = 1; seed <= 30; seed++) {
        const rng = mulberry32(seed);
        const used = new Set<string>();
        for (let i = 0; i < ws.length / (CHOICES + 1); i++) {
          const q = buildQuestion(group, { rank: (id) => (used.has(id) ? 1 : 0), exclude: new Set(), rng });
          if (!q) throw new Error(`${label}・seed ${seed}: ${i + 1} 問目を組めません`);
          expect(checkQuestion(q, index.byId)).toBeNull();
          const ids = questionWordIds(q);
          expect(
            ids.filter((id) => used.has(id)),
            `${label}・seed ${seed}・${i + 1} 問目`,
          ).toEqual([]);
          for (const id of ids) used.add(id);
        }
        expect(used.size).toBe(ws.length);
      }
    }
  });

  it('期日を迎えた選択肢専用の語は、同じ音の問題の誤りの選択肢に入れて復習する', () => {
    const base = words.filter((w) => w.reading === 'シツ');
    const only: Word = { ...(base[0] as Word), id: 'w9999', word: '嫉妬', kana: 'シット', key: '嫉', keyIndex: 0 };
    only.distractorOnly = true;
    delete only.kun;
    const index = buildIndex([...words, only]);
    for (let seed = 0; seed < 30; seed++) {
      const qs = buildReviewSet(index, [only.id], mulberry32(seed), 5);
      expect(qs.length).toBe(1);
      const q = qs[0] as Question;
      expect(checkQuestion(q, index.byId)).toBeNull();
      expect(q.target).not.toBe(only.id);
      expect(q.options.indexOf(only.id)).not.toBe(q.correct);
      expect(q.options).toContain(only.id);
      expect(q.reviewed).toEqual([only.id]);
      // 自己採点は、設問の語と同じく復習の連続回数に数える
      const outcomes = outcomesOf(createSession('review', seed, '2026-10-23', qs));
      expect(outcomes.filter((o) => o.reviewTarget).map((o) => o.id)).toEqual([q.target, only.id]);
    }
    // 新しい問題では、設問にも正解にもならない
    const rng = mulberry32(5);
    let p = initialProgress();
    let seen = 0;
    while (p.cycle === 1) {
      const qs = buildNewSet(index, rankOf(p), rng, 5);
      for (const q of qs) {
        expect(checkQuestion(q, index.byId)).toBeNull();
        if (q.options.includes(only.id)) seen++;
      }
      p = advanceCycleIfExhausted(markUsed(p, qs.flatMap(questionWordIds)), index.usableIds);
    }
    expect(seen).toBeGreaterThan(0);
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
