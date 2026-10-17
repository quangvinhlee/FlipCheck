# FlipCheck: A Local AI Deal Scout for Used-Laptop Resellers

**Hacktoberfest 2026 Open-Source AI Challenge — Week 2: Side Hustle**

Status: revised implementation plan. Features, targets, example numbers, and business hypotheses below are not claims about a finished product.

## 1. Product and challenge fit

**Pitch:** FlipCheck helps a small used-laptop reseller turn messy listings into a shortlist worth inspecting, with source-backed specifications, comparable sales, and estimated margins after costs.

**First customer:** an Australian solo reseller who already buys and resells used business laptops and checks eBay manually.

**Initial niche:** Lenovo ThinkPad T14 Gen 1–3, distinguishing Intel/AMD variants, processors, memory, storage, and condition.

**Initial market:** eBay Australia, AUD, domestic fixed-price listings. Exclude auctions, overseas listings, ambiguous price ranges, and multi-variation listings whose selected configuration or payable price cannot be established.

**Problem:** keyword searches mix genuine laptops with screens, docks, broken units, and unclear configurations. Resellers repeatedly check specifications and calculate whether a discount survives fees and shipping.

**Paid value hypothesis:** a reseller may pay for less repetitive screening and clearer buying decisions. Validate this through observed use, measured time saved, and willingness to pay.

**Why it fits Side Hustle:** it serves a specific income-generating task, uses an open-weight model for a core interpretation step, and has a clear customer outcome. First-user feedback is part of delivery, rather than an optional marketing claim.

## 2. Focused MVP

1. Configure a watchlist, purchase budget, minimum margin, and cost assumptions.
2. Run a bounded eBay search through SerpApi, or import listings from a local file.
3. Use Gemma locally through Ollama to classify text and extract supported facts.
4. Validate extraction and route ambiguity to review.
5. Match eligible listings against traceable recent sold comparisons.
6. Calculate a descriptive resale range and margins after explicit costs.
7. Let the reseller inspect evidence, correct facts, save/dismiss, or open the original listing.

Defer other product categories, Facebook/Gumtree, vector search, negotiation generation, automatic seller contact or purchasing, multi-user billing, and complex workflow infrastructure. Add scheduled scanning only after manual scans work and search costs are understood.

The MVP is a local single-user application. A public demo may use clearly labelled recorded fixtures and a video. A hosted live scanner is a separate deployment decision.

## 3. Architecture and the role of open AI

```text
Watchlist + explicit cost settings
              |
              v
eBay/SerpApi adapter OR local import
              |
              v
Normalize identity, prices, currency, and source text
              |
              v
Local Gemma via Ollama: classify + extract evidence
              |
              v
Validation -> rejected / needs review / eligible
              |
              v
Verified sold-comparison matching + resale range
              |
              v
Deterministic economics -> shortlist + evidence drawer
              |
              v
Local persistence + reseller decisions and corrections
```

Use a small Python service, a single-page dashboard, and SQLite for the single-user MVP. PostgreSQL is an optional later deployment choice. Do not add databases or embeddings solely to enter prize categories.

Start by testing `gemma3:4b` on the actual machine. Record model digest, quantization, Ollama version, hardware, and measured throughput; pin the tested environment. This is an initial candidate, not a guaranteed hardware fit.

Gemma interprets varied descriptions and separates complete laptops from accessories or faulty units. It does not invent prices, inspect unseen hardware, or certify seller claims. Compare its classification with a keyword baseline to demonstrate the value it adds.

### Extraction contract

Treat listing text as untrusted data, never instructions. Separate prompts from source text, cap input size, and allow no tools or side effects from extraction output.

Return:

- Classification: `complete_laptop`, `accessory`, `parts_or_faulty`, `out_of_scope`, or `uncertain`.
- Nullable model, generation, CPU, RAM, storage, and seller-stated condition.
- A verbatim supporting excerpt for each non-null fact.
- Explicit fault/lock mentions: BIOS password, battery problems, damaged display, missing charger, and similar limitations.
- Unknown fields and a short classification reason.

