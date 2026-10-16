import { type Group, type MasterIndex, sharesChar } from './master';
import { type Rng, shuffle, weightedPick } from './rng';
import { CHOICES, type Question, type Word } from './types';

/** 出題の優先度。小さいほど先に使う（未使用 = 0、使用済みは古いほど小さい） */
export type Rank = (id: string) => number;

type BuildOptions = {
  rank: Rank;
  /** このセットですでに使った語など、使ってはいけない語 */
  exclude: ReadonlySet<string>;
  rng: Rng;
  /** 復習問題のときの設問の語 */
  targetId?: string;
};

/** 乱数で混ぜてから優先度順に並べる（同じ優先度の中はランダム） */
function ranked(words: readonly Word[], rank: Rank, rng: Rng): Word[] {
  return shuffle(words, rng).sort((a, b) => rank(a.id) - rank(b.id));
}

/** 漢字ごとの、まだ使える未使用の語の数 */
function unusedByKey(group: Group, opts: BuildOptions): Map<string, number> {
  const counts = new Map<string, number>();
  for (const w of group.words) {
    if (!opts.exclude.has(w.id) && opts.rank(w.id) === 0) counts.set(w.key, (counts.get(w.key) ?? 0) + 1);
  }
  return counts;
}

function pickDistractors(group: Group, target: Word, opts: BuildOptions): Word[] | null {
  // 未使用の語を優先し、その中では未使用の語が多く残っている漢字から使う。
  // 漢字ごとの残りを均すと、次の問題でも「同じ漢字の 2 語」を組みやすい
  const remaining = unusedByKey(group, opts);
  const candidates = shuffle(
    group.words.filter((w) => w.key !== target.key && !opts.exclude.has(w.id) && !sharesChar(w.word, target.word)),
    opts.rng,
  ).sort((a, b) => opts.rank(a.id) - opts.rank(b.id) || (remaining.get(b.key) ?? 0) - (remaining.get(a.key) ?? 0));
  // ただし、未使用の語が 2 つ以上残る漢字は、この先の問題の「同じ漢字の 2 語」に要る。
  // 残りの問題数を q、そうした漢字の数を n2 とすると、誤りの選択肢に回せるのは n2 − q 字まで
  // （漢字 9 種以上のグループで、周回の最後の問題を組めなくなるのを防ぐ）
  const unusedTotal = [...remaining.values()].reduce((a, b) => a + b, 0);
  const pairKeys = [...remaining.values()].filter((n) => n >= 2).length;
  let pairBudget = pairKeys - Math.floor(unusedTotal / (CHOICES + 1));
  const picked: Word[] = [];
  const keys = new Set<string>();
  const pick = (w: Word) => {
    picked.push(w);
    keys.add(w.key);
  };
  // まず未使用の語から、漢字が重ならないように選ぶ
  for (const w of candidates) {
    if (picked.length === CHOICES - 1) break;
    if (keys.has(w.key) || opts.rank(w.id) !== 0) continue;
    if ((remaining.get(w.key) ?? 0) >= 2) {
      if (pairBudget <= 0) continue;
      pairBudget--;
    }
    pick(w);
  }
  // 足りなければ、上限を超えた漢字や使用済みの語からも、漢字が重ならないように選ぶ
  for (const w of candidates) {
    if (picked.length === CHOICES - 1) break;
    if (!keys.has(w.key)) pick(w);
  }
  // それでも足りなければ、漢字の重なりを許す
  for (const w of candidates) {
    if (picked.length === CHOICES - 1) break;
    if (!picked.includes(w)) picked.push(w);
  }
  return picked.length === CHOICES - 1 ? picked : null;
}

function assemble(group: Group, target: Word, answer: Word, distractors: Word[], rng: Rng): Question {
  const options = shuffle([answer, ...distractors], rng);
  return {
    reading: group.reading,
    key: target.key,
    target: target.id,
    options: options.map((w) => w.id),
    correct: options.indexOf(answer),
  };
}

