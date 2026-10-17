# Multiple Product Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Search Legion, MacBook, cameras, and other tech together through saved searches, with genuine data only in the app.

**Architecture:** Keep Next.js and the Python API. Replace the single-query configuration with persisted watchlists, many-to-many listing matches, product-aware extraction and comparison rules, and per-watchlist valuations. Preserve the existing real database through a transactional migration; remove runtime demo features.

**Tech Stack:** Next.js 16.4.2, React, TypeScript, Python standard library, SQLite, Ollama Gemma 4, SerpApi eBay Australia.

**Spec:** `docs/superpowers/specs/2026-10-18-multiple-product-search-design.md`

## Global Constraints

- Support up to ten saved watchlists.
- At most ten admitted candidates per search (at most 100 before deduplication).
- One scan worker; sequential searches; analyse each unique listing once.
- Require at least five recent verified comparable sales; never match missing identity fields to each other.
- No runtime synthetic data, demo loading, or fixture fallbacks.
- Preserve genuine records, decisions, observations, credentials, and local-only security.
- Facebook discovery is outside this migration.
- Commit and push each validated stage; do not publish private configuration or operational data.

## Review Focus

1. Restarting the app must not recreate searches, overwrite edits, or duplicate migration matches: pin in Task 1.
2. Two searches matching one item must preserve both budgets and produce one feed row: pin in Tasks 1, 3, and 5.
3. Unknown fields must not cause cross-product price matches or invented condition: pin in Task 2.
4. A failed middle query must not discard successful earlier/later queries: pin in Task 3.
5. Archived searches and previously loaded synthetic records must not return through exports or stale frontend state: pin in Tasks 4 and 5.

## File boundaries

- `flipcheck/watchlists.py`: validation and per-watchlist settings resolution.
- `flipcheck/products.py`: category profiles, evidence validation, product matching identity.
- `flipcheck/store.py`: schema migration, watchlists, matches, valuation persistence.
- `flipcheck/service.py`: scan orchestration and state assembly.
- `flipcheck/providers.py`: generic extraction schema/prompt and existing live adapter.
- `flipcheck/server.py`: watchlist endpoints, scan IDs, updated imports/templates; retire demo/mode endpoints.
- `flipcheck/domain.py`: preserve decimal economics and integrate category-aware matching.
- `frontend/components/watchlists.tsx`: search manager and create/edit forms.
- `frontend/components/dashboard.tsx`: manager, feed filters, source labels and scan actions.
- `frontend/components/forms.tsx`, `evidence.tsx`: profile-aware data entry and watchlist selection.
- `frontend/lib/types.ts`, `format.ts`, `use-workspace.ts`: changed API contract and rendering helpers.
- `frontend/app/api/[...path]/route.ts`: route allowlist.
- `tests/test_watchlists.py`, `test_products.py`, `test_multisearch.py`: new unit/integration regression coverage.
- `scripts/browser-smoke.cjs`: real-data-only UI regression scenarios using isolated test data.

### Task 1: Persist multiple searches and migrate existing real data

**Interfaces:**
- `validate_watchlist(raw: dict, defaults: dict) -> dict`: validate name/query/category, budget, margin and cost settings.
- `Store.watchlists(include_archived: bool = False) -> list[dict]`.
- `Store.save_watchlist(raw: dict, watchlist_id: int | None = None) -> dict`.
- `Store.archive_watchlist(watchlist_id: int) -> None`.
- `Store.link_listing(listing_id: int, watchlist_id: int) -> None`.
- `Store.matches(listing_id: int) -> list[int]`.
- `Store.snapshot(listing_id: int, valuation: dict, watchlist_id: int | None = None) -> None`.

- [ ] Add failing tests: create three independent queries; reject blank query and negative budgets; reject an eleventh unarchived search; preserve disabled/archived states.
- [ ] Add migration tests: initialize twice without duplicate searches or matches; retain prior settings and saved decisions; existing real listings link to the migrated search; synthetic listings do not.
- [ ] Run `python3 -m unittest discover -s tests -p test_watchlists.py -v`; verify failures reflect missing interfaces.
- [ ] Implement the validation module and schema-versioned transactional migration. Add nullable watchlist identity to historical valuation storage without rewriting prior snapshots. Existing global costs become defaults; each watchlist gets its own resolved snapshot.
- [ ] Run watchlist tests and the existing backend suite; resolve only migration-related compatibility changes.
- [ ] Commit and push: `feat: persist multiple product watchlists with safe migration`.

### Task 2: Generalize extraction and comparison identities

**Interfaces:**
- `PRODUCT_PROFILES: dict[str, tuple[str, ...]]` defines material fields for laptop, camera, phone/tablet, console, GPU, other.
- `validate_product_extraction(draft: dict, text: str) -> dict`: validated category, classification, common facts, attribute values/evidence, errors and review status.
- `product_identity(extraction: dict) -> tuple | None`: exact material configuration; returns None if unsupported or incomplete.
- `normalize_product_comparison(raw: dict) -> dict`: validates source, dates, actual sale and category identity.
- `adapt_legacy_extraction(raw: dict) -> dict`: preserve old data and mark it for revalidation before new valuations.

