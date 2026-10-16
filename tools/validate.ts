// 語彙マスタの検査。エラーが 1 件でもあれば終了コード 1 で終わる
import { createRequire } from 'node:module';
import { buildIndex, splitOkurigana } from '../src/domain/master';
import { CHOICES, type Word } from '../src/domain/types';
import { isMain, loadMaster } from './lib';

const require = createRequire(import.meta.url);
const joyo = new Set<string>((require('joyo-kanji') as { kanji: string[] }).kanji);

export const SENTENCE_MAX = 14;
const KATAKANA = /^[ァ-ヶー]+$/;

export function sentenceText(sentence: string): string {
  return sentence.replace(/[{}]/g, '');
}

export function validate(words: readonly Word[]) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (w: Word, msg: string) => errors.push(`${w.id} ${w.word}: ${msg}`);

  const ids = new Set<string>();
  const surfaces = new Set<string>();
  for (const w of words) {
    if (!/^w\d{4,}$/.test(w.id)) err(w, `id の形式が違います（${w.id}）`);
    if (ids.has(w.id)) err(w, 'id が重複しています');
    ids.add(w.id);
    if (surfaces.has(w.word)) err(w, '同じ語がすでにあります');
    surfaces.add(w.word);

    const [kanji, okuri] = splitOkurigana(w.word);
    for (const ch of kanji) if (!joyo.has(ch)) err(w, `常用漢字表にない字「${ch}」が含まれています`);
    for (const a of w.alt ?? []) {
      if (a === w.word) err(w, `別表記「${a}」が語と同じです`);
      for (const ch of splitOkurigana(a)[0])
        if (!joyo.has(ch)) err(w, `別表記「${a}」に常用漢字表にない字「${ch}」があります`);
    }
    if (w.kun) {
      // 訓読みの語: 1 字の漢字＋送り仮名。例文では {カタカナ} の直後に送り仮名が続く
      if ([...kanji].length !== 1 || !/^[ぁ-ゖ]*$/.test(okuri))
        err(w, '訓読みの語は「漢字 1 字＋送り仮名」の形にしてください');
      if (w.keyKana !== w.kana) err(w, '訓読みの語は keyKana と kana を同じにしてください');
      if (w.kana === w.reading) err(w, '訓読みの語の kana が音読み（reading）と同じです');
      // 例文では活用していてよい（透かす → 透かして）ので、送り仮名の語尾 1 字は比べない
      const after = w.sentence.split('}')[1] ?? '';
      const stem = okuri.slice(0, -1);
      if (!after.startsWith(stem)) err(w, `例文で {${w.kana}} の直後が送り仮名「${okuri}」の形になっていません`);
    } else if (okuri !== '') {
      err(w, '音読みの語に送り仮名があります（訓読みの語なら kun: true にしてください）');
    }
    if (!KATAKANA.test(w.kana)) err(w, `kana がカタカナではありません（${w.kana}）`);
    if (!KATAKANA.test(w.reading)) err(w, `reading がカタカナではありません（${w.reading}）`);
    if (!KATAKANA.test(w.keyKana)) err(w, `keyKana がカタカナではありません（${w.keyKana}）`);
    if ([...w.word][w.keyIndex] !== w.key) err(w, `keyIndex ${w.keyIndex} の字が key「${w.key}」ではありません`);
    if (!w.kana.includes(w.keyKana)) err(w, `kana に keyKana「${w.keyKana}」が含まれません`);

    const blanks = [...w.sentence.matchAll(/\{([^}]*)\}/g)];
    if (blanks.length !== 1) err(w, '例文の {…} はちょうど 1 か所にしてください');
    else if (blanks[0]?.[1] !== w.kana) err(w, `例文の {…} が kana と一致しません（${blanks[0]?.[1]}）`);
    const len = [...sentenceText(w.sentence)].length;
    if (len > SENTENCE_MAX) err(w, `例文が ${len} 字です（${SENTENCE_MAX} 字以内）`);
  }

  // 同音グループの条件
  const byReading = new Map<string, Word[]>();
  for (const w of words) byReading.set(w.reading, [...(byReading.get(w.reading) ?? []), w]);
  for (const [reading, ws] of byReading) {
    const byKey = new Map<string, Word[]>();
    for (const w of ws) byKey.set(w.key, [...(byKey.get(w.key) ?? []), w]);
    for (const [key, kws] of byKey) {
      if (kws.length < 2)
        errors.push(
          `音「${reading}」の漢字「${key}」は 1 語しかありません（2 語以上必要。復習問題を組めなくなります）`,
        );
    }
    // 1 問は「同じ漢字の 2 語」と「別の漢字 4 語」を使うので、1 漢字 2 語・漢字 3 の倍数種だと周回でちょうど使い切れる
    const evenPairs = [...byKey.values()].every((kws) => kws.length === 2);
    if (!evenPairs || byKey.size % 3 !== 0) {
      warnings.push(
        `音「${reading}」は漢字 ${byKey.size} 種・語数 ${[...byKey.values()].map((k) => k.length).join(',')}。1 漢字 2 語・漢字 6 種か 9 種にすると、周回の終わりに使用済みの語で埋める問題が減ります`,
      );
    }
    if (ws.length < CHOICES + 1 || byKey.size < CHOICES) {
      warnings.push(
        `音「${reading}」は ${ws.length} 語・漢字 ${byKey.size} 種で条件（${CHOICES + 1} 語以上・漢字 ${CHOICES} 種以上）に足りないため、出題されません`,
      );
    }
  }

  const index = buildIndex(words);
  return {
    errors,
    warnings,
    stats: {
      words: words.length,
      verified: words.filter((w) => w.verified).length,
      groups: index.groups.size,
      usable: index.usableIds.length,
    },
  };
}

if (isMain(import.meta.url)) {
  const master = loadMaster();
  const { errors, warnings, stats } = validate(master.words);
  for (const w of warnings) console.warn(`警告: ${w}`);
  for (const e of errors) console.error(`エラー: ${e}`);
  console.log(
    `マスタ ${master.version}: ${stats.words} 語（確認済み ${stats.verified}）、出題に使えるグループ ${stats.groups}、語 ${stats.usable}`,
  );
  if (errors.length > 0) {
    console.error(`エラー ${errors.length} 件`);
    process.exit(1);
  }
  console.log('エラー 0 件');
}
