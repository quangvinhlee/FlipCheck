/** Disposable search configuration only. Never inserts fabricated listings. */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;
const base = process.env.FLIPCHECK_URL || "http://127.0.0.1:3036";
(async () => {
  if (process.env.FLIPCHECK_TEST_DISPOSABLE !== "1")
    throw Error("Use an isolated database and FLIPCHECK_TEST_DISPOSABLE=1.");
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      permissions: ["geolocation"],
      geolocation: { latitude: -37.814, longitude: 144.963 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const initial = await (
      await context.request.get(base + "/api/state")
    ).json();
    for (const w of initial.watchlists.filter(
      (w) => w.query === "FB location regression",
    ))
      await context.request.post(base + "/api/watchlists/archive", {
        data: { id: w.id },
        headers: { "X-FlipCheck-Token": initial.csrf_token },
      });
    await page.goto(base);
    await page.getByRole("button", { name: "Add search", exact: true }).click();
    await page
      .getByLabel("Search query", { exact: true })
      .fill("FB location regression");
    await page.getByLabel("Facebook Marketplace", { exact: true }).check();
    await page.getByLabel("eBay Australia", { exact: true }).uncheck();
    await page
      .getByRole("button", { name: "Use my location", exact: true })
      .click();
    await page
      .getByText("Approximate device location", { exact: true })
      .waitFor();
    await page.getByLabel("Pickup radius (km)", { exact: true }).fill("25");
    await page
      .getByLabel("Pickup / travel allowance (AUD)", { exact: true })
      .fill("12");
    const a = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      a.violations.map((v) => v.id),
      [],
    );
    await page
      .getByRole("button", { name: "Save search", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    let state = await (await context.request.get(base + "/api/state")).json();
    let w = state.watchlists.find((x) => x.query === "FB location regression");
    assert.deepEqual(w.sources, ["facebook"]);
    assert.equal(w.location.latitude, -37.814);
    assert.equal(w.radius_km, 25);
    assert.equal(w.pickup_cost, 12);
    assert.ok(!JSON.stringify(state).includes("APIFY_TOKEN="));
    await page
      .getByRole("button", { name: "Edit FB location regression", exact: true })
      .click();
    await page.route("**/api/location/search", (r) =>
      r.fulfill({
        json: {
          places: [
            {
              latitude: -37.815,
              longitude: 144.964,
              label: "TEST ONLY lookup result",
            },
          ],
          attribution: "Test lookup",
        },
      }),
    );
    await page.getByLabel("Suburb or postcode", { exact: true }).fill("3000");
    await page
      .getByRole("button", { name: "Find location", exact: true })
      .click();
    await page
      .getByRole("button", { name: "TEST ONLY lookup result", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save search", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    state = await (await context.request.get(base + "/api/state")).json();
    w = state.watchlists.find((x) => x.id === w.id);
    assert.equal(w.location.latitude, -37.815);
    await context.grantPermissions([], { origin: base });
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Edit FB location regression", exact: true })
      .click();
    await page.evaluate(() => {
      navigator.geolocation.getCurrentPosition = (_success, failure) =>
        failure({ code: 1, message: "Permission denied" });
    });
    await page
      .getByRole("button", { name: "Use my location", exact: true })
      .click();
    await page.getByText(/Location access was denied/).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const mobile = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      mobile.violations.map((v) => v.id),
      [],
    );
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    assert.deepEqual(errors, []);
    console.log(
      "Facebook UI passed: source selection, device position, lookup, persistence, radius, pickup cost, denied permission and mobile accessibility. No paid scan or invented listing.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
