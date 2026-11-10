import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const widths = [360, 430, 768, 1024, 1440];
const pages = ['index.html', 'catalog.html', 'product.html', 'order.html', 'contacts.html'];
const base = 'http://127.0.0.1:8765';
const server = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/index.html`)).ok) return;
    } catch (_) { /* ещё не стартовал */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Локальный HTTP-сервер не запустился');
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  await mkdir(path.join(root, 'tests', 'screenshots'), { recursive: true });
  const tab = await browser.newPage({ viewport: { width: 360, height: 900 } });
  const runtimeErrors = [];
  tab.on('pageerror', (error) => runtimeErrors.push(error.message));

  for (const width of widths) {
    await tab.setViewportSize({ width, height: 900 });
    for (const name of pages) {
      await tab.goto(`${base}/${name}`, { waitUntil: 'domcontentloaded' });
      await tab.locator('img').evaluateAll((imgs) => Promise.all(imgs.map((img) => {
        img.loading = 'eager'; // Проверяем также картинки, которые изначально были ниже экрана.
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
      })));

      const report = await tab.evaluate(() => {
        const documentWidth = document.documentElement.scrollWidth;
        const viewportWidth = document.documentElement.clientWidth;
        const broken = [...document.images].filter((img) => img.naturalWidth === 0).map((img) => img.src);
        const escaped = [...document.querySelectorAll('.product-card__media img, .product-visual img')]
          .filter((img) => {
            const box = img.parentElement.getBoundingClientRect();
            const rect = img.getBoundingClientRect();
            return rect.left < box.left - 1 || rect.right > box.right + 1 ||
              rect.top < box.top - 1 || rect.bottom > box.bottom + 1;
          }).map((img) => img.src);
        const cropped = [...document.querySelectorAll('.product-card__image, .product-visual img')]
          .filter((img) => getComputedStyle(img).objectFit !== 'contain').map((img) => img.src);
        return { documentWidth, viewportWidth, broken, escaped, cropped };
      });

      assert(report.documentWidth <= report.viewportWidth + 1,
        `${name} @ ${width}px: горизонтальная прокрутка (${report.documentWidth} > ${report.viewportWidth})`);
      assert(!report.broken.length, `${name} @ ${width}px: изображения не загрузились: ${report.broken}`);
      assert(!report.escaped.length && !report.cropped.length,
        `${name} @ ${width}px: фото вышло из рамки или обрезается`);

      if ([360, 768, 1440].includes(width) && ['index.html', 'catalog.html', 'product.html'].includes(name)) {
        await tab.screenshot({ path: path.join(root, 'tests', 'screenshots', `${name.replace('.html', '')}-${width}.png`), fullPage: true });
      }
      console.log(`PASS ${name} ${width}px`);
    }
  }

  // Проверка раскрытия мобильного меню, фильтрации, диалога и форм.
  await tab.setViewportSize({ width: 360, height: 900 });
  await tab.goto(`${base}/index.html`);
  await tab.locator('.site-nav__toggle').click();
  assert(await tab.locator('.site-nav__toggle').getAttribute('aria-expanded') === 'true', 'Меню не раскрылось');
  await tab.keyboard.press('Escape');
  assert(await tab.locator('.site-nav__toggle').getAttribute('aria-expanded') === 'false', 'Меню не закрылось по Escape');

  await tab.goto(`${base}/catalog.html`);
  await tab.locator('.catalog-filters summary').click();
  await tab.locator('input[value="popular"]').check();
  await tab.locator('.filters-form button[type="submit"]').click();
  assert(await tab.locator('.catalog-products .product-card:visible').count() === 3, 'Фильтр популярного не работает');
  await tab.locator('.filters-form button[type="reset"]').click();
  assert(await tab.locator('.catalog-products .product-card:visible').count() === 6, 'Сброс фильтра не работает');
  await tab.locator('.product-card__button').first().click();
  assert(await tab.locator('#order-dialog').evaluate((dialog) => dialog.open), 'Диалог не открылся');
  await tab.keyboard.press('Escape');
  assert(!await tab.locator('#order-dialog').evaluate((dialog) => dialog.open), 'Диалог не закрылся по Escape');

  await tab.goto(`${base}/order.html?product=Kuricha%20Maid`);
  assert(await tab.locator('#order-page-product').inputValue() === 'Kuricha Maid', 'Товар не подставился в заявку');
  await tab.locator('#order-page-name').fill('Дана');
  await tab.locator('#order-page-email').fill('test@example.com');
  await tab.locator('#order-page-phone').fill('+7 900 000-00-00');
  await tab.locator('#order-page-agreement').check();
  await tab.locator('#page-order-form button[type="submit"]').click();
  assert(await tab.locator('#order-page-success').isVisible(), 'Не появилось сообщение формы');
  assert(!runtimeErrors.length, `Ошибки JavaScript: ${runtimeErrors.join('; ')}`);
  console.log('PASS меню, фильтры, диалог, форма и 25 адаптивных состояний');
} finally {
  await browser?.close();
  server.kill();
}
