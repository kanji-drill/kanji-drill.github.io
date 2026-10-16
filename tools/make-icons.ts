// public/icon.svg から、ホーム画面用の PNG アイコンを作る（アイコンを変えたときだけ実行する）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { root } from './lib';

const font = readFileSync(
  join(root, 'node_modules/@expo-google-fonts/biz-udmincho/700Bold/BIZUDMincho_700Bold.ttf'),
).toString('base64');
const svg = readFileSync(join(root, 'public/icon.svg'), 'utf8');

const targets = [
  { file: 'icon-192.png', size: 192, inset: 0 },
  { file: 'icon-512.png', size: 512, inset: 0 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0 },
  // マスカブル: 端末が丸や角丸に切り抜いても欠けないよう、内側 80% に収める
  { file: 'icon-maskable-512.png', size: 512, inset: 0.1 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  const pad = Math.round(t.size * t.inset);
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<!doctype html><html><head><style>
    @font-face{font-family:'BIZ UDMincho';font-weight:700;src:url(data:font/ttf;base64,${font}) format('truetype');}
    html,body{margin:0;background:#F6F1E7;width:${t.size}px;height:${t.size}px}
    svg{display:block;width:${t.size - pad * 2}px;height:${t.size - pad * 2}px;margin:${pad}px}
  </style></head><body>${svg}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(root, 'public', t.file), omitBackground: false });
  console.log(`public/${t.file}`);
}
await browser.close();
