import { canPair, type Group, type MasterIndex, sharesChar } from './master';
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
  /** 誤りの選択肢に必ず入れる語（期日を迎えた選択肢専用の語を復習するとき） */
  mustInclude?: Word;
};

/** 乱数で混ぜてから優先度順に並べる（同じ優先度の中はランダム） */
function ranked(words: readonly Word[], rank: Rank, rng: Rng): Word[] {
  return shuffle(words, rng).sort((a, b) => rank(a.id) - rank(b.id));
}

/**
 * 選択肢に使えるか。訓読みの語が設問のときは、選択肢を音読みの語だけにする
 * （訓読みどうしだと意味だけで選べてしまい、同音の字を書き分ける練習にならない）
 */
function fitsTarget(w: Word, target: Word): boolean {
  return !(target.kun && w.kun);
}

/**
 * 誤りの選択肢に先に使う語ほど大きい値。使い道の少ない語から使うと、周回の終わりに語が取り残されにくい。
 * 選択肢専用の語は誤りの選択肢にしか使えず、訓読みの語は訓読みの設問の選択肢に使えない
 */
function distractorFirst(target: Word, w: Word): number {
  if (w.distractorOnly) return 2;
  return !target.kun && w.kun ? 1 : 0;
}

const isAvailableUnused = (w: Word, opts: BuildOptions) => !opts.exclude.has(w.id) && opts.rank(w.id) === 0;

/** 漢字ごとの、正解の組（同じ漢字の 2 語）に使える未使用の語の数 */
function unusedByKey(group: Group, opts: BuildOptions): Map<string, number> {
  const counts = new Map<string, number>();
  for (const w of group.words) {
    if (canPair(w) && isAvailableUnused(w, opts)) counts.set(w.key, (counts.get(w.key) ?? 0) + 1);
  }
  return counts;
}

/** 設問の語 target が、必ず入れる誤りの選択肢 m と両立するか */
function allowsMustInclude(target: Word, m: Word | undefined): boolean {
  return !m || (target.key !== m.key && !sharesChar(m.word, target.word) && fitsTarget(m, target));
}

