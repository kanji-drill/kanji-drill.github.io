// マスタと画面の文言に使う字だけを含むフォント（woff2）を作り、読み込み用の CSS を生成する。
// 日本語フォントは丸ごとだと 1 書体で数 MB あるため、オフライン用に保存する量を抑える
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import subsetFont from 'subset-font';
import { loadMaster, root } from './lib';

const fontsDir = join(root, 'node_modules/@expo-google-fonts');
const outDir = join(root, 'src/assets/fonts');
const cssPath = join(root, 'src/styles/fonts.generated.css');

function uiText(): string {
  let text = readFileSync(join(root, 'index.html'), 'utf8');
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name !== 'assets') walk(path);
      } else if (/\.(tsx?|css)$/.test(name) && !name.endsWith('.generated.css')) {
        text += readFileSync(path, 'utf8');
      }
    }
  };
  walk(join(root, 'src'));
  return text;
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i)).join('');
const ascii = range(0x20, 0x7e);
const kana = `${range(0x3041, 0x3096) + range(0x30a1, 0x30fa)}ー・、。「」（）！？：〜○✕①②③④⑤`;

const words = loadMaster().words;
const ui = uiText();
const sentences = words.map((w) => w.word + w.kana + w.sentence).join('');
// 答え合わせで出す語の意味と、常用漢字表にない字の注意（UI の書体で表示する）
const notes = words.map((w) => (w.meaning ?? '') + (w.nonJoyo ?? []).join('')).join('');

/** 書体ごとに必要な字 */
const FACES = [
  {
    family: 'BIZ UDMincho',
    weight: 400,
    file: 'biz-udmincho/400Regular/BIZUDMincho_400Regular.ttf',
    text: ascii + kana + ui + sentences,
  },
  {
    family: 'BIZ UDPGothic',
    weight: 400,
    file: 'biz-udpgothic/400Regular/BIZUDPGothic_400Regular.ttf',
    text: ascii + kana + ui + notes,
  },
  {
    family: 'BIZ UDPGothic',
    weight: 700,
    file: 'biz-udpgothic/700Bold/BIZUDPGothic_700Bold.ttf',
    text: ascii + kana + ui + notes,
  },
  {
    family: 'Klee One',
    weight: 600,
    file: 'klee-one/600SemiBold/KleeOne_600SemiBold.ttf',
    text: words.map((w) => w.word).join(''),
  },
];

const unique = (s: string) => [...new Set(s)].join('');

mkdirSync(outDir, { recursive: true });
const css = ['/* tools/subset-fonts.ts が生成。手で編集しない */'];
let totalBytes = 0;
for (const face of FACES) {
  const text = unique(face.text);
  const buf = await subsetFont(readFileSync(join(fontsDir, face.file)), text, { targetFormat: 'woff2' });
  const name = `${face.family.replace(/\s+/g, '-').toLowerCase()}-${face.weight}.woff2`;
  writeFileSync(join(outDir, name), buf);
  totalBytes += buf.length;
  const url = relative(join(root, 'src/styles'), join(outDir, name)).replace(/\\/g, '/');
  css.push(
    `@font-face{font-family:"${face.family}";font-style:normal;font-display:swap;font-weight:${face.weight};src:url(${url}) format("woff2");}`,
  );
  console.log(`${face.family} ${face.weight}: ${[...text].length} 字 → ${(buf.length / 1024).toFixed(0)} KB`);
}
writeFileSync(cssPath, `${css.join('\n')}\n`);
console.log(`合計 ${(totalBytes / 1024).toFixed(0)} KB`);
