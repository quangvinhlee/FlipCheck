"""Pure validation and pricing rules. Money crosses the boundary in AUD, uses Decimal."""
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re
from statistics import median
from urllib.parse import urlparse

VERSION = "extract-v1"
SPEC_FIELDS = ("model", "generation", "variant", "cpu", "ram_gb", "storage_gb", "condition")
CLASSIFICATIONS = {"complete_laptop", "accessory", "parts_or_faulty", "out_of_scope", "uncertain"}
DEFAULT_SETTINGS = {
    "query": "Lenovo ThinkPad T14", "max_price": 500, "min_margin": 60,
    "fee_rate": 12, "fixed_fee": 0.30, "fee_base": "receipts",
    "packaging": 5, "repairs": 0, "outbound_shipping": 20,
    "resale_shipping": 0, "risk_allowance": 20, "labour": 0,
    "assumed_resale": None, "recency_days": 90,
}


def now():
    return datetime.now(timezone.utc).isoformat()


def money(value, *, nullable=False):
    if value is None or value == "":
        if nullable:
            return None
        raise ValueError("A required amount is missing.")
    if isinstance(value, bool):
        raise ValueError("Amounts must be numbers, not booleans.")
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount < 0 or amount > 10_000_000:
            raise ValueError("Amounts must be finite, non-negative, and below AUD 10 million.")
        return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation:
        raise ValueError("Invalid monetary amount.") from None


def as_number(value):
    return None if value is None else float(value)


def validate_settings(data):
    if not isinstance(data, dict):
        raise ValueError("Settings must be an object.")
    settings = DEFAULT_SETTINGS | {k: v for k, v in data.items() if k in DEFAULT_SETTINGS}
    query = settings["query"]
    if not isinstance(query, str) or not query.strip() or len(query) > 150:
        raise ValueError("Search query must be 1–150 characters.")
    settings["query"] = query.strip()
    for key in DEFAULT_SETTINGS:
        if key not in {"query", "fee_base", "recency_days"}:
            settings[key] = as_number(money(settings[key], nullable=key == "assumed_resale"))
    if settings["fee_rate"] > 100:
        raise ValueError("Fee percentage cannot exceed 100.")
    if settings["fee_base"] not in {"receipts", "item"}:
        raise ValueError("Fee base must be receipts or item.")
    days = settings["recency_days"]
    if isinstance(days, bool) or not isinstance(days, int) or not 1 <= days <= 365:
        raise ValueError("Comparison window must be 1–365 whole days.")
    return settings


def safe_url(value, *, ebay=False):
    if not isinstance(value, str):
        return None
    try:
        p = urlparse(value)
        if p.scheme not in {"http", "https"} or not p.hostname or p.username or p.password:
            return None
        if ebay and not (p.hostname == "ebay.com.au" or p.hostname.endswith(".ebay.com.au")):
            return None
        return value
    except ValueError:
        return None


def normalize_listing(raw, *, synthetic=False):
    if not isinstance(raw, dict):
        raise ValueError("Each listing must be an object.")
    title = raw.get("title")
    if not isinstance(title, str) or not title.strip() or len(title) > 500:
        raise ValueError("Listing title must contain 1–500 characters.")
    description = raw.get("description", "")
    if not isinstance(description, str) or len(description) > 12000:
        raise ValueError("Listing description is limited to 12,000 characters.")
    url = safe_url(raw.get("url"), ebay=True)
    external_id = str(raw.get("external_id", "")).strip()
    if url:
        match = re.search(r"/itm/(?:[^/]+/)?(\d{9,15})(?:[/?]|$)", url)
        if match:
            external_id = match.group(1)
            url = f"https://www.ebay.com.au/itm/{external_id}"
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", external_id):
        raise ValueError("Provide a stable external_id or a valid eBay Australia item URL.")
    currency = raw.get("currency", "AUD")
    if currency != "AUD":
        raise ValueError("Only AUD listings are supported; currencies are never silently converted.")
    if raw.get("country") != "AU" or raw.get("buying_format") != "fixed_price":
        raise ValueError("Only explicitly domestic AU fixed-price listings are supported.")
    if raw.get("has_variations") not in {None, False}:
        raise ValueError("Multi-variation listings require manual inspection and are not supported.")
    return {
        "external_id": external_id, "marketplace": "demo" if synthetic else "ebay_au",
        "title": title.strip(), "description": description, "url": url,
        "asking_price": as_number(money(raw.get("asking_price"))),
        "inbound_shipping": as_number(money(raw.get("inbound_shipping"), nullable=True)),
        "currency": "AUD", "country": "AU", "buying_format": "fixed_price",
        "synthetic": synthetic,
    }


def canonical(value):
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


def source_text(listing):
    return listing["title"] + "\n" + listing.get("description", "")


