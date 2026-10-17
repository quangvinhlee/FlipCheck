"""Hand-authored synthetic fixtures. Replay is labelled and never called model inference."""
from datetime import date, timedelta
from flipcheck.domain import local_date, normalize_listing, normalize_comparison, validate_extraction


def demo_data():
    samples = [
        ("demo-t14-01", "Lenovo ThinkPad T14 Gen 2 Intel i5-1135G7 · 16GB RAM / 512GB SSD", "Good condition. Fully working, charger included. Small marks on the lid.", 240, 15, 2, "Intel", "i5-1135G7", 16, 512, "good", "complete_laptop"),
        ("demo-t14-02", "ThinkPad T14 Gen 2 Intel i5-1135G7 16GB RAM 512GB SSD", "Good condition. Tested by seller; charger included.", 350, 0, 2, "Intel", "i5-1135G7", 16, 512, "good", "complete_laptop"),
        ("demo-t14-03", "ThinkPad T14 Gen 1 AMD Ryzen 5 PRO 4650U 16GB RAM 256GB SSD", "Good condition. Includes charger. Collection or postage available.", 175, 15, 1, "AMD", "Ryzen 5 PRO 4650U", 16, 256, "good", "complete_laptop"),
        ("demo-t14-04", "ThinkPad T14 Gen 3 Intel i7-1260P 32GB RAM 512GB SSD", "Excellent condition. Fully working. Includes USB-C charger.", 480, 20, 3, "Intel", "i7-1260P", 32, 512, "excellent", "complete_laptop"),
        ("demo-t14-05", "Replacement screen for Lenovo ThinkPad T14 Gen 2", "Replacement screen only. Laptop not included.", 49, 8, None, None, None, None, None, None, "accessory"),
        ("demo-t14-06", "ThinkPad T14 Gen 2 Intel i5-1135G7 16GB RAM 512GB SSD", "For parts. BIOS locked. No charger. Untested battery.", 95, 15, 2, "Intel", "i5-1135G7", 16, 512, None, "parts_or_faulty"),
        ("demo-t14-07", "Lenovo ThinkPad T14 laptop · office clearance", "Used laptop. Generation, processor and RAM not specified. Ask seller for details.", 200, None, None, None, None, None, None, None, "uncertain"),
        ("demo-t14-08", "ThinkPad T14 Gen 2 Intel i5-1135G7 16GB RAM 512GB SSD", "Good condition. Shipping quoted after purchase; cost unknown.", 220, None, 2, "Intel", "i5-1135G7", 16, 512, "good", "complete_laptop"),
    ]
    listings = []
    for sid, title, description, price, shipping, gen, variant, cpu, ram, storage, condition, classification in samples:
        raw = {"external_id": sid, "title": title, "description": description, "asking_price": price,
               "inbound_shipping": shipping, "currency": "AUD", "country": "AU", "buying_format": "fixed_price"}
        listing = normalize_listing(raw, synthetic=True)
        values = {"model": ("ThinkPad T14", "ThinkPad T14"), "generation": (gen, f"Gen {gen}"),
                  "variant": (variant, variant), "cpu": (cpu, cpu), "ram_gb": (ram, f"{ram}GB RAM"),
                  "storage_gb": (storage, f"{storage}GB SSD"), "condition": (condition, condition.title() + " condition" if condition else None)}
        draft = {"classification": classification, "reason": "Hand-authored synthetic fixture; inspect the evidence."}
        draft |= {k: {"value": v, "evidence": q if v is not None else None} for k,(v,q) in values.items()}
        extraction = validate_extraction(draft, title + "\n" + description)
        extraction["engine"] = "Synthetic fixture replay (not live Gemma output)"
        listings.append((listing, extraction))
    comparisons = []
    for gen, variant, cpu, ram, storage, condition, prices in [
        (2, "Intel", "i5-1135G7", 16, 512, "good", [420, 440, 450, 470, 480, 490, 510]),
        (1, "AMD", "Ryzen 5 PRO 4650U", 16, 256, "good", [310, 330, 340, 350, 360, 375, 390]),
    ]:
        for i, price in enumerate(prices):
            raw = {"external_id": f"fixture-gen{gen}-{i}", "source": "synthetic_fixture",
                   "reference": f"Synthetic example {gen}.{i + 1}; no actual transaction", "sold_at": (local_date()-timedelta(days=7+i*3)).isoformat(),
                   "collected_at": local_date().isoformat(), "verified": True, "actual_price_known": True,
                   "model": "ThinkPad T14", "generation": gen, "variant": variant, "cpu": cpu,
                   "ram_gb": ram, "storage_gb": storage, "condition": condition, "condition_evidence": "Good condition (synthetic)",
                   "sold_price": price, "shipping": 15, "currency": "AUD", "country": "AU"}
            comparisons.append(normalize_comparison(raw, synthetic=True))
    return listings, comparisons
