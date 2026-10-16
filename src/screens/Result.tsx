import { BottomBar, Button, Hanamaru, Header, Notice } from '../components/ui';
import { wordOf } from '../data/master';
import { addDays, REVIEW_INTERVALS } from '../domain/scheduler';
import { type Session, summaryOf } from '../domain/session';
import { canStart, commitSession, currentProgress, setPhase, startSet } from '../store/actions';

function formatDay(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${m}月${d}日`;
}

export function Result({ session, onHome }: { session: Session; onHome: () => void }) {
  const sum = summaryOf(session);
  const perfect = sum.written === sum.total && sum.pickedRight === sum.questions;
  const nextReview = addDays(currentProgress().day, REVIEW_INTERVALS[0]);
  const again = canStart(session.kind);

  const finish = () => {
    commitSession();
    onHome();
  };
  const oneMore = () => {
    commitSession();
    if (startSet(session.kind) !== 'ok') onHome();
  };

  return (
    <div className="flex min-h-svh flex-col px-4">
      <Header title={session.kind === 'new' ? '新しい問題の結果' : '復習の結果'} />
      <main className="flex flex-1 flex-col gap-5 py-4">
        <section className="paper-card flex items-center gap-5 px-5 py-5" aria-label="結果">
          {perfect && <Hanamaru />}
          <dl className="m-0 grid flex-1 grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2">
            <dt className="text-[15px] text-ink-sub">書けた語</dt>
            <dd className="m-0 font-mincho text-[34px] font-bold">
              {sum.written}
              <span className="text-[18px] text-ink-sub"> / {sum.total}</span>
            </dd>
            <dt className="text-[15px] text-ink-sub">選択の正解</dt>
            <dd className="m-0 font-mincho text-[24px] font-bold">
              {sum.pickedRight}
              <span className="text-[16px] text-ink-sub"> / {sum.questions} 問</span>
            </dd>
          </dl>
        </section>

        {perfect && <p className="m-0 text-center text-[16px] font-bold text-shu">全部書けました！</p>}

        {sum.missedIds.length > 0 && (
          <section aria-labelledby="missed-title" className="flex flex-col gap-2">
            <h2 id="missed-title" className="m-0 text-[16px] font-bold">
              復習に入った語（{sum.missedIds.length}）
            </h2>
            <p className="m-0 text-[14px] text-ink-sub">
              次は {formatDay(nextReview)} に出ます。そのあと 3 日後、7 日後と間隔をあけて出し、3
              回続けて書けたら卒業です。
            </p>
            <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
              {sum.missedIds.map((id) => {
                const w = wordOf(id);
                return (
                  <li key={id} className="paper-card flex items-baseline justify-between px-3 py-2">
                    <span className="font-kyokasho text-[24px] font-semibold">
                      {w.word}
                      {w.alt?.length ? (
                        <span className="font-mincho text-[13px] font-normal text-ink-sub">（{w.alt.join('・')}）</span>
                      ) : null}
                    </span>
                    <span className="text-[12px] text-ink-sub">{w.kana}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <Button variant="ghost" onClick={() => setPhase('check', session.questions.length - 1)}>
          答え合わせに戻って採点を直す
        </Button>

        {again === 'limit' && (
          <Notice>今日の{session.kind === 'new' ? '新しい問題' : '復習'}はここまでです。また明日。</Notice>
        )}
      </main>

      <BottomBar>
        <Button variant="secondary" className="flex-1" onClick={finish}>
          ホームへ
        </Button>
        {again === 'ok' && (
          <Button className="flex-[1.4]" onClick={oneMore}>
            もう 1 セット
          </Button>
        )}
      </BottomBar>
    </div>
  );
}
