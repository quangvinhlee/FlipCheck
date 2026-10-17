# Multiple product searches and real-data-only workspace

Date: 18 October 2026, Melbourne
Status: design for review; implementation has not started.

## User intent

The user wants to search several products in one run, for example Legion laptops, MacBooks, and cameras. The app must stop restricting results to Lenovo ThinkPad T14. The user also explicitly requested no dummy data in the application.

Success means a user creates several independently editable searches, scans them together, and sees genuine results in a combined feed without invented listings, sales, or profits. The initial live provider remains eBay Australia through the existing private SerpApi key. Gemma 4 continues running locally.

## Selected approach

Use saved watchlists with independent queries, categories, budgets, and margin assumptions, backed by a product-aware extraction contract. Keep the existing Next.js UI and Python service, extending their interfaces and SQLite schema.

Alternatives considered:

- A single OR-combined query is cheaper to implement but cannot reliably preserve each product's budget, category, or coverage.
- Separate dashboards per product isolate results but do not deliver the combined scan/feed the user requested.

The selected approach costs up to one provider search per selected watchlist, plus bounded transient retries; disclose actual request counts in scan activity.

## User experience

Replace the single ThinkPad watchlist card with a watchlist manager. Users add a search such as `Legion`, `MacBook`, or `camera`, choose a category or `Other tech`, and set its budget and minimum margin. These are illustrative input examples, not preloaded searches or listings.

Support up to ten saved watchlists. Each can be enabled, edited, disabled, or archived. A scan processes the enabled watchlists, with a visible count before starting. A single-watchlist scan is also supported. If none is enabled, prompt the user to add or enable a search.

The shared feed offers an All searches filter and individual watchlist filters, alongside current status, search, sorting, saved decisions, cards/tables, and evidence review. Each result displays all matching watchlist names. Remove T14/Gen 1–3 copy and laptop-only titles/icons from generic contexts. Use category-appropriate presentation without implying a product photo has been fetched.

A listing matched to several searches appears once in the combined feed. The card states which watchlist supplies the displayed margin. When inspecting it, the user can select a matching watchlist to see its own valuation and costs. For the combined view, use the earliest-created active matching watchlist deterministically; do not silently pick whichever assumptions produce the largest profit. The individual watchlist filter uses that watchlist's valuation.

Keep real listings with missing facts visible for review. A broad family query such as `Legion` must not mark all its results out of scope merely because the exact model is not T14.

## No dummy data in the app

Remove demo loading/switching, synthetic opportunity badges, and the public demo/mode mutation endpoints from both frontend and backend. The state endpoint always returns the real workspace. Empty screens offer Add search, Scan, or Import; failures show actionable errors and never substitute fixtures.

Do not delete genuine imported/listed records, sales, settings, or decisions. Existing synthetic demo records remain quarantined and invisible to state, export, matching, and valuations; this avoids destructive cleanup while satisfying the runtime requirement. Test fixtures may remain under tests/fixtures and cannot be imported by runtime service code or used by runtime endpoints. Update screenshots and docs to avoid presenting synthetic examples as the current application experience.

Do not run live scans or insert arbitrary example products during migration. Verify an actual user-selected live query after implementation; record the provider source and measurement honestly.

## Search orchestration and persistence

Add schema-versioned, transactional tables for watchlists and listing-to-watchlist matches. Watchlists contain ID, display name, query, category, enabled/archived state, budget, minimum margin, and the existing fee/logistics/assumption settings. Store valuations with watchlist identity and immutable cost snapshots.

Migrate the existing configured search into one real watchlist to preserve the user's settings and data. Retain historical extraction and valuation records; legacy T14 extraction can be read through an adapter until reanalysis. Do not repeat migration on restart.

Use stable marketplace/item identity for deduplication. Persist the many-to-many search matches and keep price observations and saved/dismissed decisions on the underlying listing.

One worker runs at a time. It searches selected watchlists sequentially with at most ten admitted candidates per search (at most 100 candidates before deduplication), then analyses each unique listing once. Preserve every matched watchlist. Display searching and analysing phases separately. Count each provider attempt, including retries.

