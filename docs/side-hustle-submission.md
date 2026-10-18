---
title: "FlipCheck: Helping an Electronics Repairer Find Deals with Local AI"
published: false
tags: devchallenge, hf26challenge, ai, opensource
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 2: Side Hustle](https://dev.to/challenges/hacktoberfest-week2-2026-10-12).*

## What I Built

A friend of mine repairs electronics and resells them. Finding something worth buying means checking Facebook Marketplace, eBay, and other platforms for used devices, spare parts, and damaged products that might be useful for a repair.

For him, a good deal can take several forms: a working device to resell, a repairable device to fix and sell, or a donor device with parts he can use. Each listing needs a closer look before he can decide which of those possibilities makes sense.

**I built FlipCheck to reduce the time he spends checking marketplaces and opening listings one by one.** It is a local AI sourcing desk that brings supported marketplace results into one workspace, extracts the stated product details with Gemma 4, and keeps the original seller text and photos close to the assessment.

The current version connects **eBay Australia and nearby Facebook Marketplace**. He can save searches for several products, run them together, and review a combined feed. A Lenovo Legion, a MacBook, and a Fujifilm camera can each have their own purchase budget, target margin, and cost assumptions. Facebook searches can use his current location or a selected suburb/postcode and pickup radius.

The workflow includes:

- Multiple saved product searches and a combined results feed, with duplicate listings combined within each marketplace.
- Actual seller photos, including a selectable gallery when several photos are available.
- Product-specific checks: a camera body and a camera kit with a lens need different comparisons; a gaming laptop needs its GPU configuration.
- Extracted specifications with supporting seller text, explicit unknowns, human corrections, and saved/dismissed decisions.
- Estimated margins after configured costs, when sufficient evidence is available.

**The practical goal is to give him one place to start his sourcing session**, with enough context to choose which original listings deserve his attention. Scans are currently started manually; continuous monitoring, alerts, and additional marketplace connectors are future work.

His repair work also highlights a gap in this MVP: the current eligibility rules exclude faulty and parts-only items from normal resale valuation. A dedicated repair/parts sourcing mode is a next step, with checks for repair costs, compatible components, and usable donor parts. The app does not yet value those purchases automatically.

My friend is the intended first user. People running similar electronics repair and resale businesses are the potential paying customers. The value I want to test is whether bringing searches and listing details together saves enough repetitive checking to justify paying for it. A user trial, measured time savings, and willingness to pay still need validation.

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

**The model and validation boundary are under my control.** I can choose the installed model and quantization, inspect the extraction schema, and change the behavior for a specific resale niche. The open-weight model runs as part of the local application, with its prompts and validation rules available in the repository. That control will also matter when I develop the repair/parts workflow around the way my friend evaluates purchases.

**Imported data can be processed without sending it to a hosted AI service.** With the model already downloaded and Ollama running locally, imported listing text can be analysed and stored on the user's machine without internet access. The records, corrections, and decisions stay in local SQLite by default.

The boundary matters: live discovery still needs internet. SerpApi receives eBay search terms; Apify/Facebook receive Facebook search terms and rounded coordinates; manual place lookup uses Nominatim; listing photos load from marketplace image servers. FlipCheck is not a completely offline or zero-cost live scanner.

For this product, the concrete benefit of open weights is control over where inference runs and how often it can be repeated. I have not fine-tuned the model or demonstrated that it outperforms a closed model.

## My Agent Session

<!-- Optional: replace this comment with a public DevRelay session link or a valid agent_session embed after reviewing and redacting the transcript. No public session is attached yet. Remove this section if you do not include one. -->

I used an AI coding assistant to iterate on the application, write regression tests, investigate provider response differences, and draft this submission. The development work is also visible in the repository's commit history.

<!-- My First User: the friend described above is the intended first user. Add a visible section after he has actually tried the app, with his real feedback and payment/willingness-to-pay response. No trial or payment is claimed yet. -->

## Prize Categories

Based on the [challenge's listed categories](https://dev.to/challenges/hacktoberfest-week2-2026-10-12):

- **Best Use of Gemma:** Gemma 4 performs the local classification and evidence-grounded product extraction at the core of the workflow.
- **Best Use of SerpApi:** SerpApi supplies live eBay Australia discovery for the saved product searches.

<!-- Before publishing: replace the demo-video placeholder; review the article and AI disclosure; attach a redacted agent session or remove that optional section. Credit any teammates here if applicable. -->
