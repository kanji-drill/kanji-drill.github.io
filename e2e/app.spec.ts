import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const DAY1 = new Date('2026-10-16T10:00:00+09:00');
const DAY2 = new Date('2026-10-17T10:00:00+09:00');

type StoredSession = { questions: { correct: number }[] };

async function session(page: Page): Promise<StoredSession> {
  const raw = await page.evaluate(() => localStorage.getItem('kanjiDrill.session'));
  return (JSON.parse(raw ?? '{}') as { state: { session: StoredSession } }).state.session;
}

async function startNew(page: Page) {
  await page.getByRole('button', { name: '新しい問題を解く' }).click();
  await expect(page.getByTestId('question-card')).toBeVisible();
}

/** 1 問がスクロールなしで画面に収まり、操作帯に隠れていないこと */
async function expectQuestionFits(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const fits = await page.evaluate(() => {
    const card = document.querySelector('[data-testid=question-card]') as HTMLElement;
    const bar = document.querySelector('.sticky.bottom-0') as HTMLElement;
    const overflow = [...card.querySelectorAll('p')].some(
      (p) => p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1,
    );
    return {
      noScroll: document.documentElement.scrollHeight <= window.innerHeight + 1,
      aboveBar: card.getBoundingClientRect().bottom <= bar.getBoundingClientRect().top + 1,
      cardInside: card.getBoundingClientRect().right <= window.innerWidth && card.getBoundingClientRect().left >= 0,
      overflow,
    };
  });
  expect(fits).toEqual({ noScroll: true, aboveBar: true, cardInside: true, overflow: false });
}

async function solveAll(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await page.getByRole('button', { name: i === count - 1 ? '答え合わせへ' : '次へ' }).click();
  }
}

const rows = (page: Page) => page.locator('section[aria-label="見本と自己採点"] li button');

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: DAY1 });
  await page.goto('/');
});

test('試作運用のビルドでは「試作版」と表示する', async ({ page }) => {
  await expect(page.getByText(/^試作版：/)).toBeVisible();
});

