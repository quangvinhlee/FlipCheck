---
title: "FlipCheck: A Local Gemma Deal Scout for Used-Tech Resellers"
published: false
tags: devchallenge, hf26challenge, ai, opensource
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 2: Side Hustle](https://dev.to/challenges/hacktoberfest-week2-2026-10-12).*

## What I Built

A cheap camera can become an expensive purchase once you add collection, repairs, selling fees, and postage. Before a reseller can calculate any of that, they have to work out what the seller is actually offering.

**FlipCheck is a local AI sourcing desk for Australian used-tech resellers.** It brings eBay Australia and nearby Facebook Marketplace listings into one workspace, uses Gemma 4 to extract product details, and keeps the supporting seller text beside each assessment.

You can track a Lenovo Legion, a MacBook, and a Fujifilm camera at the same time. Each saved search has its own purchase budget, target margin, and cost assumptions. For Facebook, you can choose your current location or a suburb/postcode and set a pickup radius.

The workflow includes:

- Multiple product searches, scanned together, with duplicate listings combined within each marketplace.
- Actual seller photos, including a selectable gallery when several photos are available.
- Product-specific checks: a camera body and a camera kit with a lens need different comparisons; a gaming laptop needs its GPU configuration.
- Source excerpts, explicit unknowns, human corrections, and saved/dismissed decisions.
- Estimated margins after configured costs, when sufficient evidence is available.

The intended paying customer is a solo reseller who spends time repeatedly opening listings, comparing configurations, and working out whether a purchase makes financial sense. The paid-value hypothesis is less repetitive screening and a clearer shortlist. Customer payment and willingness to pay still need validation; this is a working local MVP.

## Demo

**Demo video:** _Add the public recording link here before publishing._

<!-- Suggested recording: add laptop and camera searches; enable Facebook and choose a pickup area; scan; open a real listing and switch seller photos; inspect extracted facts and their evidence; show the specific reasons an estimate is blocked. Keep API keys and private data out of the recording. -->

![FlipCheck multi-product dashboard with real marketplace results](https://raw.githubusercontent.com/quangvinhlee/FlipCheck/main/docs/dashboard.png)

FlipCheck runs locally. The dashboard at `http://127.0.0.1:3030` is a local development address, not a public hosted demo.

To try it, clone the repository and follow its setup instructions. With Node.js, Python, Ollama, and the configured credentials available:

```sh
npm ci
ollama pull gemma4:e2b
npm run dev
```

Live eBay discovery requires a SerpApi key. Facebook discovery uses a separate Apify token. The application does not preload fictional listings or sales.

## Code

**Repository:** [github.com/quangvinhlee/FlipCheck](https://github.com/quangvinhlee/FlipCheck)

- [Setup and architecture](https://github.com/quangvinhlee/FlipCheck/blob/main/README.md)
- [Product profiles and evidence validation](https://github.com/quangvinhlee/FlipCheck/blob/main/flipcheck/products.py)
- [Multi-source scan orchestration](https://github.com/quangvinhlee/FlipCheck/blob/main/flipcheck/service.py)
- [Validation results and limitations](https://github.com/quangvinhlee/FlipCheck/blob/main/docs/validation.md)

The application source is MIT-licensed. Model weights, provider services, and marketplace data retain their respective terms.

## How I Built It

The core AI is **Gemma 4, running locally through Ollama**, using the `gemma4:e2b` model tag. The interface is Next.js, React, and TypeScript. A Python standard-library backend handles discovery, validation, decimal-based economics, and local SQLite persistence.

The data flow is:

```text
Saved product searches + selected marketplaces
    → SerpApi eBay results / Apify Facebook results
    → normalized listings and original seller photos
    → local Gemma extraction with source excerpts
    → ordinary-code validation and category-specific checks
    → matching completed sales + explicit costs
    → shortlist, review reasons, and local history
```

Gemma interprets the unstructured listing text: what product is being offered, which specifications are stated, and whether the text describes accessories or faulty hardware. Each non-null extracted fact must include a verbatim source excerpt. Python then checks those values, required fields, contradictions, and configuration identities before valuation.

For nearby Facebook discovery, the app requests location only after a button click. It rounds the search coordinates and calculates approximate straight-line distances from published listing coordinates. Results without usable coordinates, or outside the selected radius, are excluded. A map pin still needs checking against the actual pickup address.

One of the most useful lessons came from using the app: **everything initially looked like “Needs review.”** That label hid several different problems. Some listings lacked supported condition information, some needed reanalysis after the extraction contract changed, and the workspace had no completed-sale evidence.

I made those blockers visible. The dashboard now explains when sales evidence is missing, and each listing distinguishes unknown condition, missing specifications, unknown shipping or pickup costs, and outdated extraction.

“Worth a closer look” has a specific meaning: the listing passes the checks, has at least five recent matching verified completed-sale comparisons, has known collection/shipping costs, and meets the configured margin target under the lower-quartile resale scenario. Those quartiles describe the supplied sample; they are not a guarantee of resale value.

**The current scanner collects asking-price listings. It does not automatically collect verified completed transactions.** Genuine sold comparisons must currently be imported. An explicit user resale assumption is labelled as an assumption and does not earn an evidence-backed opportunity badge. This is the main gap to close before claiming a fully automated deal-finding product.

Validation includes **59 passing Python tests**, TypeScript checks, a successful production build, and browser checks for desktop/mobile layouts, accessibility, location controls, and photo galleries. Both discovery providers have been exercised with real data. This establishes working integration paths, not real-world resale accuracy or realized profit.

## Why Does Open Innovation Matter?

**Local inference makes repeated screening practical.** I can run extraction again after changing a prompt, adjusting a product profile, or correcting a parser without paying a hosted model provider for each inference. Hardware, electricity, and discovery services still have costs.

**The model and validation boundary are under my control.** I can choose the installed model and quantization, inspect the extraction schema, and change the behavior for a specific resale niche. The implementation uses an open-weight model as a working part of the product, rather than requiring a hosted model endpoint for every listing.

**Imported data can be processed without sending it to a hosted AI service.** With the model already downloaded and Ollama running locally, imported listing text can be analysed and stored on the user's machine without internet access. The records, corrections, and decisions stay in local SQLite by default.

The boundary matters: live discovery still needs internet. SerpApi receives eBay search terms; Apify/Facebook receive Facebook search terms and rounded coordinates; manual place lookup uses Nominatim; listing photos load from marketplace image servers. FlipCheck is not a completely offline or zero-cost live scanner.

For this product, the concrete benefit of open weights is control over where inference runs and how often it can be repeated. I have not fine-tuned the model or demonstrated that it outperforms a closed model.

## My Agent Session

<!-- Optional: replace this comment with a public DevRelay session link or a valid agent_session embed after reviewing and redacting the transcript. No public session is attached yet. Remove this section if you do not include one. -->

I used an AI coding assistant to iterate on the application, write regression tests, investigate provider response differences, and draft this submission. The development work is also visible in the repository's commit history.

<!-- My First User is intentionally omitted: no external user study, customer payment, or willingness-to-pay result has been verified. Add that section only after an actual user session. -->

## Prize Categories

Based on the [challenge's listed categories](https://dev.to/challenges/hacktoberfest-week2-2026-10-12):

- **Best Use of Gemma:** Gemma 4 performs the local classification and evidence-grounded product extraction at the core of the workflow.
- **Best Use of SerpApi:** SerpApi supplies live eBay Australia discovery for the saved product searches.

<!-- Before publishing: replace the demo-video placeholder; review the article and AI disclosure; attach a redacted agent session or remove that optional section. Credit any teammates here if applicable. -->