Never default condition to good, invent MSRP, assign a universal spec tier, or treat no fault mention as proof of working condition. Normalize model aliases using explicit rules. Unsupported or conflicting specifications require review.

Validate JSON, types, ranges, enum values, evidence, and cross-field consistency in code. Evidence appearing in a source is necessary but not sufficient for correctness. Bound retries; failed parsing must produce a failed/review state. Accepted extraction still represents the seller's description, not physical verification.

## 4. Data acquisition is the first feasibility gate

Live asking prices are not sold prices. Before valuation, demonstrate access to genuine sold comparisons through an available permitted source or a user-supplied sales export. Do not assume SerpApi provides complete sales history or that a displayed price reveals an accepted offer.

| Group | Required fields |
| --- | --- |
| Provenance | Source, external sale/listing ID, URL or import reference, collection date |
| Sale | Sale date, AUD amount, shipping, whether actual transaction price is known |
| Hardware | Exact model/generation, Intel/AMD variant, CPU, RAM, SSD, relevant extras |
| Condition | Seller-stated condition, faults, supporting source text |
| Quality | Verification status, exclusion reason, duplicate/group identity |

Keep synthetic demo fixtures separate from real observations. The original 26 illustrative rows are not evidence of resale accuracy and must not be presented as historical sales.

**Fallback:** if verified comparisons are unavailable, ship listing triage with user-entered resale assumptions. Label the margin assumption-based, disable evidence-backed opportunity badges, and explain the limitation in the demo.

## 5. Valuation and economics

### Explainable baseline first

Match verified comparisons by exact model/generation, CPU variant, RAM/storage, and comparable condition. Exclude broken devices and materially different bundles. Deduplicate observations and use a configurable recency window, initially 90 days.

Require at least five qualifying comparisons to display a comparison-based estimate. This is an initial product guardrail, not proof of statistical reliability. Show count, dates, material differences, and source references. If too few exist, say “insufficient comparable sales”; do not silently broaden matches.

Display median and empirical lower/upper quartiles as a descriptive resale range. It is not a calibrated prediction interval or an exact resale prediction.

### Explicit cost calculation

Use integer cents or decimal arithmetic and AUD consistently. Comparable item prices exclude shipping; resale shipping charged to the buyer is entered separately.

```text
gross_receipts = resale_item_price + resale_shipping_charged_to_buyer
cash_invested = purchase_price + inbound_shipping + repairs + packaging
selling_fees = configured_fee_rate * configured_fee_base + fixed_fee
estimated_margin = gross_receipts - cash_invested - selling_fees
                   - outbound_shipping - risk_allowance
estimated_roi = estimated_margin / cash_invested * 100
```

The configured fee base must match the seller's fee treatment. Store fee assumptions and dates with each valuation; do not assume a universal platform percentage. Unknown required costs prevent an opportunity badge. Handle zero investment safely.

Calculate low, median, and high scenarios using the same cost settings. Label results estimated pre-tax margins before owner labour; allow labour costs to be entered if useful.

Illustrative arithmetic only: AUD 240 purchase + 15 inbound shipping + 0 repairs + 5 packaging; AUD 400 resale with no shipping charged to the buyer; assumed fees of 12% of AUD 400 + AUD 0.30; AUD 20 outbound shipping and AUD 20 risk allowance produces AUD 51.70 margin. These are not current eBay fees or an observed deal.

An **opportunity to inspect** requires sufficient comparisons, complete required facts/costs, no unresolved material faults, and a conservative scenario exceeding the user's minimum margin. It is not a guaranteed profitable purchase.

### Optional TabPFN experiment

TabPFN is not an MVP dependency. Establish data access and the baseline first. An experimental model must outperform that baseline on held-out real sales before influencing ranking.

The published TabPFN-3.5 weights license restricts commercial/production use and hosted services. Do not assume challenge participation grants deployment rights. A paid or public end-user deployment needs an appropriate licensing path; otherwise retain the baseline. Record model version and terms separately from the application's source license.

