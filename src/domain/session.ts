import { questionWordIds } from './generator';
import type { Outcome } from './scheduler';
import type { Question, SetKind } from './types';

export type Phase = 'solve' | 'check' | 'result';

/** 解いている途中のセット */
export type Session = {
  kind: SetKind;
  seed: number;
  /** セットを作った日 */
  day: string;
  questions: Question[];
  phase: Phase;
  index: number;
  /** 各問で生徒が選んだ選択肢の位置。未選択は null */
  picks: (number | null)[];
  /** marks[問][行] が true なら「書けなかった」。行 0 が設問の語、行 1〜 が選択肢 */
  marks: boolean[][];
};

export function createSession(kind: SetKind, seed: number, day: string, questions: Question[]): Session {
  return {
    kind,
    seed,
    day,
    questions,
    phase: 'solve',
    index: 0,
    picks: questions.map(() => null),
    marks: questions.map((q) => questionWordIds(q).map(() => false)),
  };
}

/** 「選べなかった」を選んだときの値 */
export const NO_PICK = -1;

/**
 * 選んだ番号が誤りのとき、自己採点にかかわらず✕にする行。
 * 設問の語と、選んでしまった選択肢の語（選べなかったときは設問の語だけ）。
 */
export function forcedRows(q: Question, pick: number | null): Set<number> {
  if (pick === null || pick === q.correct) return new Set();
  if (pick === NO_PICK) return new Set([0]);
  return new Set([0, pick + 1]);
}

export function isMissed(s: Session, qi: number, row: number): boolean {
  const q = s.questions[qi];
  if (!q) return false;
  return (s.marks[qi]?.[row] ?? false) || forcedRows(q, s.picks[qi] ?? null).has(row);
}

export function outcomesOf(s: Session): Outcome[] {
  return s.questions.flatMap((q, qi) =>
    questionWordIds(q).map((id, row) => ({
      id,
      ok: !isMissed(s, qi, row),
      reviewTarget: s.kind === 'review' && row === 0,
    })),
  );
}

export function summaryOf(s: Session) {
  const outcomes = outcomesOf(s);
  return {
    written: outcomes.filter((o) => o.ok).length,
    total: outcomes.length,
    pickedRight: s.questions.filter((q, i) => s.picks[i] === q.correct).length,
    questions: s.questions.length,
    missedIds: [...new Set(outcomes.filter((o) => !o.ok).map((o) => o.id))],
  };
}