/** 1 つの同音グループから 1 問を組む。組めなければ null */
export function buildQuestion(group: Group, opts: BuildOptions): Question | null {
  const { rank, exclude, rng } = opts;

  if (opts.targetId) {
    const target = group.words.find((w) => w.id === opts.targetId);
    if (!target) return null;
    const answers = ranked(
      (group.byKey.get(target.key) ?? []).filter((w) => w.id !== target.id && !exclude.has(w.id)),
      rank,
      rng,
    );
    const answer = answers[0];
    if (!answer) return null;
    const distractors = pickDistractors(group, target, opts);
    return distractors ? assemble(group, target, answer, distractors, rng) : null;
  }

  // 正解の組（同じ漢字の 2 語）は、未使用の語が最も多く残っている漢字から作る。
  // 1 つしか残っていない漢字は誤りの選択肢に回したほうが、周回の終わりに語が取り残されにくい
  const keys = [...group.byKey.values()]
    .map((ws) => {
      const avail = ws.filter((w) => !exclude.has(w.id));
      return { ws: avail, unused: avail.filter((w) => rank(w.id) === 0).length };
    })
    .filter((k) => k.ws.length >= 2);
  const order = shuffle(keys, rng).sort((a, b) => b.unused - a.unused);
  for (const choice of order) {
    const [first, second] = ranked(choice.ws, rank, rng);
    if (!first || !second) continue;
    const [target, answer] = rng() < 0.5 ? [first, second] : [second, first];
    const distractors = pickDistractors(group, target, opts);
    if (distractors) return assemble(group, target, answer, distractors, rng);
  }
  return null;
}

/**
 * 問題が「正解がちょうど 1 つ」になっているかを確かめる。
 * 問題があればその内容を返し、なければ null。
 */
export function checkQuestion(q: Question, byId: ReadonlyMap<string, Word>): string | null {
  const target = byId.get(q.target);
  if (!target) return `設問の語 ${q.target} がありません`;
  if (q.options.length !== CHOICES) return `選択肢が ${q.options.length} 個です`;
  const ids = new Set([q.target, ...q.options]);
  if (ids.size !== CHOICES + 1) return '同じ語が 2 回使われています';
  for (const [i, id] of q.options.entries()) {
    const w = byId.get(id);
    if (!w) return `選択肢の語 ${id} がありません`;
    if (w.reading !== target.reading) return `${w.word} の音が設問と違います`;
    if (i === q.correct) {
      if (w.key !== target.key) return `正解の ${w.word} が ${target.key} を含みません`;
    } else {
      if (w.key === target.key) return `誤りの選択肢 ${w.word} が ${target.key} を含みます`;
      if (sharesChar(w.word, target.word)) return `誤りの選択肢 ${w.word} が ${target.word} と同じ字を含みます`;
    }
  }
  return null;
}

/** 問題が使う語の id（設問の語と選択肢） */
export function questionWordIds(q: Question): string[] {
  return [q.target, ...q.options];
}

/**
 * 新しい問題のセットを組む。
 * 未使用の語が多いグループほど選ばれやすくし、1 セットの中で同じ音は重ねない。
 */
export function buildNewSet(index: MasterIndex, rank: Rank, rng: Rng, size: number): Question[] {
  const exclude = new Set<string>();
  const usedReadings = new Set<string>();
  const questions: Question[] = [];
  const allGroups = [...index.groups.values()];

  for (let i = 0; i < size; i++) {
    let candidates = allGroups.filter((g) => !usedReadings.has(g.reading));
    if (candidates.length === 0) candidates = [...allGroups];
    let question: Question | null = null;
    while (!question && candidates.length > 0) {
      const unused = (g: Group) => g.words.filter((w) => !exclude.has(w.id) && rank(w.id) === 0).length;
      // 未使用の語の数の 2 乗で重み付けし、周回の終わりに語が取り残されにくくする
      const group = weightedPick(candidates, (g) => unused(g) ** 2, rng) ?? shuffle(candidates, rng)[0];
      if (!group) break;
      candidates = candidates.filter((g) => g !== group);
      question = buildQuestion(group, { rank, exclude, rng });
    }
    if (!question) break;
    questions.push(question);
    usedReadings.add(question.reading);
    for (const id of questionWordIds(question)) exclude.add(id);
  }
  return questions;
}

/**
 * 復習のセットを組む。dueIds は期日の古い順に並んでいること。
 * ほかの復習の語は、設問として出せるように選択肢にはなるべく使わない。
 * すでにこのセットの選択肢に使った語は、このセットでは設問にせず次の回に回す。
 */
export function buildReviewSet(index: MasterIndex, dueIds: readonly string[], rng: Rng, size: number): Question[] {
  const planned = dueIds.filter((id) => {
    const w = index.byId.get(id);
    return w !== undefined && index.groups.has(w.reading);
  });
  const due = new Set(planned);
  const rank: Rank = (id) => (due.has(id) ? 1 : 0);
  const exclude = new Set<string>();
  const questions: Question[] = [];

  for (const id of planned) {
    if (questions.length >= size) break;
    if (exclude.has(id)) continue;
    const word = index.byId.get(id) as Word;
    const group = index.groups.get(word.reading) as Group;
    const q = buildQuestion(group, { rank, exclude, rng, targetId: id });
    if (!q) continue;
    questions.push(q);
    for (const wid of questionWordIds(q)) exclude.add(wid);
  }
  return questions;
}
