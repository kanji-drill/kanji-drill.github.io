import { QUESTION_LABELS, QuestionCard } from '../components/QuestionCard';
import { BottomBar, Button, CloseIcon, Header, IconButton, ProgressDots } from '../components/ui';
import type { Session } from '../domain/session';
import { useKeys, useWakeLock } from '../hooks';
import { goTo, setPhase } from '../store/actions';
import { useSettings } from '../store/stores';

export function Solve({ session, onExit }: { session: Session; onExit: () => void }) {
  const writing = useSettings((s) => s.writing);
  const hintDone = useSettings((s) => s.onboardingDone);
  const { index, questions, kind } = session;
  const question = questions[index];
  const last = index === questions.length - 1;
  useWakeLock(true);

  const prev = () => index > 0 && goTo(index - 1);
  const next = () => (last ? setPhase('check', 0) : goTo(index + 1));
  useKeys({ ArrowLeft: prev, ArrowRight: next });

  if (!question) return null;
  const label = QUESTION_LABELS[index] ?? String(index + 1);

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
            {kind === 'new' ? '新しい問題' : '復習'}　{index + 1} / {questions.length}
          </span>
        }
      />
      <ProgressDots total={questions.length} current={index} done={(i) => i < index} />

      <main className="flex flex-1 flex-col gap-3 py-3">
        <h2 className="sr-only">（{label}）傍線部のカタカナに相当する漢字を含むものを、①〜⑤のうちから一つ選べ。</h2>
        <p className="m-0 text-[14px] leading-snug text-ink-sub" aria-hidden="true">
          傍線部に相当する漢字を含むものを選び、ノートに番号と全部の漢字を書こう
        </p>
        <div className={writing === 'vertical' ? 'flex flex-1' : ''}>
          <div className="w-full">
            <QuestionCard question={question} label={label} writing={writing} />
          </div>
        </div>
        {!hintDone && index === 0 && (
          <p className="m-0 text-center text-[14px] text-ink-sub">例：ノートに「{label}-③ 沸騰 …」</p>
        )}
      </main>

      <BottomBar>
        <Button variant="secondary" className="flex-1" onClick={prev} disabled={index === 0}>
          前へ
        </Button>
        <Button className="flex-[1.6]" onClick={next}>
          {last ? '答え合わせへ' : '次へ'}
        </Button>
      </BottomBar>
    </div>
  );
}
