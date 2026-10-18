# Importing real evidence

Use **Import data**, choose listings or completed sales, and upload JSON/CSV or paste text. Listing imports must select one enabled search when several exist. Sold sales enter the shared comparison library; configuration matching determines which listings can use them. Limits: 50 listings, 1,000 sales, 2 MB per request. Templates are empty arrays and create no sample records.

JSON accepts an array or an object containing `listings` / `comparisons`. CSV uses a header row, quoted fields for commas/newlines, numeric amounts without currency symbols, and literal `true`/`false` booleans. Empty optional cells mean unknown, not zero.

## Marketplace listings

| Field | Meaning |
| --- | --- |
| `external_id` | Original stable marketplace identity; required when a source URL cannot supply it |
| `title`, `description` | Original seller text, including faults and uncertainty |
| `url` | Original eBay AU item URL, or null for user-supplied records |
| `asking_price`, `inbound_shipping` | AUD amounts; shipping may be null when unknown |
| `currency`, `country` | `AUD`, `AU` |
| `buying_format`, `has_variations` | `fixed_price`, boolean `false` |

An eBay URL is canonicalized to the item identity; tracking parameters do not create duplicates. Unsupported currencies/markets, auctions and variations are rejected. Zero shipping means known free shipping; null prevents margin calculation.

Reimporting the same identity updates it and retains price observations and search matches. Changing source text invalidates prior extraction and correction; a price-only update reuses facts and recalculates costs. Do not invent seller condition or specifications to fill missing fields.

## Completed sales

| Fields | Meaning |
| --- | --- |
| `external_id`, `source`, `reference` | Stable transaction ID, source and traceable original record |
| `sold_at`, `collected_at` | `YYYY-MM-DD`, chronological, not in the future |
| `verified`, `actual_price_known` | Both boolean `true`, asserted by the importer |
| `category`, `brand`, `model` | Supported product category and exact identity |
| `condition`, `condition_evidence` | `good`, `fair`, or `excellent`, with original supporting text |
| `sold_price`, `shipping`, `currency`, `country` | Item price excluding postage, separate postage, `AUD`, `AU` |

Material configuration fields depend on category:

| Category | Required configuration beyond brand/model/condition |
| --- | --- |
| `laptop` | `cpu`, `ram_gb`, `storage_gb`; `gpu` for gaming models |
| `camera` | `bundle`: `body_only` or `kit`; a kit also requires exact `lens` |
| `phone`, `tablet` | `storage_gb`, `lock_status` |
| `console` | `edition`, `storage_gb`, `bundle`: `console_only` or `standard` |
| `gpu` | `vram_gb` |

Additional known `generation`, `variant`, `gpu`, `lens`, etc. participate in identity matching. Integer capacities use GB, with 1024 for 1 TB. Do not guess unknown attributes. Other categories and unspecified camera/console bundles cannot provide automatic valuation. Legacy ThinkPad sale rows can still be imported with their original full configuration; omitted brand/category are adapted explicitly.

Undisclosed accepted-offer prices are unsuitable. FlipCheck cannot independently audit authenticity, inclusion differences or source rights. Synthetic sales and listing imports are rejected; there is no demo import mode.

## Corrections and exports

**Correct** stores confirmed facts and a note as human input, applying the same eligibility checks. The note must explain what was confirmed. Existing fault/conflict evidence still applies; changed seller text invalidates the correction.

**Export workspace** includes real listings, watchlists, matching search IDs, per-search valuation data/history, comparisons and scans. It excludes synthetic records and API credentials. The export is an audit document, not a complete restore format. Back up SQLite for restoration, and treat exports as private source data.