test('新しい問題 → 答え合わせ → 結果 → 翌日の復習', async ({ page }) => {
  await startNew(page);
  await expectQuestionFits(page);
  const { questions } = await session(page);
  await solveAll(page, questions.length);

  // 1 問目: 正しい番号を選び、2 語に✕
  await page.getByRole('button', { name: `${(questions[0]?.correct ?? 0) + 1}番` }).click();
  await rows(page).nth(1).click();
  await rows(page).nth(2).click();
  await expect(rows(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
  for (let i = 1; i < questions.length; i++) {
    await page.getByRole('button', { name: '次の問題' }).click();
    await page.getByRole('button', { name: `${(questions[i]?.correct ?? 0) + 1}番` }).click();
  }
  await page.getByRole('button', { name: '採点を終える' }).click();
  await expect(page.getByText('28')).toBeVisible();
  await expect(page.getByRole('heading', { name: '復習に入った語（2）' })).toBeVisible();

  // 結果画面から採点を直す
  await page.getByRole('button', { name: '答え合わせに戻って採点を直す' }).click();
  await page.getByRole('button', { name: '前へ' }).click();
  await page.getByRole('button', { name: '前へ' }).click();
  await page.getByRole('button', { name: '前へ' }).click();
  await page.getByRole('button', { name: '前へ' }).click();
  await rows(page).nth(2).click();
  for (let i = 1; i < questions.length; i++) await page.getByRole('button', { name: '次の問題' }).click();
  await page.getByRole('button', { name: '採点を終える' }).click();
  await expect(page.getByRole('heading', { name: '復習に入った語（1）' })).toBeVisible();
  await page.getByRole('button', { name: 'ホームへ' }).click();

  await expect(page.getByRole('button', { name: '復習する' })).toBeDisabled();
  await expect(page.getByText('次の復習は 10月17日')).toBeVisible();

  // 翌日
  await page.clock.setSystemTime(DAY2);
  await page.reload();
  const review = page.getByRole('button', { name: /復習する/ });
  await expect(review).toBeEnabled();
  await review.click();
  // 復習（D29）: 書けなかった語だけを例文つきで出す。番号は選ばない
  await expect(page.getByText('復習　1 語')).toBeVisible();
  await expect(page.getByTestId('review-sheet').locator('li')).toHaveCount(1);
  await page.getByRole('button', { name: '答え合わせへ' }).click();
  await expect(page.getByText('あなたが選んだ番号は？')).toHaveCount(0);
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole('button', { name: '採点を終える' }).click();
  await expect(page.getByText('復習の結果')).toBeVisible();
  await expect(page.getByText('選択の正解')).toHaveCount(0);
  await expect(page.getByText('全部書けました！')).toBeVisible();
});

/** 期日を迎えた復習の語を n 語入れた記録を保存して開き直す */
async function seedReview(page: Page, n: number) {
  const ids = (
    JSON.parse(readFileSync('src/data/words.json', 'utf8')) as { words: { id: string; verified: boolean }[] }
  ).words
    .filter((w) => w.verified)
    .slice(0, n)
    .map((w) => w.id);
  await page.evaluate((ids) => {
    const words = Object.fromEntries(
      ids.map((id) => [id, { right: 0, wrong: 1, review: { stage: 0, due: '2026-10-16' } }]),
    );
    const progress = {
      cycle: 1,
      cycleStartSeq: 0,
      nextSeq: 0,
      words,
      lastDay: '2026-10-16',
      daily: { day: '2026-10-16', newSets: 0, reviewWords: 0 },
      lastExportAt: '2026-10-16T00:00:00.000Z',
    };
    localStorage.setItem('kanjiDrill.progress', JSON.stringify({ state: { progress }, version: 1 }));
  }, ids);
  await page.reload();
  return ids;
}

async function expectNoSeriousA11y(page: Page, where: string) {
  const result = await new AxeBuilder({ page }).analyze();
  const serious = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${where}: ${v.id} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

test('復習は 1 セット 10 語を 1 画面に並べ、一覧で採点する', async ({ page }) => {
  await seedReview(page, 12);
  await expect(page.getByText('今日の復習 12 語')).toBeVisible();
  await page.getByRole('button', { name: /復習する/ }).click();
  await expect(page.getByText('復習　10 語')).toBeVisible();
  await expect(page.getByTestId('review-sheet').locator('li')).toHaveCount(10);
  await page.evaluate(() => document.fonts.ready);
  // 横にはみ出さない（縦に長いときはスクロールしてよい）
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectNoSeriousA11y(page, '復習');

  await page.getByRole('button', { name: '答え合わせへ' }).click();
  await expect(rows(page)).toHaveCount(10);
  await expectNoSeriousA11y(page, '復習の答え合わせ');
  await rows(page).nth(0).click();
  await rows(page).nth(9).click();
  await expect(rows(page).nth(9)).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '採点を終える' }).click();
  await expect(page.getByRole('heading', { name: '復習に入った語（2）' })).toBeVisible();
  // 残りの 2 語で、もう 1 セット
  await page.getByRole('button', { name: 'もう 1 セット' }).click();
  await expect(page.getByText('復習　2 語')).toBeVisible();
});

test('5 択の形で作った途中の復習のセットは捨てる', async ({ page }) => {
  const ids = await seedReview(page, 6);
  await page.evaluate((ids) => {
    const [target, ...options] = ids;
    const session = {
      kind: 'review',
      seed: 1,
      day: '2026-10-16',
      questions: [{ reading: 'X', key: 'X', target, options, correct: 0 }],
      phase: 'solve',
      index: 0,
      picks: [null],
      marks: [ids.map(() => false)],
    };
    localStorage.setItem('kanjiDrill.session', JSON.stringify({ state: { session }, version: 1 }));
  }, ids);
  await page.reload();
  await expect(page.getByRole('button', { name: /復習する/ })).toBeEnabled();
  await expect(page.getByRole('region', { name: '途中のセット' })).toHaveCount(0);
});

test('選び間違えても見出し語は○に直せる・答え合わせ中に問題を見直せる', async ({ page }) => {
  await startNew(page);
  const { questions } = await session(page);
  await solveAll(page, questions.length);

  // 誤った番号を選ぶ: 見出し語は✕から始まり、○に直せる。選んだ選択肢は✕のまま
  const wrong = ((questions[0]?.correct ?? 0) + 1) % 5;
  await page.getByRole('button', { name: `${wrong + 1}番` }).click();
  await expect(rows(page).nth(0)).toHaveAttribute('aria-pressed', 'true');
  await rows(page).nth(0).click();
  await expect(rows(page).nth(0)).toHaveAttribute('aria-pressed', 'false');
  await expect(rows(page).nth(wrong + 1)).toBeDisabled();
  await expect(rows(page).nth(wrong + 1)).toHaveAttribute('aria-pressed', 'true');

  // 問題と答えを切り替える
  await page.getByRole('button', { name: '問題', exact: true }).click();
  await expect(page.getByTestId('question-card')).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await page.getByRole('button', { name: '答え', exact: true }).click();
  await expect(rows(page)).toHaveCount(6);

  // 上の点で別の問へ移る
  await page.getByRole('button', { name: '（ウ）へ' }).click();
  await expect(page.getByText('答え合わせ　3 / 5')).toBeVisible();
  await page.getByRole('button', { name: '（ア）へ' }).click();
  await expect(rows(page).nth(0)).toHaveAttribute('aria-pressed', 'false');
});

test('途中で中断しても続きから解ける', async ({ page }) => {
  await startNew(page);
  await page.getByRole('button', { name: '次へ' }).click();
  await page.getByRole('button', { name: '中断してホームへ' }).click();
  await expect(page.getByText('2 / 5 問目')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '続きから' }).click();
  await expect(page.getByText('新しい問題　2 / 5')).toBeVisible();
});

