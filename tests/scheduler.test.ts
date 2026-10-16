import { describe, expect, it } from 'vitest';
import {
  addDays,
  advanceCycleIfExhausted,
  applyOutcomes,
  dayKey,
  dueReviewIds,
  initialProgress,
  markUsed,
  masteredCount,
  rollDaily,
  today,
} from '../src/domain/scheduler';
import { createSession, outcomesOf, summaryOf } from '../src/domain/session';

const miss = (id: string, reviewTarget = false) => ({ id, ok: false, reviewTarget });
const hit = (id: string, reviewTarget = false) => ({ id, ok: true, reviewTarget });

describe('日付', () => {
  it('午前 4 時までは前日として扱う', () => {
    expect(dayKey(new Date(2026, 9, 16, 3, 59))).toBe('2026-10-15');
    expect(dayKey(new Date(2026, 9, 16, 4, 0))).toBe('2026-10-16');
  });

  it('月末をまたいで日数を足せる', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });

  it('時計が戻っても、最後に使った日より前にはならない', () => {
    const p = { ...initialProgress(), lastDay: '2026-10-20' };
    expect(today(p, new Date(2026, 9, 18, 12))).toBe('2026-10-20');
  });
});

describe('復習', () => {
  const d0 = '2026-10-16';

  it('書けなかった語は 翌日 → 3 日後 → 7 日後 と出て、3 回続けて書けたら外れる', () => {
    let p = applyOutcomes(initialProgress(), [miss('a')], d0);
    expect(p.words.a?.review).toEqual({ stage: 0, due: '2026-10-17' });
    expect(dueReviewIds(p, d0)).toEqual([]);
    expect(dueReviewIds(p, '2026-10-17')).toEqual(['a']);

    p = applyOutcomes(p, [hit('a', true)], '2026-10-17');
    expect(p.words.a?.review).toEqual({ stage: 1, due: '2026-10-20' });
    p = applyOutcomes(p, [hit('a', true)], '2026-10-20');
    expect(p.words.a?.review).toEqual({ stage: 2, due: '2026-10-27' });
    p = applyOutcomes(p, [hit('a', true)], '2026-10-27');
    expect(p.words.a?.review).toBeUndefined();
    expect(p.words.a?.mastered).toBe(true);
  });

  it('途中で書けなければ翌日からやり直す', () => {
    let p = applyOutcomes(initialProgress(), [miss('a')], d0);
    p = applyOutcomes(p, [hit('a', true)], '2026-10-17');
    p = applyOutcomes(p, [miss('a', true)], '2026-10-20');
    expect(p.words.a?.review).toEqual({ stage: 0, due: '2026-10-21' });
  });

  it('期日を迎えた復習の設問として出たときだけ、連続回数に数える', () => {
    let p = applyOutcomes(initialProgress(), [miss('a')], d0);
    p = applyOutcomes(p, [hit('a', false)], '2026-10-17');
    expect(p.words.a?.review).toEqual({ stage: 0, due: '2026-10-17' });
    expect(p.words.a?.mastered).toBeUndefined();
  });

  it('一度でも書けた語は「覚えた語」に数え、その後✕になっても減らさない', () => {
    let p = applyOutcomes(initialProgress(), [hit('a'), miss('b')], d0);
    expect(masteredCount(p)).toBe(1);
    p = applyOutcomes(p, [miss('a')], '2026-10-17');
    expect(masteredCount(p)).toBe(1);
  });
});

describe('周回', () => {
  it('すべての語を使ったら次の周回に進む', () => {
    let p = markUsed(initialProgress(), ['a', 'b']);
    p = advanceCycleIfExhausted(p, ['a', 'b', 'c']);
    expect(p.cycle).toBe(1);
    p = advanceCycleIfExhausted(markUsed(p, ['c']), ['a', 'b', 'c']);
    expect(p.cycle).toBe(2);
    expect(p.cycleStartSeq).toBe(3);
  });

  it('日が変わったら 1 日の回数を数え直す', () => {
    let p = { ...initialProgress(), daily: { day: '2026-10-15', newSets: 3, reviewWords: 20 } };
    p = rollDaily(p, '2026-10-16');
    expect(p.daily).toEqual({ day: '2026-10-16', newSets: 0, reviewWords: 0 });
  });
});

describe('セッションの採点', () => {
  const q = { reading: 'R', key: 'K', target: 't', options: ['o0', 'o1', 'o2', 'o3', 'o4'], correct: 2 };

  it('選んだ番号が誤りなら、自己採点にかかわらず設問の語と選んだ語を✕にする', () => {
    const s = createSession('new', 1, '2026-10-16', [q]);
    s.picks[0] = 4;
    const missed = outcomesOf(s)
      .filter((o) => !o.ok)
      .map((o) => o.id);
    expect(missed).toEqual(['t', 'o4']);
  });

  it('自己採点の✕と選んだ番号の正誤を集計する', () => {
    const s = createSession('review', 1, '2026-10-16', [q]);
    s.picks[0] = 2;
    s.marks[0] = [false, true, false, false, false, false];
    const sum = summaryOf(s);
    expect(sum).toMatchObject({ written: 5, total: 6, pickedRight: 1, missedIds: ['o0'] });
    expect(outcomesOf(s)[0]).toEqual({ id: 't', ok: true, reviewTarget: true });
  });
});