Source: [TabPFN-3.5 license](https://huggingface.co/Prior-Labs/tabpfn_3_5/blob/main/LICENSE).

## 6. Persistence and scanner behaviour

| Record | Purpose and key fields |
| --- | --- |
| Watchlist | Model scope, query, AUD budget, margin threshold, cost settings |
| Scan run | Start/end, source, requests, listing counts, quota usage, errors, status |
| Listing | Marketplace + stable external ID, canonical URL, raw text, price, first/last seen |
| Watchlist match | Many-to-many relationship between listings and watchlists |
| Observation | Timestamped price/availability snapshot; preserve price-drop history |
| Extraction | Source hash, model/prompt/schema versions, facts, evidence, validation status |
| Sold comparison | Provenance and verified sale details from section 4 |
| Valuation | Comparison IDs, range, cost snapshot, method version, margins, date |
| User decision | Saved/dismissed/contacted/purchased state, corrections, optional actual outcome |

Deduplicate by marketplace item identity rather than tracking URLs. Cache extraction by source hash and model/prompt/schema versions. Price changes rerun economics; changed source text also invalidates extraction.

Use HTTP timeouts, bounded retries/backoff, request limits, and explicit quota/error states. Verify current SerpApi request parameters and response shape with a real response before implementing the adapter. Preserve partial results on failure. Display freshness; search results do not prove availability. Unknown availability must not be marked sold.

## 7. Dashboard and demo

**Controls:** watchlist, budget, minimum margin, costs, “Scan now,” local import, progress, source, and failures.

**Summary:** actual counts of scanned, excluded, review, and eligible listings. Never seed live KPI cards with fabricated results or sum uncertain margins as guaranteed income.

**Shortlist:** exact configuration, purchase price plus shipping, comparable range/count, conservative estimated margin, unknowns, and saved/dismissed state.

**Evidence drawer:** original text, supporting excerpts, seller-stated faults, comparison sources, all costs, estimate date, and status explanation.

**Actions:** open listing, save, dismiss, correct facts, edit assumptions. Corrections rerun validation and valuation. No automatic contact or purchases.

Demo three cases: a plausible opportunity, an accessory/faulty listing excluded with a reason, and ambiguity that correctly receives no estimate. Include empty and failed-provider states. Label recorded scans and synthetic fixtures visibly.

## 8. Validation and acceptance goals

Targets below are goals, not measured achievements.

| Question | Evidence |
| --- | --- |
| Does Gemma add value? | Same frozen labelled listings evaluated with Gemma and keyword filtering |
| Are dangerous listings admitted? | Faulty/accessory listings accepted incorrectly, with counts and denominators |
| Are facts supported? | Exact model/spec extraction, unknown handling, evidence validity, inspected errors |
| Is pricing credible? | Unseen verified sales, using only comparisons available before each sale |
| Is modelling worthwhile? | Experimental model vs comparable median on the same split |
| Is it affordable? | Scan time, extraction latency, requests, hardware, recurring costs |
| Is it useful? | Observed reseller task, time taken, useful suggestions, corrections |

Start with 50 manually labelled listings covering complete devices, accessories, faults, ambiguity, and conflicting specs. Keep an evaluation subset separate from prompt tuning. Include prompt-injection text as a failure case. Seek at least 95% precision among listings admitted for valuation on this initial set, report sample size, and avoid broad reliability claims from a small benchmark.

Use chronological pricing evaluation and prevent duplicate-listing leakage. Report absolute error in AUD plus the number/coverage of items declined. If data is insufficient, say pricing accuracy remains unvalidated.

Add focused checks for arithmetic, shipping/currency normalization, duplicate imports, extraction failures, and insufficient-evidence handling. Fixture mode must run without external search; offline local inference requires weights and dependencies to have been downloaded already.

## 9. First user and willingness to pay

Recruit one reseller for a short sourcing session. Record their normal process, let them inspect listings with FlipCheck, and ask which suggestions they trust and would investigate.

Measure time, useful suggestions, errors, and corrections. Ask what would justify payment and whether they would return next week. AUD 19/month for local-use support/updates is one possible price experiment, not established demand or committed billing scope.

Report payment, interest, refusal, and requested changes honestly. If no completed resale occurred, do not claim realized profit. Obtain consent before publishing identifiable quotes or screenshots.

Track search charges and support effort alongside inference costs. State who provides the machine and API credentials. Local inference removes per-token provider billing, not all operating costs.

## 10. Why open innovation matters

Ground the submission in demonstrated benefits:

- **Local analysis:** extraction and private sales imports run on the user's machine without a closed inference API.
- **Control:** users can inspect prompts, change rules, pin or swap models, and reproduce evaluation.
- **Economics:** repeated local extraction avoids per-token inference charges; disclose hardware, electricity, and search costs.
- **Continuity:** import/replay remains useful without live search after local dependencies and weights are installed.

State boundaries precisely: live discovery requires internet and SerpApi receives search queries. A local database keeps private outcomes/margins on the user's machine; cloud storage or telemetry changes that boundary. No cloud fallback or text telemetry by default. The live scanner is not fully offline or completely private.

Call Gemma **open-weight**. Before distribution, check selected model/runtime terms, dependency licenses, and data redistribution rights. Choose an explicit application license; it does not override model or dataset terms. Publish a component/license inventory.

Avoid claims that closed models cannot filter accessories, local operation costs nothing, or resale values are exact. Demonstrate actual user control and deployment benefits with measured evidence.

## 11. Delivery order and challenge submission

1. **Feasibility:** real eBay response, usable sold comparisons, local Gemma inference. Choose the assumption-based fallback promptly if sales data is unavailable.
2. **Core loop:** import/search -> extraction -> validation -> comparisons -> economics -> persistence.
3. **Usable UI:** shortlist, evidence drawer, corrections, assumptions, review/error states.
4. **Proof:** frozen evaluation, measured runtime/costs, one reseller session if possible.
5. **Submission:** reproducible README, code/license inventory, demo video or working demo, evidence-led DEV post.

If time is short, prioritize reliable import-based analysis and a recorded demo over scheduling and sponsor integrations. Do not describe deferred features as shipped.

Use the supplied template:

- **What I Built:** specific reseller, task, and potential paid value.
- **Demo:** workflow, rejection/review cases, limitations, labelled fixtures.
- **Code:** repository, setup, model/hardware needs, provenance, reproduction.
- **How I Built It:** extraction, validation, comparisons, calculations, measured results.
- **Why Does Open Innovation Matter?:** local execution, control, cost/privacy boundaries.
- **My First User:** observed feedback and payment status, only if it happened.
- **My Agent Session:** optional; review transcript content before sharing.
- **Prize Categories:** only technologies meaningfully used in the delivered project.

Best Use of Gemma is the natural initial partner target. SerpApi applies if live discovery ships. TabPFN, Tiger Data, Render, Temporal, Sentry, and a .tech domain are optional additions requiring a product reason. Multiple entries do not imply cumulative prizes: each participant can win only once per challenge. Writing quality is weighted most heavily.

Published deadline: **18 October 2026, 11:59 pm PDT**, equivalent to **19 October 2026, 5:59 pm Melbourne time (AEDT)**. Include required `hf26challenge` and the supplied template's `devchallenge` tag.

Source: [Official Week 2 prompt, rules, and judging criteria](https://dev.to/challenges/hacktoberfest-week2-2026-10-12).

Design reference: [Schema-Valid Isn't Correct: 4 Checks Before You Trust LLM Extraction](https://dev.to/michael_maurice/schema-valid-correct-4-checks-before-you-trust-llm-extraction-4n6f), by Michael Maurice. Its evidence-first approach informs extraction and review; it is not a benchmark of FlipCheck or Gemma.

**Definition of done:** one reseller can inspect a small evidence-backed shortlist, see every cost assumption, and understand when FlipCheck cannot support a valuation. The submission shows what actually worked and what remains unvalidated.
