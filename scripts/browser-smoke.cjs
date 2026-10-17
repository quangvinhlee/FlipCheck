/** End-to-end Next.js QA. Run against a disposable data directory. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const base = process.env.FLIPCHECK_URL || 'http://127.0.0.1:3030';

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1512, height: 1050 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    async function accessible(label) {
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(result.violations.map(v => ({ id: v.id, nodes: v.nodes.slice(0, 3).map(n => n.html) })), [], `${label} accessibility violations`);
    }
    async function nav(name) {
      if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.locator('nav').getByRole('button', { name, exact: false }).click();
    }
    await page.goto(base);
    await page.getByRole('heading', { name: 'Your deal feed' }).waitFor();
    const initial = await (await context.request.get(`${base}/api/state`)).json();
    await context.request.post(`${base}/api/demo`, { data: {}, headers: { 'X-FlipCheck-Token': initial.csrf_token } });
    await page.reload();
    await page.locator('tbody tr').first().waitFor();
    assert.equal(await page.locator('tbody tr').count(), 8);
    await accessible('Dashboard');
    await page.getByRole('button', { name: 'Excluded', exact: true }).click();
    assert.equal(await page.locator('tbody tr').count(), 2);
    await page.getByRole('button', { name: 'Needs review', exact: true }).click();
    assert.equal(await page.locator('tbody tr').count(), 2);
    await page.getByRole('button', { name: 'All listings', exact: true }).click();
    await page.getByRole('button', { name: 'Card view', exact: true }).click();
    assert.equal(await page.locator('.deal-card').count(), 8);
    await accessible('Card layout');
    await page.getByRole('button', { name: 'Table view', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search listings' }).fill('BIOS locked');
    assert.equal(await page.locator('tbody tr').count(), 1);
    await page.getByRole('searchbox', { name: 'Search listings' }).fill('');
    const save = page.locator('.row-actions .save-action').first();
    if (await save.getAttribute('aria-pressed') === 'false') {
      await save.click();
      await page.waitForFunction(() => document.querySelector('.row-actions .save-action')?.getAttribute('aria-pressed') === 'true');
    }
    await nav('Saved listings');
    await page.getByRole('heading', { name: 'Saved listings' }).waitFor();
    assert.ok(await page.locator('tbody tr').count() >= 1);
    await nav('Deal scout');
    await page.getByRole('button', { name: /Inspect evidence for/ }).first().click();
    await page.getByRole('dialog', { name: 'Listing evidence' }).waitFor();
    await accessible('Evidence drawer');
    await page.getByRole('button', { name: 'Correct facts' }).click();
    await page.getByRole('dialog', { name: 'Record what you confirmed.' }).waitFor();
    await accessible('Correction form');
    await page.locator('[name="note"]').fill('QA: checked the synthetic fixture details with the source text.');
    await page.getByRole('button', { name: 'Save correction', exact: true }).click();
    await page.getByRole('dialog', { name: 'Listing evidence' }).waitFor();
    await page.getByText('Human correction:', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Close evidence', exact: true }).click();
    await page.getByRole('button', { name: 'Edit watchlist', exact: true }).click();
    await accessible('Settings');
    const previous = await page.locator('[name="min_margin"]').inputValue();
    await page.locator('[name="min_margin"]').fill('65');
    await page.getByRole('button', { name: 'Save & recalculate', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.ok((await page.locator('.watchlist-numbers').textContent()).includes('A$65'));
    await page.getByRole('button', { name: 'Edit watchlist', exact: true }).click();
    await page.locator('[name="min_margin"]').fill(previous);
    await page.getByRole('button', { name: 'Save & recalculate', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Import data', exact: true }).click();
    await accessible('Import form');
    await page.getByRole('textbox', { name: 'Or paste JSON / CSV' }).fill('{invalid json');
    await page.getByRole('button', { name: 'Import & analyse', exact: true }).click();
    await page.locator('.form-error[role="alert"]').waitFor();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await nav('Sales library');
    assert.equal(await page.locator('tbody tr').count(), 14);
    await accessible('Sales library');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await nav('Deal scout');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await accessible('Mobile dashboard');
    await page.getByRole('button', { name: 'Card view', exact: true }).click();
    assert.equal(await page.locator('.deal-card').count(), 8);
    await accessible('Mobile cards');
    // Verify the browser-facing proxy preserves the backend token/origin boundary.
    const state = await (await context.request.get(`${base}/api/state`)).json();
    assert.equal((await context.request.post(`${base}/api/mode`, { data: { mode: 'demo' } })).status(), 403);
    assert.equal((await context.request.post(`${base}/api/mode`, { data: { mode: 'demo' }, headers: { Origin: 'https://example.com', 'X-FlipCheck-Token': state.csrf_token } })).status(), 403);
    assert.equal((await context.request.get(`${base}/api/not-allowed`)).status(), 404);
    assert.equal((await context.request.post(`${base}/api/demo`, { data: { padding: 'x'.repeat(2_000_001) }, headers: { 'X-FlipCheck-Token': state.csrf_token } })).status(), 413);
    // Model-independent error recovery; no provider or database is stopped.
    await page.route('**/api/state', route => route.fulfill({ status: 503, json: { error: 'QA: local service unavailable' } }));
    await page.reload();
    await page.getByRole('alert').filter({ hasText: 'QA: local service unavailable' }).waitFor();
    await page.unroute('**/api/state');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('heading', { name: 'Your deal feed' }).waitFor();
    assert.equal(await page.locator('.error-banner').count(), 0);
    if (process.env.FLIPCHECK_TEST_INFERENCE === '1') {
      await page.getByRole('button', { name: 'Switch to my workspace', exact: true }).click();
      await page.getByRole('button', { name: 'Import data', exact: true }).click();
      const imported = { listings: [{ external_id: 'qa-local-model', title: 'Lenovo ThinkPad T14 Gen 2 Intel i5-1135G7 16GB RAM 512GB SSD', description: 'Good condition. Fully working, charger included. Synthetic QA input, not an actual marketplace listing.', asking_price: 240, inbound_shipping: 15, currency: 'AUD', country: 'AU', buying_format: 'fixed_price' }] };
      await page.getByRole('textbox', { name: 'Or paste JSON / CSV' }).fill(JSON.stringify(imported));
      await page.getByRole('button', { name: 'Import & analyse', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.querySelector('.job-main strong')?.textContent?.startsWith('Processed'), undefined, { timeout: 120000 });
      const result = await (await context.request.get(`${base}/api/state`)).json();
      assert.equal(result.job.status, 'completed');
      assert.equal(result.listings[0].extraction.engine, 'gemma4:e2b');
      assert.equal(result.listings[0].extraction.status, 'eligible');
      console.log('Actual Gemma 4 import completed through Next.js.');
    }
    assert.deepEqual(errors, []);
    console.log('Next.js browser checks passed: table/cards, search/filter/save, correction, settings, import validation, sales, mobile, accessibility, proxy protection, and recovery.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