If one search fails, record that watchlist's error and continue the others. Preserve valid partial results. No enabled watchlists or unavailable providers produce an explicit error rather than a success message. A scan uses a settings/watchlist snapshot; prevent watchlist edits during that scan using the existing busy guard.

## Product-aware Gemma extraction

Replace `complete_laptop` and the hard-coded T14 prompt with a shared classification: complete product, accessory, faulty/parts, unrelated, or uncertain. Extract nullable category, brand, exact model, stated condition, and category-specific attributes, each with a verbatim evidence excerpt.

Supported profiles:

| Category | Material identity/configuration fields |
| --- | --- |
| Laptop | Exact model/year or generation where needed, processor/chip, RAM, storage, discrete GPU when applicable |
| Camera | Exact model, body-only vs kit, lens model/inclusions when bundled |
| Phone/tablet | Exact model/variant, storage, lock/network status where material |
| Console | Exact model/edition, storage when applicable, controller/bundle configuration |
| GPU | Exact GPU model, VRAM, material variant |
| Other tech | Brand/model plus user-confirmed configuration; discovery and review supported, automated comparable valuation deferred |

Do not require Intel/AMD for Apple Silicon or laptop RAM for cameras. A broad camera result can be a valid discovery but must remain unvalued until an exact model and material configuration are known.

Validate field types, source evidence, model/value grounding, contradictions, and explicit faults in ordinary code. Unknowns remain unknown; condition is never defaulted to good. Keep prompt-injection isolation and bounded model output. A category's eligibility requirements must be separate from its prompt and reusable by corrections and sales imports.

Version the contract, prompt, model digest, and validator in extraction cache keys. Revalidate legacy facts or run fresh extraction before issuing new-model valuations; never reuse a T14-only rejection as a new product decision.

## Comparable sales and economics

Generalize the sold-comparison import format to the same category identity and attribute profiles. Preserve source, transaction identity, actual-price verification, dates, AUD, AU, shipping, condition evidence, and provenance. Adapt valid legacy T14 comparisons without creating new sales.

Require at least five recent verified sales matching the material product configuration and comparable condition. Never compare Legion with MacBook, or camera bodies with lens kits. Missing material fields prevent automatic matching; missing on both records is not a valid match.

Keep descriptive quartiles and decimal economics. A watchlist's explicit resale assumption may provide an assumption-labelled margin, never an evidence-backed opportunity badge. Broad multi-model searches do not share a single inferred resale price. Unknown shipping or other required costs still prevents supported margins.

## Interface changes

Extend the existing API with validated watchlist create/update/archive actions and a scan request containing selected IDs (or all enabled watchlists). Extend state with watchlists, match IDs, and per-watchlist valuations. Update the Next.js route allowlist, TypeScript types, forms, polling, imports/templates, export, and evidence/correction panels together.

Preserve local-only binding, origin and token protection, upload limits, no cloud inference fallback, and private environment credentials. Scanning remains an explicit user action.

## Verification and acceptance

- Unit/integration checks for watchlist validation, migration idempotence, many-to-many deduplication, per-watchlist budget/cost isolation, partial search failures, candidate limits, request accounting, and no enabled searches.
- Product fixtures for Legion, MacBook with Apple Silicon, and camera body/kit differences, plus existing faults, accessories, unsupported claims, and unknown condition cases. These remain test-only.
- Tests proving runtime state/export/comparison matching never exposes or uses synthetic records and demo endpoints are unavailable.
- Browser coverage for adding/editing/archiving three searches, combined and filtered views, scan progress, error states, evidence, category-specific corrections, actual costs, and empty data.
- Preserve monetary, chronological matching, local API security, accessibility, and mobile checks. Run Python tests, TypeScript checks, production build, and browser regressions.
- Conduct a bounded live search using the configured provider and actual local Gemma model after implementation; never claim all-category pricing accuracy from fixtures or one scan.
- Update README, plan, data formats, component boundaries, and validation results. Commit/push each validated implementation stage as previously requested.

## Scope boundary

This change broadens products and removes runtime dummy data. Facebook Marketplace discovery remains a separate proposed provider feature; indexed search is not automatically included in this migration. Real sold-price accuracy, willingness to pay, and realized profits remain unvalidated until measured on genuine observations.
