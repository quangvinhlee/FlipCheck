# Validation — 18 October 2026 (Melbourne)

## Automated checks

25 standard-library unit/integration tests pass, covering monetary arithmetic and fees, unknown shipping, currency/market scope, extraction evidence and faults, negated condition, CPU conflicts, deduplication, comparison thresholds, chronological data boundaries, synthetic separation, source-change invalidation, price history, human corrections, provider failures, HTTP origin/token protection, and Melbourne dates across UTC midnight.

The browser workflow was exercised in Chromium at 1512px and 390px widths: demo, filters, saved listings, settings/recalculation, sales library, evidence drawer, correction form, and invalid import feedback. The Next.js production build and TypeScript checks pass. Automated WCAG A/AA checks cover the Next.js dashboard, card layout, evidence drawer, settings, import and correction forms, sales library, and mobile views after contrast fixes. This is not a complete accessibility audit.

Reproduce Python checks:

```sh
python3 -m unittest discover -s tests -v
```

Next.js browser QA (separate shells; use disposable data):

```sh
npm ci
FLIPCHECK_BACKEND_PORT=8766 FLIPCHECK_DATA_DIR=/tmp/flipcheck-browser-data npm run dev
```

```sh
npx playwright install chromium
npm run test:browser
```

The script defaults to `http://127.0.0.1:3030`; override `FLIPCHECK_URL` if needed. Set `CHROMIUM_PATH` to reuse an installed compatible Chromium executable. Optional `FLIPCHECK_TEST_INFERENCE=1 npm run test:browser` also imports one synthetic QA listing through Next.js and executes actual Gemma 4 inference in the disposable database.

The regression suite exercises table/card layout, search, filters, saved listings, real mutation round trips for corrections and settings, invalid-import feedback, sales, mobile navigation, accessibility, API-origin/token/upload protection, and unavailable-backend recovery. These checks do not require another paid search request. The optional local-inference import was also verified through the Next.js proxy.

```sh
npm run typecheck
npm run build
```

The Python root now redirects to the Next.js dashboard rather than serving a second static frontend. Backend pricing, imports, credentials, and existing SQLite data remain local. A regression test covers the redirect; another covers numeric evidence spanning CPU and RAM identifiers in a full sentence.

## Actual local model measurement

Tested model: `gemma4:e2b`, digest `b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2`, reported 4.6B parameters, Q4_K_M. Inference is through local Ollama, temperature 0, thinking disabled, 4096-token context and 1000-token generation cap. The runtime is Ollama 0.35.1 and Python 3.14.4 on Linux x86_64, on an AMD Ryzen AI 7 350 with 16 logical CPUs and approximately 30 GiB RAM. No discrete-GPU performance claim is made. See [recorded report](evaluation-result.json) for model metadata and platform details.

The initial full test-laptop extraction returned all seven supported facts with valid source evidence. A frozen 40-case holdout run from the 50-case **synthetic**, hand-authored dataset produced:

| Measurement | Result |
| --- | --- |
| Gemma + validation classification matches | 37 / 40 |
| Keyword baseline classification matches | 40 / 40 |
| Automatically admitted for valuation | 16 / 40 |
| Admitted examples labelled complete laptops | 16 / 16 |
| False admissions among those examples | 0 |
| Mean local extraction latency | 1.62 seconds |
| Total measured benchmark duration | 64.74 seconds |

These are small synthetic examples, not real-world accuracy estimates. The keywords outperform the model on classification in this fixture; no superiority claim is justified. Gemma misclassified one accessory as faulty and two out-of-scope models as complete laptops, but evidence validation prevented those out-of-scope examples from becoming eligible. This demonstrates the importance of the validation boundary, not model infallibility.

The holdout was run once, with labels frozen before execution. Do not tune prompts against this set and continue describing it as unseen. Dataset hash and per-case results are in the report.

```sh
python3 scripts/evaluate.py --split holdout
```

Reports default to ignored `artifacts/`. Subsequent results can vary by model/runtime/hardware; the checked-in report is one observed run.

## Live integration

A real SerpApi eBay AU request was checked against the adapter. A separate end-to-end API scan in a disposable database completed local Gemma 4 analysis of **20 live listings in 45.03 seconds**, using one search request, with no inference failures. Five listings were excluded and fifteen required review; no supported opportunities were claimed. Those counts describe that scan, not provider-wide coverage or accuracy.

The provider's actual accepted domestic filter value was `LH_PrefLoc=1`, despite the documentation's descriptive `Domestic` value being rejected. The adapter handles both string and object shipping shapes, best-offer fixed-price results under the BIN filter, and missing per-item location by disclosing reliance on the domestic filter. Unclear ranges are skipped. Search results and displayed costs do not prove availability or physical condition.

No private key, live response payload, or operational database is included in the repository. Actual API cost depends on the user's plan; total operating cost is not asserted to be zero.

## Still unvalidated

- No genuine sold-price dataset is bundled, and resale prediction error has not been measured on unseen real sales.
- No reseller user study, payment, time-savings result, purchase, or realized profit is claimed.
- Synthetic demo sales are illustrations. They cannot influence real-workspace valuations.
- Model output can be wrong; exact matching intentionally declines incomplete listings. Review and human correction are expected workflows.
- No public hosting, TabPFN integration, autonomous contact, or automatic purchasing is included.

Use [the first-user worksheet](first-user.md) to collect the next meaningful product evidence.
