import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { initialProgress, type Progress } from '../domain/scheduler';
import type { Session } from '../domain/session';

export type Settings = {
  writing: 'vertical' | 'horizontal';
  size: 'normal' | 'large';
  setSize: 3 | 5;
  /** 初回の案内を閉じたか */
  onboardingDone: boolean;
  /** 「ホーム画面に追加」の案内を閉じたか */
  installHintDone: boolean;
};

export const defaultSettings: Settings = {
  writing: 'vertical',
  size: 'normal',
  setSize: 5,
  onboardingDone: false,
  installHintDone: false,
};

const storage = createJSONStorage(() => localStorage);

/** 保存の形を変えたら version を上げ、migrate に移し替えを書く */
export const useSettings = create<Settings>()(
  persist(() => ({ ...defaultSettings }), {
    name: 'kanjiDrill.settings',
    version: 1,
    storage,
    migrate: (state) => ({ ...defaultSettings, ...(state as Partial<Settings>) }),
  }),
);

export const useProgress = create<{ progress: Progress }>()(
  persist(() => ({ progress: initialProgress() }), {
    name: 'kanjiDrill.progress',
    version: 1,
    storage,
    migrate: (state) => state as { progress: Progress },
  }),
);

export const useSession = create<{ session: Session | null }>()(
  persist(() => ({ session: null as Session | null }), {
    name: 'kanjiDrill.session',
    version: 1,
    storage,
    migrate: (state) => state as { session: Session | null },
  }),
);
