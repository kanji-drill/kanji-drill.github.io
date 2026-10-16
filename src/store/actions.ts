import { z } from 'zod';
import { index, masterVersion, usableIdSet } from '../data/master';
import { buildNewSet, buildReviewSet, questionWordIds } from '../domain/generator';
import { mulberry32, randomSeed } from '../domain/rng';
import {
  advanceCycleIfExhausted,
  applyOutcomes,
  DAILY_NEW_SETS,
  DAILY_REVIEW_WORDS,
  dueReviewIds,
  initialProgress,
  markUsed,
  type Progress,
  rankOf,
  rollDaily,
  today,
} from '../domain/scheduler';
import { createSession, outcomesOf, type Phase, type Session } from '../domain/session';
import type { SetKind } from '../domain/types';
import { defaultSettings, type Settings, useProgress, useSession, useSettings } from './stores';

const now = () => new Date();

const setProgress = (progress: Progress) => useProgress.setState({ progress });
const setSession = (session: Session | null) => useSession.setState({ session });
const updateSession = (fn: (s: Session) => Session) => {
  const s = useSession.getState().session;
  if (s) setSession(fn(s));
};

/** 起動時: マスタから消えた語を含む途中のセットは捨てる */
export function dropStaleSession() {
  const s = useSession.getState().session;
  if (s?.questions.some((q) => questionWordIds(q).some((id) => !index.byId.has(id)))) setSession(null);
}

/** 今日の状態（日付と 1 日の回数）を進めた Progress */
export function currentProgress(): { progress: Progress; day: string } {
  const p = useProgress.getState().progress;
  const day = today(p, now());
  return { progress: rollDaily(p, day), day };
}

export function dueIds(): string[] {
  const { progress, day } = currentProgress();
  return dueReviewIds(progress, day, usableIdSet);
}

export type StartResult = 'ok' | 'limit' | 'empty';

export function canStart(kind: SetKind): StartResult {
  const { progress } = currentProgress();
  if (kind === 'new') return progress.daily.newSets >= DAILY_NEW_SETS ? 'limit' : 'ok';
  if (progress.daily.reviewWords >= DAILY_REVIEW_WORDS) return 'limit';
  return dueIds().length === 0 ? 'empty' : 'ok';
}

/** 新しいセットを始める。途中のセットがあれば、その採点を確定してから始める */
export function startSet(kind: SetKind): StartResult {
  commitSession();
  const check = canStart(kind);
  if (check !== 'ok') return check;

  let { progress: p, day } = currentProgress();
  const size = useSettings.getState().setSize;
  const seed = randomSeed();
  const rng = mulberry32(seed);

  if (kind === 'new') {
    p = advanceCycleIfExhausted(p, index.usableIds);
    const questions = buildNewSet(index, rankOf(p), rng, size);
    if (questions.length === 0) return 'empty';
    // 途中で投げ出しても、一度見た語は出題済みとして扱う
    p = markUsed(p, questions.flatMap(questionWordIds));
    p = { ...p, daily: { ...p.daily, newSets: p.daily.newSets + 1 } };
    setProgress(p);
    setSession(createSession(kind, seed, day, questions));
  } else {
    const remaining = DAILY_REVIEW_WORDS - p.daily.reviewWords;
    const questions = buildReviewSet(index, dueReviewIds(p, day, usableIdSet), rng, Math.min(size, remaining));
    if (questions.length === 0) return 'empty';
    p = { ...p, daily: { ...p.daily, reviewWords: p.daily.reviewWords + questions.length } };
    setProgress(p);
    setSession(createSession(kind, seed, day, questions));
  }
  return 'ok';
}

/** 途中のセットを終了する（答え合わせ前なら採点は記録しない） */
export function discardSession() {
  const s = useSession.getState().session;
  if (s?.phase === 'result') commitSession();
  else setSession(null);
}

/** 結果画面まで進んだセットの採点を記録する */
export function commitSession() {
  const s = useSession.getState().session;
  if (!s) return;
  if (s.phase !== 'result') return;
  const { progress, day } = currentProgress();
  setProgress(applyOutcomes(progress, outcomesOf(s), day));
  setSession(null);
  requestPersistentStorage();
}

export const goTo = (index: number) => updateSession((s) => ({ ...s, index }));
export const setPhase = (phase: Phase, index = 0) => updateSession((s) => ({ ...s, phase, index }));

/** 選んだ番号を記録する。null で選び直し */
export function pick(qi: number, choice: number | null) {
  updateSession((s) => ({ ...s, picks: s.picks.map((p, i) => (i === qi ? choice : p)) }));
}

export function toggleMark(qi: number, row: number) {
  updateSession((s) => ({
    ...s,
    marks: s.marks.map((m, i) => (i === qi ? m.map((v, r) => (r === row ? !v : v)) : m)),
  }));
}

export function updateSettings(patch: Partial<Settings>) {
  useSettings.setState(patch);
}

let persistRequested = false;
/** iOS などで、しばらく開かないとデータが消されるのを防ぐよう、ブラウザに保護を求める */
export function requestPersistentStorage() {
  if (persistRequested) return;
  persistRequested = true;
  navigator.storage?.persist?.().catch(() => {});
}

// ---- 書き出し・読み込み ----

const progressSchema = z.object({
  cycle: z.number().int().min(1),
  cycleStartSeq: z.number().int().min(0),
  nextSeq: z.number().int().min(0),
  words: z.record(
    z.string(),
    z.object({
      lastSeq: z.number().int().optional(),
      review: z.object({ stage: z.number().int().min(0), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).optional(),
      right: z.number().int().min(0),
      wrong: z.number().int().min(0),
      mastered: z.boolean().optional(),
    }),
  ),
  lastDay: z.string().nullable(),
  daily: z.object({ day: z.string(), newSets: z.number().int(), reviewWords: z.number().int() }),
  lastExportAt: z.string().nullable(),
});

const exportSchema = z.object({
  app: z.literal('kanji-drill'),
  schemaVersion: z.literal(1),
  masterVersion: z.string(),
  exportedAt: z.string(),
  settings: z
    .object({
      writing: z.enum(['vertical', 'horizontal']),
      size: z.enum(['normal', 'large']),
      setSize: z.union([z.literal(3), z.literal(5)]),
    })
    .partial(),
  progress: progressSchema,
});

export function exportData(): { filename: string; json: string } {
  const exportedAt = now().toISOString();
  const progress = { ...useProgress.getState().progress, lastExportAt: exportedAt };
  const { writing, size, setSize } = useSettings.getState();
  const data = {
    app: 'kanji-drill',
    schemaVersion: 1,
    masterVersion,
    exportedAt,
    settings: { writing, size, setSize },
    progress,
  };
  setProgress(progress);
  const stamp = exportedAt.slice(0, 10);
  return { filename: `kanji-drill-${stamp}.json`, json: JSON.stringify(data) };
}

/** 書き出したファイルを読み込み、今の記録を上書きする。失敗したら理由を返す */
export function importData(text: string): string | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return 'ファイルを読めませんでした。書き出した JSON ファイルを選んでください。';
  }
  const parsed = exportSchema.safeParse(raw);
  if (!parsed.success) return 'このアプリで書き出したファイルではないか、ファイルが壊れています。';
  setProgress(parsed.data.progress);
  useSettings.setState({ ...defaultSettings, ...useSettings.getState(), ...parsed.data.settings });
  setSession(null);
  return null;
}

export function resetAll() {
  setProgress(initialProgress());
  setSession(null);
}
