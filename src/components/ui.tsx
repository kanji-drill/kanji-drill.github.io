import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-shu text-on-shu shadow-sm active:brightness-95 disabled:bg-line disabled:text-sheet',
  secondary:
    'bg-sheet text-ink border-2 border-line active:bg-paper disabled:bg-transparent disabled:text-ink-sub disabled:border-dashed disabled:border-line',
  ghost: 'text-ink-sub underline underline-offset-4 decoration-1 active:text-ink',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const size =
    variant === 'ghost'
      ? 'min-h-12 px-3 text-[15px]'
      : 'min-h-13 px-5 text-[17px] font-bold rounded-[var(--radius-paper)]';
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 transition disabled:cursor-not-allowed ${size} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

/** 親指で届く下側の操作帯 */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-auto border-t border-rule bg-paper/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur">
      <div className="flex gap-3">{children}</div>
    </div>
  );
}

export function Header({ title, left, right }: { title: ReactNode; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex min-h-14 items-center gap-2 pt-[env(safe-area-inset-top)]">
      <div className="flex min-w-12 justify-start">{left}</div>
      <h1 className="flex-1 text-center text-[16px] font-bold">{title}</h1>
      <div className="flex min-w-12 justify-end">{right}</div>
    </header>
  );
}

export function IconButton({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex size-12 items-center justify-center rounded-full text-ink-sub active:bg-rule/60"
      {...props}
    >
      {children}
    </button>
  );
}

export function GearIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** 進み具合の点 */
export function ProgressDots({
  total,
  current,
  done,
}: {
  total: number;
  current: number;
  done?: (i: number) => boolean;
}) {
  return (
    <ol className="flex justify-center gap-2" aria-label={`${total} 問中 ${current + 1} 問目`}>
      {Array.from({ length: total }, (_, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: 位置そのものが識別子
          key={i}
          className={`size-2.5 rounded-full ${i === current ? 'bg-shu' : done?.(i) ? 'bg-line' : 'border border-line'}`}
        />
      ))}
    </ol>
  );
}

/** 朱の丸（正解の番号や花丸に使う） */
export function ShuCircle({ children, size = 'md' }: { children: ReactNode; size?: 'md' | 'lg' }) {
  const s = size === 'lg' ? 'size-24 text-[40px] border-[3px]' : 'size-8 text-[17px] border-2';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-shu font-bold text-shu ${s}`}
    >
      {children}
    </span>
  );
}

/** 朱ペンの花丸 */
export function Hanamaru({ size = 88 }: { size?: number }) {
  const petals = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return `${50 + Math.cos(a) * 38},${50 + Math.sin(a) * 38}`;
  });
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="花丸" className="shrink-0 text-shu">
      <g fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
        {petals.map((p) => {
          const [x, y] = p.split(',').map(Number) as [number, number];
          return <circle key={p} cx={x} cy={y} r="9.5" />;
        })}
        <path d="M50 50m-6 0a6 6 0 1 1 12 0a11 11 0 1 1-22 0a16 16 0 1 1 32 0a21 21 0 1 1-42 0" />
      </g>
    </svg>
  );
}

export function Notice({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'shu' }) {
  const t = tone === 'shu' ? 'border-shu/40 bg-shu-wash' : 'border-rule bg-sheet';
  return (
    <div className={`rounded-[var(--radius-paper)] border px-4 py-3 text-[15px] leading-relaxed ${t}`}>{children}</div>
  );
}