- [ ] Write failing product tests: Legion laptop, Apple Silicon MacBook, camera body versus kit; no Intel/AMD requirement for Apple; no RAM requirement for camera; missing exact model declines valuation.
- [ ] Add tests: missing-on-both sides never matches; faults/accessories/injection require rejection/review; numeric evidence and unsupported values fail closed; different camera kits and different laptop configurations do not match.
- [ ] Run `python3 -m unittest discover -s tests -p test_products.py -v` and confirm relevant failures.
- [ ] Implement category profiles and reusable fact validation. Update Ollama schema/system prompt, contract/cache version, comparison normalization and legacy adapters. Keep decimal economics unchanged and require a non-null identity before comparison matching.
- [ ] Run product and backend tests; update old T14-only expectations to the general contract without weakening evidence checks.
- [ ] Commit and push: `feat: extract and compare product-specific configurations`.

### Task 3: Scan selected searches and deduplicate results

**Interfaces:**
- `App.start(kind: str, rows: list | None = None, listing_id: int | None = None, watchlist_ids: list[int] | None = None) -> dict`.
- `App._run(job: dict, kind: str, listings: list | None, watchlists: list[dict]) -> None`.
- `App.state() -> dict` includes `watchlists`, listing `watchlist_ids`, `valuations` keyed by ID, and `display_watchlist_id`.
- Per-search job records contain watchlist ID, phase, processed counts, requests, skipped results and errors.

- [ ] Write failing tests with an injected fake search adapter: three independent queries called with their own budgets; overlapping IDs analysed once and linked to both; middle-query failure preserves other results; max ten admitted candidates per query.
- [ ] Add tests: disabled/archived searches not scanned; no enabled searches fails explicitly; invalid IDs rejected before network calls; edits blocked while running; per-watchlist settings never leak.
- [ ] Run `python3 -m unittest discover -s tests -p test_multisearch.py -v`; verify red failures.
- [ ] Implement scan snapshotting, sequential bounded searches, per-item deduplication, request accounting and partial-failure persistence. Select earliest-created active match as combined-view valuation, not maximum estimated profit.
- [ ] Run multi-search and backend tests and verify stable metadata after worker completion.
- [ ] Commit and push: `feat: scan multiple watchlists into one deduplicated feed`.

### Task 4: Expose watchlist API and retire runtime dummy data

**Interfaces:**
- `POST /api/watchlists/save`: watchlist payload and optional ID.
- `POST /api/watchlists/archive`: ID; archive without deleting underlying listings/decisions.
- `POST /api/scan`: optional `watchlist_ids`; omitted means all enabled searches.
- Listing import accepts explicit watchlist association; sold import uses category-specific schema.
- `GET /api/state` and `/api/export` expose real records only; `/api/demo` and `/api/mode` return 404.

- [ ] Add HTTP tests for create/edit/archive, scan selection, invalid payloads and existing origin/token protection.
- [ ] Add tests with old synthetic records: state/export/matching never includes them; runtime demo routes unavailable; empty data stays empty after provider failure.
- [ ] Run the new tests and observe the current demo/state behaviour failing them.
- [ ] Implement service methods, server routes and templates; update the Next.js proxy allowlist. Move retained synthetic helpers under tests and remove runtime imports of `flipcheck.demo`.
- [ ] Run full backend suite and compile checks; inspect runtime imports for fixture references.
- [ ] Commit and push: `feat: expose multi-search API and remove demo workspace`.

### Task 5: Deliver the multi-product Next.js workflow

**Interfaces:**
- `Watchlist` TS interface matches Task 1, including per-search settings and state flags.
- `Listing` includes matched search IDs, per-watchlist valuations and deterministic display ID from Task 3.
- `WatchlistManager` consumes watchlists, mutation handler and active job state; produces save/archive/selected-scan requests.
- `Evidence` accepts an optional selected watchlist ID and displays that exact cost/valuation snapshot.

- [ ] Extend browser scenarios: empty real workspace; add Legion, MacBook, camera searches; edit independent budgets; disable and archive; combined/individual filters; one deduplicated listing; no demo controls or synthetic records.
- [ ] Run browser checks against a disposable database and observe missing watchlist controls.
- [ ] Implement manager/forms, selected scan, All searches selector, per-row matched-search labels and explicit valuation source. Remove hard-coded T14/Gen 1–3 and laptop-only copy; category-aware corrections preserve unknown fields.
- [ ] Update imports, templates, export and help copy. Preserve filters/saved states through polling and handle archived filter IDs by returning to All searches.
- [ ] Run `npm run typecheck`, `npm run build` and browser scenarios at desktop/mobile sizes, including accessibility, API denial and disconnected-backend recovery. No fabricated data may load into the user's operational workspace; fixtures are confined to disposable test databases.
- [ ] Commit and push: `feat: manage and scan multiple products from the dashboard`.

### Task 6: Verify live behaviour and document the shipped change

- [ ] Run `python3 -m unittest discover -s tests -v`, `npm run typecheck`, `npm run build`, and `npm run test:browser`; inspect complete results.
- [ ] Use an isolated QA database to run a bounded live search with the user-provided Legion/MacBook/camera terms, configured SerpApi and real local Gemma. Verify each selected query was sent and unmatched/unknown items remain unvalued. Do not assert real-world resale accuracy.
- [ ] Update README, plan, data formats and validation with actual commands, migration behaviour, search/request bounds, product profiles and measured results. Replace synthetic screenshots with real results or empty UI.
- [ ] Inspect `git diff --check`, tracked-file credential exclusion, fixture isolation and changed endpoints; review the implementation against the spec.
- [ ] Commit and push: `docs: document real-data multi-product workflow and validation`.

## Handoff

Recommended execution: Native, implementing each task sequentially in this session. The tasks share schema and API interfaces, so sequential execution reduces integration mistakes. Review of this plan is required before product changes; implementation has not started.
