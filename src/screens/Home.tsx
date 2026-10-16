import { useState } from 'react';
import { BottomBar, Button, CloseIcon, GearIcon, Hanamaru, Header, IconButton, Notice } from '../components/ui';
import { hasUnverified, IS_PILOT, index } from '../data/master';
import {
  DAILY_NEW_SETS,
  DAILY_REVIEW_WORDS,
  daysBetween,
  masteredCount,
  nextReviewDay,
  unusedCount,
} from '../domain/scheduler';
import { isIOS, isStandalone } from '../hooks';
import { canStart, currentProgress, discardSession, dueIds, startSet, updateSettings } from '../store/actions';
import { useProgress, useSession, useSettings } from '../store/stores';

const EXPORT_REMIND_DAYS = 14;

function formatDay(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${m}月${d}日`;
}

type Props = {
  onOpen: () => void;
  onSettings: () => void;
  updateReady: boolean;
  onUpdate: () => void;
};

export function Home({ onOpen, onSettings, updateReady, onUpdate }: Props) {
  // 状態の変化で描き直すために購読する
  useProgress((s) => s.progress);
  const session = useSession((s) => s.session);
  const settings = useSettings();
  const [confirmNew, setConfirmNew] = useState<null | 'new' | 'review'>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { progress, day } = currentProgress();
  const due = dueIds();
  const newState = canStart('new');
  const reviewState = canStart('review');
  const mastered = masteredCount(progress);
  const total = index.usableIds.length;
  const used = total - unusedCount(progress, index.usableIds);
  const nextDay = nextReviewDay(progress, day);
  const hasHistory = progress.nextSeq > 0;
  const exportDue =
    hasHistory &&
    (progress.lastExportAt === null
      ? progress.nextSeq >= 60
      : daysBetween(progress.lastExportAt.slice(0, 10), day) >= EXPORT_REMIND_DAYS);
  const showInstall = hasHistory && !settings.installHintDone && !isStandalone();

  const begin = (kind: 'new' | 'review') => {
    if (session && session.phase !== 'result' && !confirmNew) {
      setConfirmNew(kind);
      return;
    }
    setConfirmNew(null);
    if (session?.phase !== 'result') discardSession();
    const r = startSet(kind);
    if (r === 'ok') {
      updateSettings({ onboardingDone: true });
      onOpen();
    } else if (r === 'empty') setMessage('出題できる問題がありませんでした。');
  };

  return (
    <div className="flex min-h-svh flex-col px-4">
      <Header
        title={<span className="font-mincho text-[20px] tracking-wider">漢字ドリル</span>}
        right={
          <IconButton label="設定とデータ" onClick={onSettings}>
            <GearIcon />
          </IconButton>
        }
      />

      <main className="flex flex-1 flex-col gap-4 pb-4">
        {hasUnverified ? (
          <Notice tone="shu">
            試作版：まだ確認が済んでいない問題を含みます。誤りに気づいたら先生に知らせてください。
          </Notice>
        ) : (
          IS_PILOT && <Notice tone="shu">試作版：誤りに気づいたら先生に知らせてください。</Notice>
        )}
        {updateReady && (
          <Notice>
            <div className="flex items-center justify-between gap-3">
              <span>新しいバージョンがあります。</span>
              <Button variant="secondary" className="min-h-11 px-3 text-[15px]" onClick={onUpdate}>
                更新する
              </Button>
            </div>
          </Notice>
        )}

        {!settings.onboardingDone && !hasHistory && (
          <section className="paper-card relative px-5 py-4" aria-labelledby="howto">
            <h2 id="howto" className="m-0 mb-2 text-[17px] font-bold">
              使い方
            </h2>
            <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-[15px] leading-relaxed">
              <li>ノートとペンを用意して、スマホを立てて置く</li>
              <li>1 問ずつ、番号と全選択肢の漢字をノートに書く</li>
              <li>答え合わせで、書けなかった語に✕を付ける</li>
            </ol>
            <p className="m-0 mt-2 text-[13px] text-ink-sub">記録はこの端末の中だけに保存されます。</p>
            <div className="absolute top-1 right-1">
              <IconButton label="使い方を閉じる" onClick={() => updateSettings({ onboardingDone: true })}>
                <CloseIcon />
              </IconButton>
            </div>
          </section>
        )}

        {session && (
          <section className="paper-card flex items-center justify-between gap-3 px-4 py-3" aria-label="途中のセット">
            <p className="m-0 text-[15px]">
              {session.kind === 'new' ? '新しい問題' : '復習'}の途中です
              <span className="ml-1 text-ink-sub">
                （
                {session.phase === 'solve'
                  ? `${session.index + 1} / ${session.questions.length} 問目`
                  : session.phase === 'check'
                    ? '答え合わせ中'
                    : '結果'}
                ）
              </span>
            </p>
            <Button className="min-h-11 shrink-0 px-4 text-[15px]" onClick={onOpen}>
              続きから
            </Button>
          </section>
        )}

        {confirmNew && (
          <Notice tone="shu">
            <p className="m-0 mb-3">途中のセットを終了して、新しく始めますか？（答え合わせ前の問題は記録されません）</p>
            <div className="flex gap-2">
              <Button variant="secondary" className="min-h-11 flex-1 text-[15px]" onClick={() => setConfirmNew(null)}>
                やめる
              </Button>
              <Button className="min-h-11 flex-1 text-[15px]" onClick={() => begin(confirmNew)}>
                終了して始める
              </Button>
            </div>
          </Notice>
        )}

        <section className="paper-card flex items-center gap-4 px-5 py-4" aria-label="覚えた語">
          <div className="flex-1">
            <p className="m-0 text-[14px] text-ink-sub">覚えた語</p>
            <p className="m-0 font-mincho text-[44px] leading-tight font-bold">
              {mastered}
              <span className="ml-1 text-[18px] font-normal text-ink-sub">語</span>
            </p>
          </div>
          <div className="w-40 text-right text-[13px] text-ink-sub">
            <p className="m-0 whitespace-nowrap">
              第 {progress.cycle} 周　{used} / {total} 語
            </p>
            <div
              className="mt-1 h-2 overflow-hidden rounded-full border border-line bg-sheet"
              role="progressbar"
              aria-label="今の周回の進み具合"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={used}
            >
              <div className="h-full bg-ink-sub" style={{ width: `${total ? (used / total) * 100 : 0}%` }} />
            </div>
          </div>
        </section>

        {used === total && total > 0 && (
          <Notice tone="shu">
            <div className="flex items-center gap-3">
              <Hanamaru size={56} />
              <span>
                第 {progress.cycle} 周を終えました！ 次の「新しい問題」から第 {progress.cycle + 1} 周に入ります。
              </span>
            </div>
          </Notice>
        )}

        {exportDue && (
          <Notice>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px]">記録を書き出して保存しておきましょう（機種変更や消去に備えて）</span>
              <Button variant="secondary" className="min-h-11 shrink-0 px-3 text-[14px]" onClick={onSettings}>
                書き出す
              </Button>
            </div>
          </Notice>
        )}

        {showInstall && (
          <Notice>
            <p className="m-0 mb-1 font-bold">ホーム画面に追加しましょう</p>
            <p className="m-0 text-[14px]">
              {isIOS()
                ? 'Safari の共有ボタン（□に↑）→「ホーム画面に追加」。追加しておくと、しばらく開かなくても記録が消えにくくなります。'
                : 'ブラウザのメニュー →「アプリをインストール」または「ホーム画面に追加」。オフラインでも使えます。'}
            </p>
            <Button variant="ghost" className="-ml-3" onClick={() => updateSettings({ installHintDone: true })}>
              閉じる
            </Button>
          </Notice>
        )}

        {message && <Notice>{message}</Notice>}
      </main>

      <BottomBar>
        <div className="flex w-full flex-col gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => begin('review')}
              disabled={reviewState !== 'ok'}
            >
              復習する
              {due.length > 0 && (
                <span className="rounded-full bg-shu px-2 py-0.5 text-[13px] text-on-shu">
                  {due.length}
                  <span className="sr-only"> 語</span>
                </span>
              )}
            </Button>
            <Button className="flex-[1.4]" onClick={() => begin('new')} disabled={newState !== 'ok'}>
              新しい問題を解く
            </Button>
          </div>
          <p className="m-0 text-center text-[13px] text-ink-sub" role="status">
            {reviewState === 'empty' && (nextDay ? `次の復習は ${formatDay(nextDay)}` : '復習する語はまだありません')}
            {reviewState === 'limit' && `今日の復習は ${DAILY_REVIEW_WORDS} 語に達しました`}
            {reviewState === 'ok' && `今日の復習 ${due.length} 語`}
            {'　'}
            {newState === 'limit'
              ? `今日の新しい問題は ${DAILY_NEW_SETS} セットまでです`
              : `新しい問題 ${progress.daily.newSets} / ${DAILY_NEW_SETS} セット`}
          </p>
        </div>
      </BottomBar>
    </div>
  );
}
