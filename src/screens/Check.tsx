import { CIRCLED, filledSentence, QUESTION_LABELS, SentenceWithBouten } from '../components/QuestionCard';
import { BottomBar, Button, CloseIcon, Header, IconButton, ProgressDots } from '../components/ui';
import { wordOf } from '../data/master';
import { questionWordIds } from '../domain/generator';
import { splitOkurigana } from '../domain/master';
import { forcedRows, isMissed, NO_PICK, type Session } from '../domain/session';
import { useKeys } from '../hooks';
import { goTo, pick, setPhase, toggleMark } from '../store/actions';

export function Check({ session, onExit }: { session: Session; onExit: () => void }) {
  const { index, questions } = session;
  const question = questions[index];
  const chosen = session.picks[index] ?? null;
  const last = index === questions.length - 1;

  const prev = () => (index > 0 ? goTo(index - 1) : setPhase('solve', questions.length - 1));
  const next = () => {
    if (chosen === null) return;
    if (last) setPhase('result');
    else goTo(index + 1);
  };
  useKeys({
    ArrowLeft: prev,
    ArrowRight: next,
    ...(chosen === null ? Object.fromEntries(CIRCLED.map((_, i) => [String(i + 1), () => pick(index, i)])) : {}),
  });

  if (!question) return null;
  const label = QUESTION_LABELS[index] ?? String(index + 1);
  const target = wordOf(question.target);
  const forced = forcedRows(question, chosen);

  return (
    <div className="flex min-h-svh flex-col px-4">
      <Header
        left={
          <IconButton label="中断してホームへ" onClick={onExit}>
            <CloseIcon />
          </IconButton>
        }
        title={
          <span>
            答え合わせ　{index + 1} / {questions.length}
          </span>
        }
      />
      <ProgressDots total={questions.length} current={index} done={(i) => session.picks[i] !== null} />

      <main className="flex flex-1 flex-col gap-4 py-4">
        <p className="paper-card horizontal m-0 px-4 py-3 font-mincho text-[18px] leading-relaxed">
          <span className="mr-1 font-gothic text-[14px] font-bold">（{label}）</span>
          <SentenceWithBouten sentence={target.sentence} />
        </p>

        {chosen === null ? (
          <section aria-labelledby="pick-title" className="flex flex-col gap-3">
            <h2 id="pick-title" className="m-0 text-center text-[18px] font-bold">
              あなたが選んだ番号は？
            </h2>
            <div className="grid grid-cols-5 gap-2">
              {CIRCLED.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pick(index, i)}
                  className="paper-card min-h-16 font-gothic text-[26px] active:bg-shu-wash"
                  aria-label={`${i + 1}番`}
                >
                  {c}
                </button>
              ))}
            </div>
            <Button variant="ghost" onClick={() => pick(index, NO_PICK)}>
              選べなかった
            </Button>
            <p className="m-0 text-center text-[14px] text-ink-sub">番号を選ぶと、見本の漢字が表示されます</p>
          </section>
        ) : (
          <section aria-label="見本と自己採点" className="flex flex-col gap-3">
            <PickSummary correct={question.correct} chosen={chosen} onRedo={() => pick(index, null)} />
            <ScoringGuide />
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {questionWordIds(question).map((id, row) => (
                <AnswerRow
                  key={id}
                  id={id}
                  mark={row === 0 ? `（${label}）` : (CIRCLED[row - 1] as string)}
                  isAnswer={row - 1 === question.correct}
                  isChosen={row > 0 && row - 1 === chosen}
                  missed={isMissed(session, index, row)}
                  locked={forced.has(row)}
                  onToggle={() => toggleMark(index, row)}
                />
              ))}
            </ul>
          </section>
        )}
      </main>

      <BottomBar>
        <Button variant="secondary" className="flex-1" onClick={prev}>
          前へ
        </Button>
        <Button className="flex-[1.6]" onClick={next} disabled={chosen === null}>
          {last ? '採点を終える' : '次の問題'}
        </Button>
      </BottomBar>
    </div>
  );
}

