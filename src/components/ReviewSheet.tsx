import { wordOf } from '../data/master';
import type { Question } from '../domain/types';
import { SentenceWithBouten } from './QuestionCard';

/** 復習の番号（1）〜 */
export const reviewLabel = (i: number) => `（${i + 1}）`;

/**
 * 復習の一覧（D29）。書けなかった語だけを例文つきで並べ、ノートに一度に書いてもらう。
 * 何語も並べるので、設定にかかわらず横書きにする
 */
export function ReviewSheet({ questions }: { questions: readonly Question[] }) {
  return (
    <ol
      className="paper-card horizontal review-text m-0 flex list-none flex-col gap-2 px-4 py-4"
      data-testid="review-sheet"
    >
      {questions.map((q, i) => (
        <li key={q.target} className="flex gap-2">
          <span className="w-10 shrink-0 pt-[0.15em] font-gothic text-[15px] font-bold">{reviewLabel(i)}</span>
          <span className="min-w-0">
            <SentenceWithBouten sentence={wordOf(q.target).sentence} />
          </span>
        </li>
      ))}
    </ol>
  );
}
