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
  await expect(page.getByText('復習　1 / 1')).toBeVisible();
  await expectQuestionFits(page);
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
