// 実際のマスタで「新しい問題」を数周させ、使用済みの語で埋めた割合を測る。
// 割合が基準を超えたら終了コード 1 で終わる（CI の合否条件）
import { buildNewSet, checkQuestion, questionWordIds } from '../src/domain/generator';
import { buildIndex } from '../src/domain/master';
import { mulberry32 } from '../src/domain/rng';
import { advanceCycleIfExhausted, initialProgress, isUnused, markUsed, rankOf } from '../src/domain/scheduler';
import type { Word } from '../src/domain/types';
import { isMain, loadMaster } from './lib';

export const FILL_THRESHOLD = 0.1;

export function simulate(words: readonly Word[], seeds: number, cycles: number, setSize = 5) {
  const index = buildIndex(words);
  let slots = 0;
  let filled = 0;
  let invalid = 0;
  let maxPerCycle = 0;
  let shortSets = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const rng = mulberry32(seed);
    let p = initialProgress();
    let count = new Map<string, number>();
    while (p.cycle <= cycles) {
      const before = p.cycle;
      const qs = buildNewSet(index, rankOf(p), rng, setSize);
      if (qs.length < setSize) shortSets++;
      if (qs.length === 0) break;
      const ids = qs.flatMap(questionWordIds);
      for (const q of qs) if (checkQuestion(q, index.byId)) invalid++;
      for (const id of ids) {
        slots++;
        if (!isUnused(p, id)) filled++;
        const n = (count.get(id) ?? 0) + 1;
        count.set(id, n);
        maxPerCycle = Math.max(maxPerCycle, n);
      }
      p = advanceCycleIfExhausted(markUsed(p, ids), index.usableIds);
      if (p.cycle !== before) count = new Map();
    }
  }
  return {
    words: index.usableIds.length,
    groups: index.groups.size,
    fillRatio: slots === 0 ? 1 : filled / slots,
    invalid,
    maxPerCycle,
    shortSets,
  };
}

if (isMain(import.meta.url)) {
  const r = simulate(loadMaster().words, 30, 3);
  console.log(`出題に使える語 ${r.words}（グループ ${r.groups}）`);
  console.log(`使用済みの語で埋めた割合: ${(r.fillRatio * 100).toFixed(1)}%（基準 ${FILL_THRESHOLD * 100}% 以下）`);
  console.log(`1 周の中での 1 語あたり最多出題回数: ${r.maxPerCycle}`);
  console.log(`正解が 1 つにならない問題: ${r.invalid}、5 問に満たないセット: ${r.shortSets}`);
  if (r.fillRatio > FILL_THRESHOLD || r.invalid > 0 || r.shortSets > 0) process.exit(1);
}
