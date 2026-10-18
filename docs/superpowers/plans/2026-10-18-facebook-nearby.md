# Facebook Marketplace near your position

Approved outcome: extend the existing multi-product scan with source selection (eBay, Facebook, both), browser location or explicit AU suburb/postcode lookup, and a pickup radius. Keep real-only runtime data, per-search economics, existing records and local Gemma analysis.

Implementation stages:

- [ ] Validate and persist per-search sources, optional location, radius and explicit pickup/travel allowance; normalize Facebook identities and retain location metadata.
- [ ] Add a bounded Apify connector for memo23/facebook-marketplace-scraper-ppe, with bearer-token authentication, no cookies, no automatic retry of run creation, runtime/spend/result caps, status polling and strict local distance/currency/availability validation. Missing token fails visibly; Google-indexed results are not substituted.
- [ ] Extend scan orchestration with independent per-source outcomes, partial success and marketplace-aware deduplication; preserve the total ten-candidate budget per product by splitting it across selected sources.
- [ ] Add source/location/radius controls to the existing search form; use browser geolocation only on click, plus deliberate AU place lookup using Nominatim (no autocomplete). Show source and approximate straight-line distance; recompute for each search's center. Unknown pickup costs keep economics unavailable.
- [ ] Verify provider boundaries with isolated contract tests, denied/missing geolocation and browser flows, backend suite, typecheck and production build. Update docs, commit/push stages, merge main and restart.

Provider credentials: APIFY_TOKEN in private .env. This is a third-party Marketplace connector, not Meta's official API. Searches disclose the query and rounded coordinates to Apify/Facebook. A suburb/postcode lookup discloses that query to Nominatim. No location access happens before the user's click. No automatic provider fallback or seeded data.

Apify input/output contract checked against https://apify.com/memo23/facebook-marketplace-scraper-ppe and its input schema. Run/dataset requests follow https://docs.apify.com/api/v2/actors-runs-post and /dataset-items-get. Provider coverage and precise pins are not guaranteed. Both sources admit at most five candidates each, or ten for one source (at most 100 total). Apify actor runtime capped at 120 seconds, charge capped at USD 0.25 per run; maxItems always explicit. A missing coordinate, non-AUD price, inactive/sold/pending record, non-pickup record, or out-of-radius result is skipped with a reason. A published map pin gives approximate distance, not travel distance or physical-location verification.

Live Facebook validation requires a user-configured token. Do not claim a live scan succeeded if it was not run. Test fixture responses remain in tests/disposable browser interception only.
