/** 1 日の区切り。夜中の学習を前日扱いにする */
export const DAY_START_HOUR = 4;
/** 復習の間隔（日）。段階 0 → 1 → 2 の順に進み、3 回続けて書けたら外す */
export const REVIEW_INTERVALS = [1, 3, 7] as const;
export const DAILY_NEW_SETS = 3;
export const DAILY_REVIEW_WORDS = 30;

export type ReviewState = {
  /** 0 始まりの段階 */
  stage: number;
  /** YYYY-MM-DD */
  due: string;
};

export type WordProgress = {
  /** 最後に「新しい問題」で使った出題番号 */
  lastSeq?: number;
  review?: ReviewState;
  right: number;
  wrong: number;
  /** 覚えた語（一度でも書けた語、または復習を卒業した語）。一度立てたら戻さない */
  mastered?: boolean;
};

export type Progress = {
  cycle: number;
  /** 今の周回が始まったときの出題番号。lastSeq がこれより小さければ未使用 */
  cycleStartSeq: number;
  nextSeq: number;
  words: Record<string, WordProgress>;
  /** 最後に使った日。時計が戻っても日付を巻き戻さないために使う */
  lastDay: string | null;
  daily: { day: string; newSets: number; reviewWords: number };
  lastExportAt: string | null;
};

export function initialProgress(): Progress {
  return {
    cycle: 1,
    cycleStartSeq: 0,
    nextSeq: 0,
    words: {},
    lastDay: null,
    daily: { day: '', newSets: 0, reviewWords: 0 },
    lastExportAt: null,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 端末ローカルの日付（午前 4 時区切り）を YYYY-MM-DD で返す */
export function dayKey(now: Date): string {
  const d = new Date(now.getTime() - DAY_START_HOUR * 60 * 60 * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d + n);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 今日。時計が戻った場合は最後に使った日を使う */
export function today(p: Progress, now: Date): string {
  const d = dayKey(now);
  return p.lastDay && p.lastDay > d ? p.lastDay : d;
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = to.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function isUnused(p: Progress, id: string): boolean {
  return (p.words[id]?.lastSeq ?? -1) < p.cycleStartSeq;
}

/** 出題の優先度（未使用 = 0、使用済みは古いほど小さい） */
export function rankOf(p: Progress) {
  return (id: string) => (isUnused(p, id) ? 0 : 1 + (p.words[id]?.lastSeq ?? 0));
}

/** 未使用の語がなくなっていれば、次の周回に進める */
export function advanceCycleIfExhausted(p: Progress, usableIds: readonly string[]): Progress {
  if (usableIds.length === 0 || usableIds.some((id) => isUnused(p, id))) return p;
  return { ...p, cycle: p.cycle + 1, cycleStartSeq: p.nextSeq };
}

export function unusedCount(p: Progress, usableIds: readonly string[]): number {
  return usableIds.filter((id) => isUnused(p, id)).length;
}

/** 新しい問題で使った語に出題番号を振る */
export function markUsed(p: Progress, ids: readonly string[]): Progress {
  const words = { ...p.words };
  let seq = p.nextSeq;
  for (const id of ids) {
    words[id] = { right: 0, wrong: 0, ...words[id], lastSeq: seq++ };
  }
  return { ...p, words, nextSeq: seq };
}

/** 復習の期日を迎えた語（期日の古い順） */
export function dueReviewIds(p: Progress, day: string, validIds?: ReadonlySet<string>): string[] {
  return Object.entries(p.words)
    .filter(([id, w]) => w.review && w.review.due <= day && (!validIds || validIds.has(id)))
    .sort(
      ([a, x], [b, y]) =>
        (x.review as ReviewState).due.localeCompare((y.review as ReviewState).due) || a.localeCompare(b),
    )
    .map(([id]) => id);
}

/** 次の復習日（期日を迎えていないもののうち最も早い日） */
export function nextReviewDay(p: Progress, day: string): string | null {
  let next: string | null = null;
  for (const w of Object.values(p.words)) {
    if (w.review && w.review.due > day && (!next || w.review.due < next)) next = w.review.due;
  }
  return next;
}

export type Outcome = {
  id: string;
  /** 書けたか */
  ok: boolean;
  /** 期日を迎えた復習問題の設問の語か（このときだけ連続回数に数える） */
  reviewTarget: boolean;
};

export function applyOutcomes(p: Progress, outcomes: readonly Outcome[], day: string): Progress {
  const words = { ...p.words };
  for (const o of outcomes) {
    const w: WordProgress = { right: 0, wrong: 0, ...words[o.id] };
    if (!o.ok) {
      w.wrong += 1;
      w.review = { stage: 0, due: addDays(day, REVIEW_INTERVALS[0]) };
    } else {
      w.right += 1;
      if (o.reviewTarget && w.review) {
        const next = w.review.stage + 1;
        if (next >= REVIEW_INTERVALS.length) {
          delete w.review;
          w.mastered = true;
        } else {
          w.review = { stage: next, due: addDays(day, REVIEW_INTERVALS[next] as number) };
        }
      } else if (!w.review) {
        w.mastered = true;
      }
    }
    words[o.id] = w;
  }
  return { ...p, words };
}

export function masteredCount(p: Progress): number {
  return Object.values(p.words).filter((w) => w.mastered).length;
}

/** 日が変わっていれば 1 日の回数を数え直す */
export function rollDaily(p: Progress, day: string): Progress {
  const lastDay = p.lastDay && p.lastDay > day ? p.lastDay : day;
  if (p.daily.day === day) return lastDay === p.lastDay ? p : { ...p, lastDay };
  return { ...p, lastDay, daily: { day, newSets: 0, reviewWords: 0 } };
}
