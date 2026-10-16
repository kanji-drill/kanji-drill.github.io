import { buildIndex } from '../domain/master';
import type { Master, Word } from '../domain/types';
import data from './words.json';

const master = data as Master;

/** 確認前の語も出題するか（開発中と、試作運用のビルドだけ） */
export const INCLUDE_UNVERIFIED = import.meta.env.DEV || import.meta.env.VITE_INCLUDE_UNVERIFIED === '1';

const words: Word[] = master.words.filter((w) => INCLUDE_UNVERIFIED || w.verified);

export const masterVersion = master.version;
export const index = buildIndex(words);
export const usableIdSet: ReadonlySet<string> = new Set(index.usableIds);
export const hasUnverified = words.some((w) => !w.verified);

export function wordOf(id: string): Word {
  const w = index.byId.get(id);
  if (!w) throw new Error(`語 ${id} がマスタにありません`);
  return w;
}
