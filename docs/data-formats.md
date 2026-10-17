# Importing evidence

Use **Import data** in the dashboard, select listings or sold comparisons, and upload JSON/CSV or paste text. Download a template from the same dialog. Imports are validated before a batch starts. Listing imports are limited to 50 rows; sold comparisons to 1,000 rows; request size to 2 MB.

JSON can be an array or an object containing `listings` / `comparisons`. CSV uses identical field names, a header row, quoted fields for commas/newlines, numeric amounts without currency symbols, and literal `true`/`false` boolean values.

## Marketplace listings

```json
{
  "listings": [
    {
      "external_id": "original-marketplace-item-id",
      "title": "Copy the actual seller title here",
      "description": "Copy seller text, including faults; do not invent condition or specifications.",
      "url": null,
      "asking_price": 240,
      "inbound_shipping": null,
      "currency": "AUD",
      "country": "AU",
      "buying_format": "fixed_price",
      "has_variations": false
    }
  ]
}
```

This is a format illustration, not a real listing. Replace it with actual source data. An eBay Australia item URL can supply the stable item ID and will be canonicalized; tracking parameters do not create duplicates. When no source URL is provided, `external_id` is required. Unknown inbound shipping is `null` (blank in CSV); it prevents margin calculation. Zero means known free shipping, never “unknown.” Other currencies, non-AU listings, auctions, and variations are rejected rather than guessed.

Reimporting an identity updates its data and records a new observation if price/shipping changed. Changing source text invalidates prior extraction and human corrections; a price-only change reuses cached facts and recalculates economics.

## Completed sales

Required fields:

| Field | Meaning |
| --- | --- |
| `external_id`, `source`, `reference` | Stable transaction identity and traceable original record |
| `sold_at`, `collected_at` | ISO dates `YYYY-MM-DD`, chronological and not in the future |
| `verified`, `actual_price_known` | Both must be boolean `true`, asserted by the importer |
| `model` | Exactly `ThinkPad T14` |
| `generation`, `variant`, `cpu` | Generation 1–3, Intel/AMD, exact processor identifier |
| `ram_gb`, `storage_gb` | Integer GB, using 1024 for 1 TB |
| `condition`, `condition_evidence` | `good`, `fair`, or `excellent`, plus original supporting text |
| `sold_price`, `shipping` | Item price excluding shipping, and separate shipping amount, in AUD |
| `currency`, `country` | `AUD`, `AU` |

Use comparable complete laptops with standard inclusions, excluding faulty devices and materially different bundles. Accepted-offer listings with undisclosed actual prices are not suitable comparisons. FlipCheck does not independently verify transaction authenticity, inclusion differences, or source rights. Exact matching can decline many listings; do not fill missing values by guessing to improve coverage.

Synthetic imports are not supported in the real workspace. Use the built-in **synthetic demo** to explore simulated comparisons. The app sets data provenance at the import boundary and does not trust an uploaded `synthetic` flag.

## Corrections and exports

The evidence drawer's **Correct** form stores your confirmed facts and a note as a human correction, recalculates the estimate, and retains a label distinguishing it from model output. Original fault/conflict signals still require review. Changed seller text invalidates the correction.

**Export workspace** downloads the current workspace's settings, listing records with evidence and observations, comparisons, and recent scan history. The export is an audit document, not a full database restore format. Import templates and the underlying SQLite database are the supported data paths. Exports do not include API credentials; they may contain private listings and sales records, so keep them local unless intentionally sharing them.
