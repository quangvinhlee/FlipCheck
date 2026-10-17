# Components, terms, and privacy

| Component | Role | License / terms | Boundary |
| --- | --- | --- | --- |
| FlipCheck source | Server, rules, UI, fixtures, tests | MIT, see LICENSE | No third-party JS/CSS is loaded at runtime |
| Python standard library / SQLite | HTTP, database, decimals, HTTP client | Python / SQLite upstream terms | Runs locally; no Python packages needed |
| Ollama | Local inference runtime | [Ollama source and license](https://github.com/ollama/ollama) | User installs separately; default endpoint is loopback |
| Gemma 4 `e2b` | Open-weight extraction model | [Gemma terms](https://ai.google.dev/gemma/terms), model-specific notices apply | User downloads separately; no weights in repository |
| SerpApi | Optional eBay discovery | [API documentation](https://serpapi.com/ebay-search-api) and service terms | Receives queries and API credentials; requires internet/quota |
| Imported records | Listing text and completed sales | Source/user rights and terms | Not redistributed in this repository |
| Synthetic fixtures | Demo and evaluation | Included under application MIT license | Not observed transactions or customer data |

The application license does not relicense model weights, runtimes, provider services, or imported data. Check the terms for the versions you distribute or operate.

The app defaults to local inference, local storage, no cloud fallback, no telemetry, and no remote fonts/assets. An explicitly configured remote `OLLAMA_URL`, cloud database replacement, or future hosting would change that boundary.

The SerpApi adapter uses documented `buying_format=BIN`. During live verification, the service rejected the documentation's descriptive `LH_PrefLoc=Domestic` value; the working request and echoed response used `LH_PrefLoc=1`. This is covered by a contract test and should be rechecked when the provider changes. An AU domestic filter does not physically verify an item's location or availability.

TabPFN-3.5 is not included. Its published [weights license](https://huggingface.co/Prior-Labs/tabpfn_3_5/blob/main/LICENSE) restricts commercial/production and hosted use without separate licensing. An optional future experiment needs an appropriate license and must beat the comparison baseline on unseen real sales.
