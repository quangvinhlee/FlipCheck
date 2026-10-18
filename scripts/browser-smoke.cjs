/** Multi-search UI regression. Use an isolated database, never the user's workspace. */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;
const base = process.env.FLIPCHECK_URL || "http://127.0.0.1:3030";
(async () => {
  if (process.env.FLIPCHECK_TEST_DISPOSABLE !== "1")
    throw Error(
      "Use a disposable database and set FLIPCHECK_TEST_DISPOSABLE=1 before running browser tests.",
    );
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1512, height: 1050 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    async function state() {
      return (await context.request.get(base + "/api/state")).json();
    }
    async function axe(label) {
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.slice(0, 3).map((n) => n.html),
        })),
        [],
        label,
      );
    }
    const initial = await state();
    for (const w of initial.watchlists)
      await context.request.post(base + "/api/watchlists/archive", {
        data: { id: w.id },
        headers: { "X-FlipCheck-Token": initial.csrf_token },
      });
    await page.goto(base);
    await page
      .getByRole("button", { name: "Add search", exact: true })
      .waitFor({ timeout: 5000 });
    assert.equal(await page.getByRole("button", { name: /demo/i }).count(), 0);
    await axe("initial dashboard");
    for (const [query, category, price] of [
      ["Legion", "laptop", "800"],
      ["MacBook", "laptop", "1200"],
      ["camera", "camera", "600"],
    ]) {
      await page
        .getByRole("button", { name: "Add search", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Add a product search" })
        .waitFor();
      await page.getByLabel("Search query", { exact: true }).fill(query);
      await page
        .getByLabel("Product category", { exact: true })
        .selectOption(category);
      await page
        .getByLabel("Maximum asking price (AUD)", { exact: true })
        .fill(price);
      await page
        .getByRole("button", { name: "Save search", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    }
    let s = await state();
    for (const q of ["Legion", "MacBook", "camera"])
      assert.ok(s.watchlists.some((w) => w.query === q));
    await page
      .getByRole("button", { name: "Edit MacBook", exact: true })
      .click();
    await page
      .getByLabel("Maximum asking price (AUD)", { exact: true })
      .fill("1100");
    await page
      .getByRole("button", { name: "Save search", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    s = await state();
    assert.equal(
      s.watchlists.find((w) => w.query === "MacBook").max_price,
      1100,
    );
    assert.equal(s.watchlists.find((w) => w.query === "Legion").max_price, 800);
    await page
      .getByRole("button", { name: "Edit camera", exact: true })
      .click();
    await axe("search form");
    await page.getByLabel("Include in Scan all").uncheck();
    await page
      .getByRole("button", { name: "Save search", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    s = await state();
    assert.equal(s.watchlists.find((w) => w.query === "camera").enabled, false);
    await page
      .getByRole("combobox", { name: "Filter by search" })
      .selectOption(String(s.watchlists.find((w) => w.query === "MacBook").id));
    await page
      .getByRole("button", { name: "Import data", exact: true })
      .click();
    await axe("import form");
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await axe("mobile");
    await page
      .getByRole("button", { name: "Edit camera", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Archive search", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    s = await state();
    assert.equal(
      s.watchlists.some((w) => w.query === "camera"),
      false,
    );
    for (const endpoint of ["demo", "mode"])
      assert.equal(
        (
          await context.request.post(base + "/api/" + endpoint, {
            data: {},
            headers: { "X-FlipCheck-Token": s.csrf_token },
          })
        ).status(),
        404,
      );
    assert.equal(
      (
        await context.request.post(base + "/api/watchlists/save", {
          data: { query: "bad" },
        })
      ).status(),
      403,
    );
    assert.equal(
      (
        await context.request.post(base + "/api/watchlists/save", {
          data: { query: "bad" },
          headers: {
            Origin: "https://example.com",
            "X-FlipCheck-Token": s.csrf_token,
          },
        })
      ).status(),
      403,
    );
    assert.equal(
      (
        await context.request.post(base + "/api/watchlists/save", {
          data: { p: "x".repeat(2000001) },
          headers: { "X-FlipCheck-Token": s.csrf_token },
        })
      ).status(),
      413,
    );
    // UI-only fixture: no invented listing is ever written to SQLite.
    const [a, b] = s.watchlists;
    const valuation = (w) => ({
      method: "unavailable",
      comparisons: [],
      count: 0,
      scenarios: {},
      opportunity: false,
      reason: "Test-only valuation",
      costs: w,
      valued_at: new Date().toISOString(),
      watchlist_id: w.id,
    });
    const fixture = {
      id: -1,
      external_id: "browser-test-only",
      marketplace: "ebay_au",
      title: "TEST ONLY: shared listing",
      description: "Browser-only regression fixture",
      asking_price: 300,
      inbound_shipping: 0,
      synthetic: false,
      url: null,
      extraction: {
        category: "laptop",
        classification: "complete_product",
        status: "needs_review",
        facts: {},
        evidence: {},
        unknown_fields: [],
        errors: [],
        reason: "Test only",
      },
      watchlist_ids: [a.id, b.id],
      display_watchlist_id: a.id,
      valuations: { [a.id]: valuation(a), [b.id]: valuation(b) },
      valuation: valuation(a),
      observations: [],
      decision: "new",
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString(),
    };
    await page.route("**/api/state", (r) =>
      r.fulfill({ json: { ...s, listings: [fixture] } }),
    );
    await page.setViewportSize({ width: 1512, height: 1050 });
    await page.reload();
    await page
      .getByRole("combobox", { name: "Filter by search" })
      .selectOption(String(b.id));
    await page
      .getByRole("button", { name: fixture.title, exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("combobox", { name: "Valuation and costs for search" })
        .inputValue(),
      String(b.id),
    );
    await axe("evidence for filtered search");
    await page
      .getByRole("button", { name: "Close evidence", exact: true })
      .click();
    await page.unroute("**/api/state");
    await page.route("**/api/state", (r) =>
      r.fulfill({ status: 503, json: { error: "QA service unavailable" } }),
    );
    await page.reload();
    await page.locator(".error-banner").waitFor();
    await page.unroute("**/api/state");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page
      .getByRole("button", { name: "Add search", exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "Multi-search browser checks passed: add/edit/category/budgets/disable/archive/filter/import, mobile, accessibility, real-only endpoints, security and recovery.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