function PickSummary({ correct, chosen, onRedo }: { correct: number; chosen: number; onRedo: () => void }) {
  const right = chosen === correct;
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="m-0 text-[16px]" role="status">
        {right ? (
          <span className="font-bold text-shu">正解！ {CIRCLED[correct]}</span>
        ) : (
          <>
            あなた：{chosen === NO_PICK ? '選べなかった' : CIRCLED[chosen]}　→　正解：
            <span className="font-bold text-shu">{CIRCLED[correct]}</span>
          </>
        )}
      </p>
      <button
        type="button"
        onClick={onRedo}
        className="min-h-12 px-2 text-[14px] text-ink-sub underline underline-offset-4"
      >
        番号を選び直す
      </button>
    </div>
  );
}

function ScoringGuide() {
  return (
    <details className="rounded-[var(--radius-paper)] border border-rule bg-sheet px-4 py-2 text-[14px] leading-relaxed">
      <summary className="min-h-10 cursor-pointer py-2 font-bold">
        採点の基準：画の過不足や部品の取り違えは✕。とめ・はね・はらいの違いは○
      </summary>
      <ul className="m-0 mb-2 pl-5">
        <li>✕：線が 1 本足りない・多い（例：「専」に点を足す）</li>
        <li>✕：へんやつくりを取り違える（例：「積」と「績」）</li>
        <li>○：とめ・はね・はらいの違い、線の長短のわずかな違い</li>
        <li>見本は教科書体です。明朝体の形と違っても、手書きとして正しければ○</li>
      </ul>
      <p className="m-0 mb-2 text-ink-sub">文化庁「常用漢字表の字体・字形に関する指針」の考え方に沿っています。</p>
    </details>
  );
}

type RowProps = {
  id: string;
  mark: string;
  isAnswer: boolean;
  isChosen: boolean;
  missed: boolean;
  locked: boolean;
  onToggle: () => void;
};

function AnswerRow({ id, mark, isAnswer, isChosen, missed, locked, onToggle }: RowProps) {
  const w = wordOf(id);
  // 訓読みの語は、ルビを漢字の部分だけに付け、送り仮名はその後ろに置く（例: 競〔キソ〕う）
  const [kanji, okuri] = splitOkurigana(w.word);
  const [before, , after] = filledSentence(w.sentence, kanji);
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        disabled={locked}
        aria-pressed={missed}
        className={`paper-card flex w-full items-center gap-3 px-3 py-2 text-left transition ${missed ? 'border-shu/50 bg-shu-wash' : ''}`}
      >
        <span className="w-10 shrink-0 text-center font-gothic text-[17px]">
          {isAnswer ? (
            <span className="inline-flex size-9 items-center justify-center rounded-full border-2 border-shu text-shu">
              {mark}
            </span>
          ) : (
            mark
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-kyokasho text-[36px] leading-tight font-semibold">
            <ruby>
              {kanji}
              <rt>{w.kana}</rt>
            </ruby>
            {okuri}
            {w.alt && w.alt.length > 0 && (
              <span className="ml-1 align-middle font-mincho text-[18px] font-normal text-ink-sub">
                （{w.alt.join('・')}）
              </span>
            )}
          </span>
          {w.alt && w.alt.length > 0 && <span className="text-[12px] text-ink-sub">カッコ内の表記で書いても正解</span>}
          <span className="truncate font-mincho text-[13px] text-ink-sub" aria-hidden="true">
            {before}
            <span className="text-ink">{kanji}</span>
            {after}
          </span>
          <span className="flex flex-wrap gap-x-2 text-[12px] whitespace-nowrap empty:hidden">
            {isAnswer && <span className="font-bold text-shu">正解</span>}
            {isChosen && <span className="text-ink-sub">あなたの選択</span>}
            {locked && <span className="text-shu">選び間違えたので復習へ</span>}
          </span>
        </span>
        <span
          className={`flex w-20 shrink-0 flex-col items-center text-[13px] font-bold ${missed ? 'text-shu' : 'text-ink-sub'}`}
        >
          <span
            key={String(missed)}
            className={`text-[30px] leading-none ${missed ? 'stamp-in' : ''}`}
            aria-hidden="true"
          >
            {missed ? '✕' : '○'}
          </span>
          {missed ? '書けなかった' : '書けた'}
        </span>
      </button>
    </li>
  );
}
