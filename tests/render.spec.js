const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const INDEX_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const FIXTURES = path.join(__dirname, 'fixtures');

// 履歴に表示される日時を固定するため
const FIXED_TIME = new Date('2026-01-01T09:00:00+09:00');

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

// index.html の script の URL と一致しないと route が効かず CDN へ取りに行くため、URL と devDependencies の mermaid は index.html とバージョンを揃える。
const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js';
const MERMAID_FILE = require.resolve('mermaid/dist/mermaid.min.js');

async function openApp(page) {
  // ネットワークなしのコンテナでも実行できるようにするため、CDN へは行かずローカルのファイルを返す
  await page.route(MERMAID_URL, route => route.fulfill({ path: MERMAID_FILE }));
  await page.clock.setFixedTime(FIXED_TIME);
  await page.goto(INDEX_URL);
  // トーストは 2.2 秒後に自動で消えるため、消えるのを待つとスクリーンショットが実行時間に左右される
  await page.addStyleTag({ content: '.toast { display: none !important; }' });
}

async function openFixture(page, name, { mermaid = false } = {}) {
  await openApp(page);
  await page.setInputFiles('#fileInput', path.join(FIXTURES, name));
  await expect(page.locator('.file-bar-name')).toHaveText(name);
  if (mermaid) await expect(page.locator('.mermaid svg').first()).toBeVisible();
}

// #content と CSV の内側スクロール領域 (.csv-scroll) は、はみ出した分がスクリーンショットに写らない。
// .csv-scroll の max-height は 100vh 基準なので、ビューポートを広げながら収まるまで繰り返す
async function fitViewportToContent(page) {
  const { width } = page.viewportSize();
  for (let i = 0; i < 5; i++) {
    const overflow = await page.evaluate(() => {
      const content = document.getElementById('content');
      const inner = [...content.querySelectorAll('.csv-scroll')]
        .reduce((max, el) => Math.max(max, el.scrollHeight - el.clientHeight), 0);
      return Math.ceil((content.scrollHeight - content.clientHeight) + inner);
    });
    if (overflow <= 0) return;
    await page.setViewportSize({ width, height: page.viewportSize().height + overflow });
  }
  throw new Error('ビューポートを広げても収まらなかった');
}

async function screenshotContent(page, name) {
  await fitViewportToContent(page);
  await expect(page.locator('#content')).toHaveScreenshot(name);
}

/* ── DOM スナップショット: フォント・OS に依存しない ── */

test.describe('@dom 出力HTML', () => {
  test('parseMarkdown', async ({ page }) => {
    await openApp(page);
    const html = await page.evaluate(src => parseMarkdown(src), readFixture('sample.md'));
    expect(html).toMatchSnapshot('sample.md.html');
  });

  test('renderCSV', async ({ page }) => {
    await openApp(page);
    const html = await page.evaluate(
      ([src, name]) => renderCSV(parseCSV(src), name),
      [readFixture('sample.csv'), 'sample.csv']
    );
    expect(html).toMatchSnapshot('sample.csv.html');
  });
});

/* ── ビジュアル回帰: ベースラインは必ず npm run test:update（Docker）で生成する ── */

test.describe('@visual 描画', () => {
  test('Markdown', async ({ page }) => {
    await openFixture(page, 'sample.md', { mermaid: true });
    await screenshotContent(page, 'sample.md.png');
  });

  test('Markdown（ワイド表示）', async ({ page }) => {
    await openFixture(page, 'sample.md', { mermaid: true });
    await page.evaluate(() => toggleWidth());
    await screenshotContent(page, 'sample.md-wide.png');
  });

  test('CSV', async ({ page }) => {
    await openFixture(page, 'sample.csv');
    await screenshotContent(page, 'sample.csv.png');
  });

  test('CSV（ワイド表示）', async ({ page }) => {
    await openFixture(page, 'sample.csv');
    await page.evaluate(() => toggleWidth());
    await screenshotContent(page, 'sample.csv-wide.png');
  });

  test('CSV（インクリメンタル検索）', async ({ page }) => {
    await openFixture(page, 'sample.csv');
    await page.fill('#csvSearch', '入り');
    await screenshotContent(page, 'sample.csv-filtered.png');
  });
});

test.describe('@visual レイアウト', () => {
  test('ヘッダー・サイドバー・フッター', async ({ page }) => {
    await openFixture(page, 'sample.md');
    await expect(page).toHaveScreenshot('app-layout.png');
  });
});
