// 語彙マスタの確認用一覧（音ごと）を review.html に書き出す。
// ユーザーはこれを読んで誤りを指摘し、修正は Claude が words.json に反映する
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitOkurigana } from '../src/domain/master';
import type { Word } from '../src/domain/types';
import { loadMaster, root } from './lib';
import { sentenceText, validate } from './validate';

const master = loadMaster();
const { errors, warnings, stats } = validate(master.words);
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

const byReading = new Map<string, Word[]>();
for (const w of master.words) byReading.set(w.reading, [...(byReading.get(w.reading) ?? []), w]);

// --since w0474 のように指定すると、その番号以降の語（新しく入れた語）を先頭にまとめて出す
const sinceArg = process.argv.indexOf('--since');
const since = sinceArg > 0 ? Number(process.argv[sinceArg + 1]?.replace(/^w/, '')) : null;
const isNew = (w: Word) => since !== null && Number(w.id.slice(1)) >= since;

const THEAD =
  '<thead><tr><th>番号</th><th>音</th><th>字</th><th>語</th><th>読み</th><th>例文（下は漢字にした文）</th><th>出典</th><th>状態</th></tr></thead>';

function row(w: Word): string {
  const [kanji] = splitOkurigana(w.word);
  const filled = esc(sentenceText(w.sentence)).replace(esc(w.kana), `<b>${esc(kanji)}</b>`);
  const cls = [w.verified ? 'ok' : '', isNew(w) ? 'new' : ''].join(' ').trim();
  return `<tr class="${cls}"><td>${w.id}</td><td>${esc(w.reading)}</td><td class="key">${esc(w.key)}</td><td class="word">${esc(w.word)}${w.kun ? '<small>（訓）</small>' : ''}${w.alt?.length ? `<small>（${esc(w.alt.join('・'))} も可）</small>` : ''}</td><td>${esc(w.kana)}</td><td>${esc(sentenceText(w.sentence))}<br><small>${filled}</small></td><td>${w.source ? esc(w.source) : ''}</td><td>${w.verified ? '確認済み' : ''}</td></tr>`;
}

const fresh = master.words.filter(isNew);
const freshSection =
  fresh.length > 0
    ? `<section id="new"><h2>今回新しく入れた語 <small>${fresh.length} 語（${fresh[0] ? `w${String(since).padStart(4, '0')}` : ''} 以降）。下の音ごとの表では色付きで表示</small></h2>
<table>${THEAD}<tbody>
${fresh.map(row).join('\n')}
</tbody></table></section>`
    : '';

const sections = [...byReading]
  .map(
    ([
      reading,
      words,
    ]) => `<section><h2>${esc(reading)} <small>${words.length} 語・漢字 ${new Set(words.map((w) => w.key)).size} 種</small></h2>
<table>${THEAD}<tbody>
${words.map(row).join('\n')}
</tbody></table></section>`,
  )
  .join('\n');

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>語彙マスタ確認用一覧</title>
<style>
body{font-family:"BIZ UDPGothic","Hiragino Sans","Yu Gothic",sans-serif;background:#f6f1e7;color:#1e1c19;margin:0;padding:16px;line-height:1.6}
h1{font-size:20px}h2{font-size:18px;margin:24px 0 8px}h2 small{font-size:13px;color:#615b51;font-weight:normal}
table{border-collapse:collapse;width:100%;background:#fffdf8;font-size:14px}
th,td{border:1px solid #dcd3c3;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#efe8da}td.key{font-size:20px;text-align:center}td.word{font-size:20px;font-family:"BIZ UDMincho",serif;white-space:nowrap}
tr.ok{background:#f3f7ef}tr.new{background:#fbf3df}td small{color:#615b51}td b{color:#b8361f}
.note{background:#fffdf8;border:1px solid #dcd3c3;padding:12px 16px;border-radius:6px}
.err{color:#b8361f}
</style></head><body>
<h1>語彙マスタ確認用一覧 <small>${esc(master.version)}</small></h1>
<div class="note">
<p>全 ${stats.words} 語（確認済み ${stats.verified} 語）・出題に使える同音グループ ${stats.groups}。</p>
<p>誤りに気づいたら「番号」と直し方を Claude に伝えてください（例：w0012 の例文が不自然）。問題がなければ「○○（音）のグループは確認済み」と伝えてください。</p>
<p>確認の観点：①語と読みが正しいか ②例文の文脈で、その漢字の語に決まるか（同音の別の語と取り違えないか） ③常用漢字の字体か</p>
${errors.map((e) => `<p class="err">エラー：${esc(e)}</p>`).join('')}
${warnings.map((e) => `<p class="err">警告：${esc(e)}</p>`).join('')}
</div>
${freshSection}
${sections}
</body></html>`;

const out = join(root, 'review.html');
writeFileSync(out, html);
console.log(`review.html を書き出しました（${stats.words} 語）`);
