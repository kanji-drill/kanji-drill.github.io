import { type ReactNode, useRef, useState } from 'react';
import { BackIcon, Button, Header, IconButton, Notice } from '../components/ui';
import { exportData, importData, resetAll, updateSettings } from '../store/actions';
import { type Settings as SettingsType, useSettings } from '../store/stores';

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 text-[15px] font-bold">{label}</legend>
      <div className="flex overflow-hidden rounded-[var(--radius-paper)] border-2 border-line">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`min-h-12 flex-1 text-[15px] ${o.value === value ? 'bg-ink font-bold text-sheet' : 'bg-sheet text-ink'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="paper-card flex flex-col gap-4 px-5 py-4">
      <h2 className="m-0 text-[17px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function Settings({ onBack, onAbout }: { onBack: () => void; onAbout: () => void }) {
  const s = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const [eraseText, setEraseText] = useState('');
  const set = (patch: Partial<SettingsType>) => updateSettings(patch);

  const doExport = () => {
    const { filename, json } = exportData();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`「${filename}」を書き出しました。端末のファイルやクラウドに保存しておいてください。`);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setPendingImport(await file.text());
    if (fileRef.current) fileRef.current.value = '';
  };

  const confirmImport = () => {
    if (pendingImport === null) return;
    const error = importData(pendingImport);
    setPendingImport(null);
    setStatus(error ?? '記録を読み込みました。');
  };

  return (
    <div className="flex min-h-svh flex-col px-4 pb-8">
      <Header
        left={
          <IconButton label="ホームへ戻る" onClick={onBack}>
            <BackIcon />
          </IconButton>
        }
        title="設定とデータ"
      />
      <main className="flex flex-col gap-4">
        <Section title="表示">
          <Segmented
            label="問題の向き"
            value={s.writing}
            options={[
              { value: 'vertical', label: '縦書き（本番と同じ）' },
              { value: 'horizontal', label: '横書き' },
            ]}
            onChange={(writing) => set({ writing })}
          />
          <Segmented
            label="文字の大きさ"
            value={s.size}
            options={[
              { value: 'normal', label: '標準' },
              { value: 'large', label: '大' },
            ]}
            onChange={(size) => set({ size })}
          />
          <Segmented
            label="1 セットの問題数"
            value={s.setSize}
            options={[
              { value: 3, label: '3 問' },
              { value: 5, label: '5 問（本番と同じ）' },
            ]}
            onChange={(setSize) => set({ setSize })}
          />
        </Section>

        <Section title="記録の書き出し・読み込み">
          <p className="m-0 text-[14px] leading-relaxed text-ink-sub">
            記録はこの端末のブラウザの中だけに保存されています。機種変更の前や、ときどき書き出して保存しておくと安心です。
          </p>
          <Button variant="secondary" onClick={doExport}>
            記録を書き出す
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            書き出したファイルを読み込む
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          {pendingImport !== null && (
            <Notice tone="shu">
              <p className="m-0 mb-3">今の記録を、読み込むファイルの内容で上書きします。よろしいですか？</p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="min-h-11 flex-1 text-[15px]"
                  onClick={() => setPendingImport(null)}
                >
                  やめる
                </Button>
                <Button className="min-h-11 flex-1 text-[15px]" onClick={confirmImport}>
                  上書きする
                </Button>
              </div>
            </Notice>
          )}
          {status && (
            <p className="m-0 text-[14px]" role="status">
              {status}
            </p>
          )}
        </Section>

        <Section title="記録の消去">
          <p className="m-0 text-[14px] text-ink-sub">
            すべての記録を消して、最初からやり直します。元に戻せません。確認のため「消去」と入力してください。
          </p>
          <input
            value={eraseText}
            onChange={(e) => setEraseText(e.target.value)}
            aria-label="確認のため「消去」と入力"
            placeholder="消去"
            className="min-h-12 rounded-[var(--radius-paper)] border-2 border-line bg-sheet px-3 text-[16px]"
          />
          <Button
            variant="secondary"
            disabled={eraseText !== '消去'}
            onClick={() => {
              resetAll();
              setEraseText('');
              setStatus('記録を消去しました。');
            }}
          >
            記録を消去する
          </Button>
        </Section>

        <Button variant="ghost" onClick={onAbout}>
          このアプリについて
        </Button>
      </main>
    </div>
  );
}
