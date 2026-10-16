import { wordOf } from '../data/master';
import type { Question } from '../domain/types';

export const QUESTION_LABELS = ['ア', 'イ', 'ウ', 'エ', 'オ'];
export const CIRCLED = ['①', '②', '③', '④', '⑤'];

/** 例文を表示し、{} で囲んだカタカナに傍線を引く */
export function SentenceWithBouten({ sentence }: { sentence: string }) {
  const m = /^(.*)\{(.+)\}(.*)$/.exec(sentence);
  if (!m) return <>{sentence}</>;
  return (
    <>
      {m[1]}
      <span className="sr-only">傍線部、</span>
      <span className="bouten">{m[2]}</span>
      <span className="sr-only">、</span>
      {m[3]}
    </>
  );
}

/** 例文のカタカナ部分を漢字に置き換えた文 */
export function filledSentence(sentence: string, word: string): [string, string, string] {
  const m = /^(.*)\{(.+)\}(.*)$/.exec(sentence);
  return m ? [m[1] ?? '', word, m[3] ?? ''] : [sentence, '', ''];
}

type Props = {
  question: Question;
  label: string;
  writing: 'vertical' | 'horizontal';
};

export function QuestionCard({ question, label, writing }: Props) {
  const target = wordOf(question.target);
  const options = question.options.map(wordOf);

  if (writing === 'horizontal') {
    return (
      <div className="paper-card horizontal q-text px-4 py-5" data-testid="question-card">
        <p className="m-0">
          <span className="mr-2 font-gothic text-[0.8em] font-bold">（{label}）</span>
          <SentenceWithBouten sentence={target.sentence} />
        </p>
        <hr className="my-4 border-rule" />
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {options.map((w, i) => (
            <li key={w.id} className="flex gap-3">
              <span className="font-gothic text-[0.9em]">{CIRCLED[i]}</span>
              <span>
                <SentenceWithBouten sentence={w.sentence} />
              </span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // 縦書き: 右端が設問、仕切り線をはさんで左へ ①〜⑤
  return (
    <div
      className="paper-card q-text flex h-full flex-row-reverse items-stretch justify-between px-2 py-4 sm:px-4"
      data-testid="question-card"
    >
      <Column
        mark={<span className="inline-block border border-ink px-1 leading-tight">{label}</span>}
        label={`（${label}）`}
      >
        <SentenceWithBouten sentence={target.sentence} />
      </Column>
      <div className="mx-1 w-px self-stretch bg-rule" aria-hidden="true" />
      {options.map((w, i) => (
        <Column key={w.id} mark={CIRCLED[i]} label={`選択肢${i + 1}`}>
          <SentenceWithBouten sentence={w.sentence} />
        </Column>
      ))}
    </div>
  );
}

function Column({ mark, label, children }: { mark: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <span className="font-gothic text-[15px] leading-none" aria-hidden="true">
        {mark}
      </span>
      <p className="vertical m-0">
        <span className="sr-only">{label}、</span>
        {children}
      </p>
    </div>
  );
}