for (const [writing, size] of [
  ['横書き', '標準'],
  ['縦書き（本番と同じ）', '大'],
] as const) {
  test(`${writing}・文字${size}でも 1 問が画面に収まる`, async ({ page }) => {
    await page.getByRole('button', { name: '設定とデータ' }).click();
    await page.getByRole('button', { name: writing }).click();
    await page.getByRole('button', { name: size, exact: true }).click();
    await page.getByRole('button', { name: 'ホームへ戻る' }).click();
    await startNew(page);
    for (let i = 0; i < 5; i++) {
      await expectQuestionFits(page);
      if (i < 4) await page.getByRole('button', { name: '次へ' }).click();
    }
  });
}

test('書き出し → 消去 → 読み込みで記録が戻る', async ({ page }) => {
  await startNew(page);
  const { questions } = await session(page);
  await solveAll(page, questions.length);
  for (let i = 0; i < questions.length; i++) {
    await page.getByRole('button', { name: '1番' }).click();
    await page.getByRole('button', { name: i === questions.length - 1 ? '採点を終える' : '次の問題' }).click();
  }
  await page.getByRole('button', { name: 'ホームへ' }).click();
  const mastered = await page.getByLabel('覚えた語').textContent();

  await page.getByRole('button', { name: '設定とデータ' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '記録を書き出す' }).click();
  const file = await (await download).path();
  const json = readFileSync(file, 'utf8');
  expect(JSON.parse(json)).toMatchObject({ app: 'kanji-drill', schemaVersion: 1 });

  await page.getByLabel('確認のため「消去」と入力').fill('消去');
  await page.getByRole('button', { name: '記録を消去する' }).click();
  await page.getByRole('button', { name: 'ホームへ戻る' }).click();
  await expect(page.getByLabel('覚えた語')).toContainText('0');

  await page.getByRole('button', { name: '設定とデータ' }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await page.getByRole('button', { name: '上書きする' }).click();
  await expect(page.getByText('記録を読み込みました。')).toBeVisible();
  await page.getByRole('button', { name: 'ホームへ戻る' }).click();
  await expect(page.getByLabel('覚えた語')).toHaveText(mastered ?? '');
});

test('壊れたファイルは読み込まない', async ({ page }) => {
  await page.getByRole('button', { name: '設定とデータ' }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  await page.getByRole('button', { name: '上書きする' }).click();
  await expect(page.getByText('このアプリで書き出したファイルではないか')).toBeVisible();
});

test('オフラインでも開ける', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: '新しい問題を解く' })).toBeVisible();
  await startNew(page);
  await context.setOffline(false);
});

test('アクセシビリティの重大な違反がない', async ({ page }) => {
  const check = async (where: string) => {
    const result = await new AxeBuilder({ page }).analyze();
    const serious = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${where}: ${v.id} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
  };
  await check('ホーム');
  await startNew(page);
  await check('問題');
  await solveAll(page, 5);
  await check('番号選択');
  await page.getByRole('button', { name: '1番' }).click();
  await check('答え合わせ');
  await page.getByRole('button', { name: '中断してホームへ' }).click();
  await page.getByRole('button', { name: '設定とデータ' }).click();
  await check('設定');
});
