# 漢字ドリル（共通テスト型）

大学受験生向けの漢字練習 PWA。共通テスト型の「同音異字の選択式」（5 択）で出題し、一度出た語はマスタを一巡するまで出しません。書けなかった語だけを、翌日 → 3 日後 → 7 日後に復習に出します。

- 計画：[docs/計画書.md](docs/計画書.md)
- 運用：[docs/運用手順書.md](docs/運用手順書.md)

## 構成
- `src/domain/` 出題（`generator.ts`）、復習と周回（`scheduler.ts`）、採点（`session.ts`）。UI に依存しない
- `src/data/words.json` 語彙マスタ
- `src/store/` 端末への保存（Zustand + localStorage）、書き出し・読み込み
- `src/screens/` ホーム・問題・答え合わせ・結果・設定・このアプリについて
- `tools/` マスタの検査・周回の模擬・フォントのサブセット化・確認用一覧・アイコン生成

## 使い方
```bash
npm install
npm run dev
```
テストは `npm test`（単体）と `npm run e2e`（E2E）。
