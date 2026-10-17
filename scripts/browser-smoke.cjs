/** Optional browser QA. Use a temporary FlipCheck data directory. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1512, height: 1050 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(process.env.FLIPCHECK_URL || 'http://127.0.0.1:8765');
    await page.locator('#connection').filter({ hasText: /Local model/ }).waitFor();
    const demo = page.locator('#mode-banner [data-action="demo"]');
    if (await demo.count()) await demo.click();
    await page.locator('tbody tr').first().waitFor();
    assert.equal(await page.locator('tbody tr').count(), 8);
    let result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(result.violations.map(v => v.id), [], 'Dashboard accessibility violations');
    await page.locator('[data-filter="excluded"]').click();
    assert.equal(await page.locator('tbody tr').count(), 2);
    await page.locator('[data-filter="review"]').click();
    assert.equal(await page.locator('tbody tr').count(), 2);
    await page.locator('[data-filter="all"]').click();
    await page.locator('[data-detail]').first().click();
    await page.getByRole('dialog', { name: 'Listing evidence' }).waitFor();
    result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(result.violations.map(v => v.id), [], 'Evidence dialog accessibility violations');
    await page.getByRole('button', { name: 'Close evidence' }).click();
    await page.getByRole('button', { name: 'Sales library', exact: true }).click();
    assert.equal(await page.locator('tbody tr').count(), 14);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole('button', { name: 'Deal scout' }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('[data-detail]').first().click();
    await page.getByRole('button', { name: 'Correct', exact: true }).click();
    await page.getByRole('dialog', { name: 'Record what you confirmed' }).waitFor();
    result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(result.violations.map(v => v.id), [], 'Correction dialog accessibility violations');
    assert.deepEqual(errors, []);
    console.log('Browser smoke passed: demo, filters, evidence, sales, correction, accessibility, mobile overflow.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
