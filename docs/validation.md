# Validation — 18 October 2026

## Current multi-product implementation

43 Python unit/integration tests pass. Coverage includes one-time migration, independent watchlist budgets, enabled/archived selection, three-query orchestration, deduplication, ten-candidate caps, partial failures, real-only runtime/export, retired demo routes, generic product extraction, exact configuration matching, incomplete camera/console rejection, capacity context, contradictory inclusions, correction invalidation, historical prices, decimal economics and HTTP protections.

TypeScript checks, production build, and Chromium browser regressions passed against the final implementation. The browser suite covers adding Legion/MacBook/camera searches, independent budgets, category selection, pause/archive, filtering, import controls, filtered evidence cost selection, desktop/mobile accessibility, removed demo endpoints, mutation protection, upload limits and backend recovery. Browser fixtures are explicitly test-only and never written into operational SQLite.

```sh
npm ci
python3 -m unittest discover -s tests -v
npm run typecheck
npm run build
```

Browser QA must use disposable data because it archives/replaces test searches:

```sh
# Shell 1; choose an unused temporary directory and ports.
FLIPCHECK_BACKEND_PORT=8766 FLIPCHECK_WEB_PORT=3031 FLIPCHECK_DATA_DIR=/tmp/flipcheck-browser-data npm run dev

# Shell 2
npx playwright install chromium
FLIPCHECK_TEST_DISPOSABLE=1 FLIPCHECK_URL=http://127.0.0.1:3031 npm run test:browser
```

`CHROMIUM_PATH` can select an existing compatible browser. Automated WCAG A/AA checks are useful regression coverage, not a complete accessibility audit. The suite does not call SerpApi or require a paid scan.

## Observed live multi-search run

A disposable workspace ran **Legion, MacBook and camera together**, with their own budgets, using real SerpApi discovery and local `gemma4:e2b`. The pre-hardening product-v1 run used **3 requests**, admitted **30 real listings**, and completed analysis in **80.32 seconds**. It excluded 11 listings, left 19 requiring review, and claimed **zero opportunities**. All three queries completed and there were no inference errors. Job status was partial because some provider results were skipped during normalization. These are observations of one run, not accuracy estimates or provider-wide coverage.

The final product-v2 contract adds stricter capacity/context and inclusion checks. Prior saved contract versions become review-only until reanalysed; the run above is not a measured benchmark of the final validator.

No real sales library was supplied, so no resale accuracy or realized margin was measured. Broad queries such as camera can return accessories and incomplete listings; source validation and review remain necessary. No private keys, response payloads or operational databases are committed.

## Model evaluation

`scripts/evaluate.py` runs local inference against the explicitly synthetic multi-product evaluation fixture, with the current product validator. It creates an ignored report and never writes runtime data. This small hand-authored set is a smoke evaluation, not an unseen real-world benchmark.

```sh
python3 scripts/evaluate.py --split holdout
```

A two-case development smoke run on the final product-v2 contract classified both examples correctly, admitted one and left one for review, averaging 5.248 seconds. This checks the evaluation tool and current local-model path; two examples cannot establish extraction accuracy.

The old [ThinkPad evaluation report](evaluation-result.json) and `fixtures/extraction-evaluation.json` are retained as historical records of the previous contract. That run classified 37/40 synthetic holdout cases correctly versus 40/40 for a keyword baseline, admitting 16/16 labelled complete laptops. Those results do **not** apply to multi-product extraction and do not establish model superiority. The current prompt uses a 1,800-token output cap; the historical report used 1,000.

## Remaining limitations

- No unseen genuine sold-price evaluation, customer payment, realized profit or time-savings study.
- Incomplete facts deliberately reduce pricing coverage; model extraction can still be wrong.
- Current category profiles are conservative supported configurations, not exhaustive product catalogues.
- Searches need internet/quota and disclose queries to SerpApi; local inference is not the same as fully offline live discovery.
- No public hosting, automatic seller contact, purchasing or billing.

Use the [first-user worksheet](first-user.md) to collect observed customer evidence.

## Facebook location integration

56 backend tests pass after the Facebook extension. New checks cover old-search source defaults, coordinate validation, strict distance filtering including boundary rounding, malformed nested responses, the actual nested provider contract, missing/unknown availability and AUD prices, pickup-only selection, paid-run caps and timeout abortion, per-source failure isolation, marketplace-aware deduplication, separate pickup costs and per-search distances, changed-location valuation invalidation, and explicit AU place lookup/throttling.

A bounded live request for **one MacBook listing around a specified Melbourne test center**, within 25 km, completed in **49.89 seconds** using seven provider HTTP requests (including status/dataset requests). It returned a genuine AUD listing with original description and published coordinates approximately 0.397 km from the center. The live response used nested price/location fields, so the adapter was corrected and revalidated against that saved response without starting another paid run. Importing that genuine response into a disposable workspace completed local `gemma4:e2b` analysis; it remained `needs_review` with no opportunity claim. The production UI showed its Facebook source and approximate distance. The test center was explicit QA configuration, not an inferred user position. No live response or token is committed. This validates one provider path, not search completeness, product accuracy or resale value.

A real Nominatim lookup for Melbourne returned three AU locations. Browser regression exercises the actual browser geolocation API with test coordinates, persisted source/radius/costs, manual lookup selection, mocked permission-denial handling, and desktop/mobile WCAG A/AA checks. It creates only disposable search configurations, never fictional marketplace records or paid scans:

```sh
# Use the disposable app/ports described above.
FLIPCHECK_TEST_DISPOSABLE=1 FLIPCHECK_URL=http://127.0.0.1:3031 node scripts/facebook-browser-smoke.cjs
```

A provider may return fewer records than requested or fail entirely. Missing coordinates are excluded rather than labelled nearby. Published pins and straight-line distance do not verify physical location or travel distance. No live seller contact or purchase was performed.
