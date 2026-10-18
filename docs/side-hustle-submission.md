---
title: "FlipCheck: Helping an Electronics Repairer Find Deals with Local AI"
published: false
tags: devchallenge, hf26challenge, ai, opensource
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 2: Side Hustle](https://dev.to/challenges/hacktoberfest-week2-2026-10-12).*

## What I Built

A friend of mine repairs electronics and resells them. He regularly checks Facebook Marketplace, eBay, and other platforms for used devices, repairable products, and spare parts. A good purchase might be something he can resell, something he can fix, or a donor device with parts for another repair.

The searching takes time: repeat the same queries, open listings, check the photos, work out the specifications, and decide which sellers are worth contacting.

**I built FlipCheck to bring those searches and listing details into one workspace.** It uses Gemma 4 locally to extract product information from seller descriptions, with supporting text beside each assessment.

The current version connects **eBay Australia and nearby Facebook Marketplace**. You can save searches for a Lenovo Legion, a MacBook, and a Fujifilm camera, then scan them together. Each search has its own budget, target margin, and cost assumptions. Facebook searches use a chosen location and pickup radius.

From the combined feed, you can:

- Browse actual seller photos and open the original listings.
- Review extracted specifications, supporting excerpts, and missing details.
- Correct facts, save or dismiss listings, and inspect margin estimates when enough evidence is available.

The potential paying customer is someone running a small electronics repair and resale business. The value I want to test is whether this reduces repetitive checking and helps them decide which listings deserve a closer look.

This is a working local MVP. Scans are started manually. Faulty and parts-only products are currently excluded from normal resale valuation; a dedicated repair and parts workflow is a planned extension inspired by my friend's work.

## Demo

{% embed https://www.youtube.com/watch?v=fQGwvDcWVOQ %}

The walkthrough shows real marketplace results, nearby search controls, seller photos, and the evidence behind the assessments. It includes synthetic narration and captions.

FlipCheck runs locally. To try it, follow the [repository setup instructions](https://github.com/quangvinhlee/FlipCheck#readme). Live discovery requires a SerpApi key for eBay and an Apify token for Facebook.

## Code

[**View FlipCheck on GitHub**](https://github.com/quangvinhlee/FlipCheck)

The application source is MIT-licensed. Model weights, provider services, and marketplace data retain their respective terms.

## How I Built It

**Gemma 4 runs locally through Ollama**, using `gemma4:e2b`. Next.js, React, and TypeScript provide the interface. A Python backend handles marketplace discovery, validation, cost calculations, and local SQLite storage.

SerpApi supplies eBay results, and Apify supplies Facebook Marketplace results. The backend normalises the listings and retains the seller photos. Gemma then extracts the product details from the listing text.

Each extracted fact must include a supporting source excerpt. Python checks those excerpts, required specifications, and conflicting details before valuation. Product categories have different requirements: a camera body needs different comparisons from a kit with a lens, while a gaming laptop needs its GPU configuration.

For nearby Facebook searches, location access happens only after a button click. The app uses rounded coordinates and approximate straight-line distances to filter listings within the selected radius.

One useful lesson came from seeing almost everything labelled **“Needs review.”** That label covered several problems: unknown condition, missing specifications, unknown shipping or pickup costs, and missing completed-sale evidence. I made those reasons visible so the user knows what to check next.

**Live searches collect asking prices. Verified completed-sale comparisons must currently be imported.** The “Worth a closer look” badge requires at least five recent matching verified sales, confirmed product details, known collection/shipping costs, and a margin that meets the target using the lower-quartile resale estimate. A user-entered resale assumption is labelled separately and does not qualify for that badge.

Validation included 59 passing Python tests, TypeScript checks, a production build, and browser checks covering desktop/mobile layouts, accessibility, location controls, and photo galleries. Both marketplace connectors have been exercised with real data; resale accuracy and realised profit still need real-world validation.

I used an AI coding assistant during development, debugging, test writing, and preparation of this submission and demo.

## Why Does Open Innovation Matter?

**Repeated analysis does not require a hosted model charge for every listing.** I can adjust a prompt or product profile and run extraction again locally. That matters for a tool intended to screen listings regularly, although hardware, electricity, and discovery services still have costs.

**I can adapt the model's behaviour to the job.** The model choice, prompts, extraction schema, and validation rules are under my control. That gives me room to develop a repair and parts workflow around how my friend evaluates purchases.

**Listing analysis and records can stay on the user's machine.** With the model downloaded, imported listing text can be processed offline. Corrections and decisions are stored in local SQLite. Live discovery still needs internet: search terms and rounded search coordinates go to the relevant providers, place lookup uses Nominatim, and photos load from marketplace servers.

For FlipCheck, the benefit of open weights is control over where inference runs, how often it runs, and how it can be adapted. I have not fine-tuned the model or measured it against a closed alternative.

## My First User

I showed FlipCheck to the friend whose repair and resale work inspired it. He thought the app was already good and said he would pay for a more complete version with features better suited to his job.

**He has not paid yet.** This is early feedback and conditional willingness to pay. I have not measured time savings or completed a structured sourcing trial with him.

His feedback gives me a direction: develop the repair and parts workflow, agree on the features that matter most to him, and have him try it during a real sourcing session. The next question is whether he keeps using it and finds enough value to pay.

## Prize Categories

- **Best Use of Gemma:** Local product extraction with supporting seller text is central to the workflow.
- **Best Use of SerpApi:** Live eBay Australia discovery brings real listings into the saved product searches.
