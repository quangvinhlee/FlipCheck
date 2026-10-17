# FlipCheck

**Find your next good flip. Keep the evidence.**

A local, Gemma 4-powered deal scout for Australian used-laptop resellers. FlipCheck turns eBay listings into a shortlist with supported specifications, comparable sales, and margins after explicit costs. The initial niche is ThinkPad T14 Gen 1–3.

![FlipCheck dashboard showing clearly labelled synthetic examples](docs/dashboard.png)

## Run locally

Node.js **20.9+** (24 recommended) and Python **3.11+**. The Next.js frontend lives in `frontend/`; the local Python/SQLite analysis API lives in `flipcheck/`. No extra Python packages or database service are required.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:3030**. The root command starts Next.js and the Python service together, or reuses an existing healthy local API on port 8765. The backend homepage redirects to the Next.js dashboard. Select **Explore synthetic demo** for an offline walkthrough with eight hand-authored listings and fourteen simulated sold comparisons. Demo replay does not call Gemma or SerpApi, and is visibly separated from your real workspace.

For live local analysis, install [Ollama](https://ollama.com/) and the model:

```sh
ollama pull gemma4:e2b
```

Ollama must be running. FlipCheck defaults to the locally installed `gemma4:e2b`; it never substitutes a hosted model. Use **Analyse again** in the evidence drawer to run the actual model on a demo example.

## Configure live search

Copy the template once, then edit `.env`:

```sh
cp .env.example .env
```

```dotenv
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma4:e2b
SERPAPI_KEY=your_private_key
```

Restart FlipCheck after changes. Shell environment variables take precedence. Keep keys in `.env`, never `.env.example`; `.env`, `.env.local`, databases, and private reports are Git-ignored. Existing `.env` files should be edited rather than overwritten.

**Scan eBay** performs one capped search (at most one transient retry), analyses at most 20 results locally, and preserves partial results. Search requires a SerpApi account and available quota. Queries are sent to SerpApi; a live scanner is not fully offline or completely private. No automatic purchases or seller messages occur.

The adapter requests eBay Australia, fixed-price results, and the domestic filter. Missing per-item location is explicitly labelled as relying on that filter; confirm location on the original listing. Fixed-price listings with a best-offer option are accepted only under the fixed-price search filter. Price ranges and unclear currencies are skipped. Availability is not verified.

## What works

- Live eBay Australia discovery through SerpApi, with bounded retries and visible errors.
- JSON/CSV imports, local Gemma 4 extraction, source excerpts, validation, and review states.
- Exact-configuration sold-comparison matching, empirical resale quartiles, and decimal-based margin/ROI calculations.
- An explicit resale assumption fallback when verified comparisons are unavailable; assumptions cannot earn an evidence-backed opportunity badge.
- Editable watchlist, fees, shipping, repairs, packaging, risk, and labour assumptions.
- Saved/dismissed decisions, human corrections, price observations, scan history, and JSON export.
- A redesigned Next.js/TypeScript dashboard with table and card views, local fonts, mobile navigation, accessible dialogs, and separate synthetic/real workspaces.
- Local SQLite persistence, with Python handling analysis and Next.js proxying only the approved loopback API endpoints.

## Evidence before estimates

A comparison-based estimate requires at least **five** recent sales matching model, generation, CPU platform and identifier, RAM, SSD, and seller-stated condition. Five is a guardrail, not a statistical reliability guarantee. Quartiles describe that sample; they are not calibrated prediction intervals.

Sold data must be supplied from genuine completed sales, with source references and actual transaction prices. User-asserted verification is not an independent audit. No real sales dataset is bundled. Import templates are available in the dashboard. See [data formats](docs/data-formats.md).

Unknown condition is not silently rated “good.” Unsupported extraction, conflicting specifications, faults, and unknown costs prevent supported opportunities. Inbound shipping must be known before margin calculation. Seller claims still need physical inspection.

Default costs are **illustrative**, not current eBay rates. Estimates are in AUD and pre-tax; owner labour is excluded unless configured. TabPFN is deferred because the initial MVP does not require it and the published 3.5 weights have commercial restrictions.

## Check and evaluate

```sh
python3 -m unittest discover -s tests -v
npm run typecheck                     # Next.js route types + TypeScript
npm run build                         # production build
python3 scripts/evaluate.py           # real local inference on 40 synthetic holdout cases
```

The evaluation fixture has 50 hand-authored synthetic examples: 10 development and 40 holdout. It is not marketplace evidence. The recorded run classified 37/40 correctly versus 40/40 for a simple keyword baseline; 16/16 automatically admitted examples were complete laptops. This does not prove real-world accuracy or superiority. See [validation results and limitations](docs/validation.md).

The browser regression script is in [scripts/browser-smoke.cjs](scripts/browser-smoke.cjs). Playwright and axe are development dependencies; see [validation](docs/validation.md) for disposable-data test setup. Local fonts are bundled with the frontend, so the UI makes no font/CDN requests.

## Storage and architecture

```text
eBay / local import → normalize → local Gemma 4 → validate evidence
   → exact sold comparisons / explicit user assumption → decimal economics
   → local SQLite → shortlist, corrections, and audit history
```

Local data lives in `.data/flipcheck.sqlite3`. Back up that directory while the app is stopped. Both servers bind only to `127.0.0.1`. Next.js checks request origin and proxies a fixed list of loopback endpoints; the Python API retains Host/origin checks and per-session tokens for mutations. It is a single-user local application, not a production public web service. No telemetry or cloud fallback is included. Pointing `OLLAMA_URL` at a remote server changes the privacy boundary.

```sh
# Optional production mode; still local, with the same Python service.
npm run build
npm start

# Optional custom ports and data location.
FLIPCHECK_BACKEND_PORT=8766 FLIPCHECK_WEB_PORT=3031 FLIPCHECK_DATA_DIR=/path/to/private/data npm run dev
```

Run `python3 -m flipcheck` separately only if you want to manage the API yourself. The root launcher does not stop a pre-existing API when it exits. Stop both owned processes with Ctrl+C. Root `.env` stores backend credentials; never add private keys to `NEXT_PUBLIC_*` variables.

Frontend source map:

- `frontend/app/page.tsx` and `layout.tsx`: Next.js entry and local fonts.
- `frontend/components/dashboard.tsx`: navigation, filters, cards, and tables.
- `frontend/components/evidence.tsx` and `forms.tsx`: evidence, settings, imports, corrections.
- `frontend/app/globals.css`: responsive design and shared styles.
- `frontend/app/api/[...path]/route.ts`: the server-side API bridge.
- `frontend/lib/`: typed state, cancellable polling, formatting, and import parsing.

For tests and screenshots, use a temporary data directory rather than importing fictional data into your real workspace.

## Project and challenge

- [Implementation plan](plan.md)
- [Validation and measured model details](docs/validation.md)
- [First-user interview worksheet](docs/first-user.md)
- [Component licenses and privacy boundaries](docs/components.md)
- [Challenge submission checklist](docs/submission.md)

Application code: [MIT](LICENSE). Model weights, runtimes, search services, and imported data retain their own terms. No weights or private customer data are distributed here.