function pickDistractors(group: Group, target: Word, opts: BuildOptions): Word[] | null {
  // 未使用の語を優先し、その中では未使用の語が多く残っている漢字から使う。
  // 漢字ごとの残りを均すと、次の問題でも「同じ漢字の 2 語」を組みやすい
  const remaining = unusedByKey(group, opts);
  const candidates = shuffle(
    group.words.filter(
      (w) =>
        w !== opts.mustInclude &&
        w.key !== target.key &&
        !opts.exclude.has(w.id) &&
        !sharesChar(w.word, target.word) &&
        fitsTarget(w, target),
    ),
    opts.rng,
  ).sort(
    (a, b) =>
      opts.rank(a.id) - opts.rank(b.id) ||
      distractorFirst(target, b) - distractorFirst(target, a) ||
      (remaining.get(b.key) ?? 0) - (remaining.get(a.key) ?? 0),
  );
  // ただし、未使用の語が 2 つ以上残る漢字は、この先の問題の「同じ漢字の 2 語」に要る。
  // 残りの問題数を q、そうした漢字の数を n2 とすると、誤りの選択肢に回せるのは n2 − q 字まで
  // （漢字 9 種以上のグループで、周回の最後の問題を組めなくなるのを防ぐ）
  const unusedTotal = group.words.filter((w) => isAvailableUnused(w, opts)).length;
  const pairKeys = [...remaining.values()].filter((n) => n >= 2).length;
  const questionsLeft = Math.max(1, Math.floor(unusedTotal / (CHOICES + 1)));
  let pairBudget = pairKeys - questionsLeft;
  // 選択肢専用の語は、残りの問題に均等に割り振る。1 問で使い切ると、後の問題で
  // 「漢字の違う誤りの選択肢 4 つ」をそろえられなくなる（例: 2,2,2,2,2 の 5 字＋選択肢専用 2 語）
  const onlyUnused = group.words.filter((w) => w.distractorOnly && isAvailableUnused(w, opts)).length;
  let onlyBudget = Math.ceil(onlyUnused / questionsLeft);
  const picked: Word[] = [];
  const keys = new Set<string>();
  const pick = (w: Word) => {
    picked.push(w);
    keys.add(w.key);
  };
  if (opts.mustInclude) pick(opts.mustInclude);
  // まず未使用の語から、漢字が重ならないように選ぶ
  for (const w of candidates) {
    if (picked.length === CHOICES - 1) break;
    if (keys.has(w.key) || opts.rank(w.id) !== 0) continue;
    if (w.distractorOnly) {
      if (onlyBudget <= 0) continue;
      onlyBudget--;
    }
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
    if (!target || !canPair(target) || !allowsMustInclude(target, opts.mustInclude)) return null;
    const answers = ranked(
      (group.byKey.get(target.key) ?? []).filter(
        (w) => w.id !== target.id && canPair(w) && !exclude.has(w.id) && fitsTarget(w, target),
      ),
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
      const avail = ws.filter((w) => canPair(w) && !exclude.has(w.id));
      return { ws: avail, unused: avail.filter((w) => rank(w.id) === 0).length };
    })
    .filter((k) => k.ws.length >= 2);
  const order = shuffle(keys, rng).sort((a, b) => b.unused - a.unused);
  for (const choice of order) {
    const [first, ...rest] = ranked(choice.ws, rank, rng);
    // 訓読みの語どうしは組にしない（どちらを設問にしても、もう一方を選択肢に使えない）
    const second = first && rest.find((w) => fitsTarget(w, first));
    if (!first || !second) continue;
    // 設問にする語は半々で決める。ただし訓読みの語を設問にすると誤りの選択肢が音読みの語に限られるので、
    // 未使用の語だけで組めないときは、逆の向き（もう一方を設問）でも試して、未使用の語で組めるほうを使う
    const pairs: [Word, Word][] = rng() < 0.5 ? [[first, second]] : [[second, first]];
    if (first.kun !== second.kun || opts.mustInclude) pairs.push([pairs[0]?.[1] as Word, pairs[0]?.[0] as Word]);
    let fallback: Question | null = null;
    for (const [target, answer] of pairs) {
      if (!allowsMustInclude(target, opts.mustInclude)) continue;
      const distractors = pickDistractors(group, target, opts);
      if (!distractors) continue;
      const q = assemble(group, target, answer, distractors, rng);
      if (distractors.every((w) => rank(w.id) === 0)) return q;
      fallback ??= q;
    }
    if (fallback) return fallback;
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
  if (target.distractorOnly) return `選択肢専用の語 ${target.word} が設問になっています`;
  if (q.options.length !== CHOICES) return `選択肢が ${q.options.length} 個です`;
  const ids = new Set([q.target, ...q.options]);
  if (ids.size !== CHOICES + 1) return '同じ語が 2 回使われています';
  for (const [i, id] of q.options.entries()) {
    const w = byId.get(id);
    if (!w) return `選択肢の語 ${id} がありません`;
    if (w.reading !== target.reading) return `${w.word} の音が設問と違います`;
    if (w.distractorOnly && i === q.correct) return `選択肢専用の語 ${w.word} が正解になっています`;
    if (!fitsTarget(w, target)) return `訓読みの設問 ${target.word} の選択肢に、訓読みの語 ${w.word} があります`;
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
 * 選択肢専用の語は設問にできないので、同じ音の問題の誤りの選択肢に入れて出し直す。
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
    const q = canPair(word)
      ? buildQuestion(group, { rank, exclude, rng, targetId: id })
      : buildQuestion(group, { rank, exclude, rng, mustInclude: word });
    if (!q) continue;
    // 期日を迎えた選択肢専用の語が誤りの選択肢に入っていれば、その語の復習として数える
    const reviewed = q.options.filter((o) => due.has(o) && index.byId.get(o)?.distractorOnly);
    if (reviewed.length > 0) q.reviewed = reviewed;
    questions.push(q);
    for (const wid of questionWordIds(q)) exclude.add(wid);
  }
  return questions;
}
