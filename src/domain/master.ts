import { CHOICES, type Word } from './types';

export type Group = {
  reading: string;
  words: Word[];
  /** key（漢字）ごとの語 */
  byKey: Map<string, Word[]>;
};

export type MasterIndex = {
  byId: Map<string, Word>;
  /** 出題に使える同音グループだけを持つ */
  groups: Map<string, Group>;
  /** 出題に使える語の id（どのグループにも属さない語は含まない） */
  usableIds: string[];
};

/** 設問や正解の選択肢（同じ漢字の 2 語の組）に使えるか。選択肢専用の語は使えない */
export function canPair(w: Word): boolean {
  return !w.distractorOnly;
}

/**
 * 同音グループが出題に使えるか。
 * 正解の組（同じ漢字の 2 語）を作れる漢字が 1 つ以上あり、
 * 誤りの選択肢に回せる別の漢字が CHOICES - 1 種以上あること。
 */
export function isGroupUsable(byKey: Map<string, Word[]>): boolean {
  const pairable = [...byKey.values()].some((ws) => ws.filter(canPair).length >= 2);
  return pairable && byKey.size >= CHOICES;
}

export function buildIndex(words: readonly Word[]): MasterIndex {
  const byId = new Map<string, Word>();
  const byReading = new Map<string, Word[]>();
  for (const w of words) {
    byId.set(w.id, w);
    const list = byReading.get(w.reading) ?? [];
    list.push(w);
    byReading.set(w.reading, list);
  }

  const groups = new Map<string, Group>();
  const usableIds: string[] = [];
  for (const [reading, ws] of byReading) {
    const byKey = new Map<string, Word[]>();
    for (const w of ws) {
      const list = byKey.get(w.key) ?? [];
      list.push(w);
      byKey.set(w.key, list);
    }
    if (!isGroupUsable(byKey)) continue;
    groups.set(reading, { reading, words: ws, byKey });
    for (const w of ws) usableIds.push(w.id);
  }
  return { byId, groups, usableIds };
}

/** 2 つの語が 1 字でも同じ字を含むか */
const HAN = /\p{Script=Han}/u;

export function isKanji(ch: string): boolean {
  return HAN.test(ch);
}

/** 2 つの語が 1 字でも同じ漢字を含むか（送り仮名のひらがなは比べない） */
export function sharesChar(a: string, b: string): boolean {
  for (const ch of a) if (isKanji(ch) && b.includes(ch)) return true;
  return false;
}

/** 語を漢字の部分と送り仮名に分ける（例: 競う → [競, う]、沸騰 → [沸騰, '']） */
export function splitOkurigana(word: string): [string, string] {
  const chars = [...word];
  let i = 0;
  while (i < chars.length && isKanji(chars[i] as string)) i++;
  return [chars.slice(0, i).join(''), chars.slice(i).join('')];
}