def validate_extraction(draft, text):
    """Fail closed: a syntactically valid model answer may still be unsupported."""
    errors, facts, evidence = [], {}, {}
    if not isinstance(draft, dict):
        return {"classification": "uncertain", "facts": {}, "evidence": {}, "errors": ["Model output is not an object."], "status": "needs_review", "reason": "Extraction failed validation."}
    classification = draft.get("classification")
    if classification not in CLASSIFICATIONS:
        classification = "uncertain"
        errors.append("Unknown classification.")
    for field in SPEC_FIELDS:
        item = draft.get(field)
        if not isinstance(item, dict):
            facts[field] = None
            continue
        value, quote = item.get("value"), item.get("evidence")
        if value is None:
            facts[field] = None
            continue
        if not isinstance(quote, str) or not quote.strip() or quote not in text:
            errors.append(f"{field}: evidence does not occur in the listing.")
            facts[field] = None
            continue
        valid = True
        if field in {"generation", "ram_gb", "storage_gb"}:
            valid = type(value) is int and value in ({1, 2, 3} if field == "generation" else ({4, 8, 16, 24, 32, 40, 48, 64} if field == "ram_gb" else {128, 256, 512, 1024, 2048}))
            units = [str(value)] if field != "storage_gb" or value not in {1024, 2048} else [str(value), str(value // 1024) + "tb"]
            valid = valid and any(re.search(r"(?<!\d)" + re.escape(u) + r"(?!\d)", canonical(quote)) for u in units)
        elif field == "model":
            valid = value == "ThinkPad T14" and "t14" in canonical(quote) and not re.search(r"t14s|t14p", canonical(quote))
        elif field == "variant":
            valid = value in {"Intel", "AMD"} and value.lower() in quote.lower()
        elif field == "condition":
            aliases = {"good": ("good",), "excellent": ("excellent", "mint"), "fair": ("fair",)}
            valid = value in aliases and any(word in quote.lower() for word in aliases.get(value, ()))
        else:
            valid = isinstance(value, str) and 3 <= len(value) <= 100 and canonical(value) in canonical(quote)
        facts[field] = value if valid else None
        if valid:
            evidence[field] = quote
        else:
            errors.append(f"{field}: value is unsupported or outside the supported scope.")
    lower = text.lower()
    fault = re.search(r"\b(for parts|not working|broken|bios locked|bios password|password locked|cracked screen|battery dead|no power|spares only)\b", lower)
    accessory = re.search(r"\b(box only|charger only|screen only|dock only|replacement screen|replacement keyboard)\b", lower)
    injection = re.search(r"ignore (?:all |previous |the )*(?:instructions|rules)|system prompt|return .*complete_laptop", lower)
    if fault:
        classification = "parts_or_faulty"
    elif accessory:
        classification = "accessory"
    if injection:
        errors.append("Instruction-like text in the listing requires human review.")
    # Detect common specification conflicts independently of the model.
    gens = set(re.findall(r"\bgen(?:eration)?\s*([1-3])\b", lower))
    rams = set(re.findall(r"\b(4|8|16|24|32|40|48|64)\s*gb\s*(?:ram|memory)\b", lower))
    if len(gens) > 1 or len(rams) > 1:
        errors.append("Conflicting generation or memory specifications.")
    if classification in {"accessory", "parts_or_faulty", "out_of_scope"}:
        status = "rejected"
    elif classification == "complete_laptop" and all(facts.get(k) is not None for k in SPEC_FIELDS) and not errors:
        status = "eligible"
    else:
        status = "needs_review"
    missing = [k for k in SPEC_FIELDS if facts.get(k) is None]
    reason = str(draft.get("reason", ""))[:500] or "Review extracted evidence before buying."
    if fault:
        reason = f"Seller text mentions ‘{fault.group(0)}’."
    elif accessory:
        reason = f"Accessory signal: ‘{accessory.group(0)}’."
    return {"classification": classification, "facts": facts, "evidence": evidence,
            "errors": errors, "unknown_fields": missing, "status": status, "reason": reason}


def normalize_comparison(raw, *, synthetic=False):
    if not isinstance(raw, dict):
        raise ValueError("Each sold comparison must be an object.")
    for key in ("external_id", "source", "reference", "sold_at", "collected_at", *SPEC_FIELDS):
        if raw.get(key) is None or raw.get(key) == "":
            raise ValueError(f"Sold comparison requires {key}.")
    for key in ("verified", "actual_price_known"):
        if raw.get(key) is not True:
            raise ValueError(f"Sold comparisons require {key}=true; asking prices are not sales.")
    if raw.get("currency") != "AUD" or raw.get("country") != "AU":
        raise ValueError("Sold comparisons must be domestic AU sales in AUD.")
    sold_at = date.fromisoformat(raw["sold_at"])
    collected = date.fromisoformat(raw["collected_at"])
    if sold_at > date.today() or collected > date.today() or collected < sold_at:
        raise ValueError("Sale and collection dates must be chronological and not in the future.")
    if raw["model"] != "ThinkPad T14" or type(raw["generation"]) is not int or raw["generation"] not in {1, 2, 3}:
        raise ValueError("Only ThinkPad T14 Gen 1–3 comparisons are supported.")
    if raw["variant"] not in {"Intel", "AMD"} or raw["condition"] not in {"good", "excellent", "fair"}:
        raise ValueError("Unsupported comparison variant or condition.")
    if type(raw["ram_gb"]) is not int or raw["ram_gb"] not in {4, 8, 16, 24, 32, 40, 48, 64}:
        raise ValueError("Invalid comparison memory.")
    if type(raw["storage_gb"]) is not int or raw["storage_gb"] not in {128, 256, 512, 1024, 2048}:
        raise ValueError("Invalid comparison storage.")
    if not isinstance(raw["cpu"], str) or not raw["cpu"].strip() or len(raw["cpu"]) > 100:
        raise ValueError("Comparison CPU is required.")
    result = {k: raw[k] for k in ("external_id", "source", "reference", "sold_at", "collected_at", *SPEC_FIELDS)}
    result |= {"synthetic": synthetic, "verified": True, "actual_price_known": True, "currency": "AUD", "country": "AU",
               "sold_price": as_number(money(raw.get("sold_price"))),
               "shipping": as_number(money(raw.get("shipping"))), "condition_evidence": str(raw.get("condition_evidence", ""))[:2000]}
    if not result["condition_evidence"]:
        raise ValueError("Comparison requires condition_evidence from the sale record.")
    return result


def matching_comparisons(listing, extraction, comparisons, settings, *, as_of=None):
    as_of = as_of or date.today()
    facts = extraction.get("facts", {})
    matched, seen = [], set()
    for comp in comparisons:
        identity = (comp["source"], comp["external_id"])
        age = (as_of - date.fromisoformat(comp["sold_at"])).days
        if identity in seen or not 0 <= age <= settings["recency_days"]:
            continue
        if date.fromisoformat(comp["collected_at"]) > as_of:
            continue
        if bool(comp.get("synthetic")) != bool(listing.get("synthetic")):
            continue
        if any(canonical(comp.get(k)) != canonical(facts.get(k)) for k in SPEC_FIELDS):
            continue
        if comp.get("verified") is not True or comp.get("actual_price_known") is not True:
            continue
        seen.add(identity)
        matched.append(comp)
    return sorted(matched, key=lambda x: x["sold_at"], reverse=True)


def economics(resale, listing, settings):
    if listing.get("inbound_shipping") is None:
        return None
    value = money(resale)
    receipts = value + money(settings["resale_shipping"])
    invested = sum(money(x) for x in (listing["asking_price"], listing["inbound_shipping"], settings["repairs"], settings["packaging"]))
    fee_base = receipts if settings["fee_base"] == "receipts" else value
    fees = (fee_base * money(settings["fee_rate"]) / 100 + money(settings["fixed_fee"])).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
    deductions = sum(money(settings[k]) for k in ("outbound_shipping", "risk_allowance", "labour"))
    margin = receipts - invested - fees - deductions
    roi = None if not invested else (margin / invested * 100).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
    return {"resale": float(value), "receipts": float(receipts), "cash_invested": float(invested), "fees": float(fees), "margin": float(margin), "roi": as_number(roi)}


def quartile(values, fraction):
    """Linear interpolated empirical quantile; descriptive, not predictive coverage."""
    values = sorted(Decimal(str(v)) for v in values)
    pos = Decimal(len(values) - 1) * Decimal(str(fraction))
    low = int(pos)
    high = min(low + 1, len(values) - 1)
    return float((values[low] + (values[high] - values[low]) * (pos - low)).quantize(Decimal(".01")))


def value_listing(listing, extraction, comparisons, settings):
    matched = matching_comparisons(listing, extraction, comparisons, settings)
    result = {"method": "unavailable", "comparisons": matched, "count": len(matched), "scenarios": {},
              "opportunity": False, "reason": "Insufficient comparable sales (at least 5 required).", "costs": settings.copy(), "valued_at": now()}
    if extraction.get("status") != "eligible":
        result["reason"] = "Resolve extraction or listing eligibility before valuation."
        return result
    if listing["asking_price"] > settings["max_price"]:
        result["reason"] = "Asking price exceeds your watchlist budget."
        return result
    if len(matched) >= 5:
        prices = [x["sold_price"] for x in matched]
        prices = {"low": quartile(prices, .25), "median": float(median(prices)), "high": quartile(prices, .75)}
        result["method"] = "synthetic_comparisons" if listing.get("synthetic") else "verified_comparisons"
        result["range"] = prices
    elif settings.get("assumed_resale") is not None:
        prices = {"assumed": settings["assumed_resale"]}
        result["method"] = "user_assumption"
        result["range"] = prices
    else:
        return result
    result["scenarios"] = {k: economics(v, listing, settings) for k, v in prices.items()}
    if listing.get("inbound_shipping") is None:
        result["reason"] = "Inbound shipping is unknown; margin cannot be calculated."
        return result
    if result["method"] == "user_assumption":
        result["reason"] = "User-entered resale assumption; no evidence-backed opportunity badge."
    else:
        result["opportunity"] = result["scenarios"]["low"]["margin"] >= settings["min_margin"]
        result["reason"] = "Conservative margin meets your target; inspect the original listing." if result["opportunity"] else "Conservative estimated margin is below your target."
        if listing.get("synthetic"):
            result["reason"] = "Synthetic demonstration only. " + result["reason"]
    return result
