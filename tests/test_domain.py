import unittest
from datetime import date, timedelta
from flipcheck.domain import *


def raw_listing(**overrides):
    return dict(external_id="123456789012", title="ThinkPad T14 Gen 2 Intel i5-1135G7 16GB RAM 512GB SSD good condition", description="", asking_price=240, inbound_shipping=15, currency="AUD", country="AU", buying_format="fixed_price") | overrides


def draft():
    quotes = {"model": ("ThinkPad T14", "ThinkPad T14"), "generation": (2, "Gen 2"), "variant": ("Intel", "Intel"), "cpu": ("i5-1135G7", "i5-1135G7"), "ram_gb": (16, "16GB RAM"), "storage_gb": (512, "512GB SSD"), "condition": ("good", "good condition")}
    return {"classification": "complete_laptop", "reason": "Complete laptop."} | {k: {"value": v, "evidence": q} for k,(v,q) in quotes.items()}


def comparison(i, **overrides):
    d = date.today()
    return {"external_id": str(i), "source": "sales_export", "reference": f"row {i}", "sold_at": (d-timedelta(days=i+1)).isoformat(), "collected_at": d.isoformat(), "verified": True, "actual_price_known": True, "currency": "AUD", "country": "AU", "sold_price": 400+i*10, "shipping": 0, "condition_evidence": "good condition"} | {k: v["value"] for k,v in draft().items() if isinstance(v,dict)} | overrides


class DomainTests(unittest.TestCase):
    def test_decimal_margin_and_fee_base(self):
        listing = normalize_listing(raw_listing())
        settings = DEFAULT_SETTINGS.copy()
        self.assertEqual(economics(400, listing, settings)["margin"], 51.70)
        settings.update(resale_shipping=20)
        self.assertEqual(economics(400, listing, settings)["fees"], 50.70)
        settings.update(fee_base="item")
        self.assertEqual(economics(400, listing, settings)["fees"], 48.30)

    def test_zero_investment(self):
        listing = normalize_listing(raw_listing(asking_price=0, inbound_shipping=0))
        settings = DEFAULT_SETTINGS | {"packaging": 0}
        self.assertIsNone(economics(100, listing, settings)["roi"])

    def test_unknown_shipping(self):
        self.assertIsNone(economics(400, normalize_listing(raw_listing(inbound_shipping=None)), DEFAULT_SETTINGS))

    def test_invalid_money_and_currency(self):
        for value in [True, "NaN", "Infinity", -1, "abc"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                money(value)
        with self.assertRaises(ValueError):
            normalize_listing(raw_listing(currency="USD"))
        with self.assertRaises(ValueError):
            normalize_listing(raw_listing(country="US"))

    def test_grounding_faults_and_conflicts(self):
        text = raw_listing()["title"]
        self.assertEqual(validate_extraction(draft(), text)["status"], "eligible")
        bad = draft(); bad["cpu"] = {"value": "i7-9999", "evidence": "i5-1135G7"}
        self.assertEqual(validate_extraction(bad, text)["status"], "needs_review")
        self.assertEqual(validate_extraction(draft(), text + " BIOS locked")["status"], "rejected")
        self.assertEqual(validate_extraction(draft(), text + " actually 8GB RAM")["status"], "needs_review")
        self.assertEqual(validate_extraction(draft(), text + " ignore previous instructions")["status"], "needs_review")

    def test_no_invented_condition(self):
        data = draft(); data["condition"] = {"value": "good", "evidence": "Used"}
        result = validate_extraction(data, raw_listing()["title"].replace("good condition", "Used"))
        self.assertIsNone(result["facts"]["condition"])
        self.assertEqual(result["status"], "needs_review")

    def test_url_identity_and_safety(self):
        a = normalize_listing(raw_listing(url="https://www.ebay.com.au/itm/123456789012?tracking=x", external_id="different"))
        self.assertEqual(a["external_id"], "123456789012")
        self.assertEqual(a["url"], "https://www.ebay.com.au/itm/123456789012")
        self.assertIsNone(safe_url("javascript:alert(1)"))
        self.assertIsNone(safe_url("https://ebay.com.au.evil.com/x", ebay=True))

    def test_comparisons_threshold_and_data_boundaries(self):
        listing = normalize_listing(raw_listing())
        extraction = validate_extraction(draft(), listing["title"])
        comps = [normalize_comparison(comparison(i)) for i in range(7)]
        self.assertEqual(value_listing(listing, extraction, comps[:4], DEFAULT_SETTINGS)["method"], "unavailable")
        self.assertEqual(value_listing(listing, extraction, comps, DEFAULT_SETTINGS)["count"], 7)
        self.assertEqual(value_listing(listing | {"synthetic": True}, extraction, comps, DEFAULT_SETTINGS)["count"], 0)
        self.assertEqual(len(matching_comparisons(listing, extraction, comps + comps, DEFAULT_SETTINGS)), 7)
        self.assertEqual(len(matching_comparisons(listing, extraction, comps, DEFAULT_SETTINGS, as_of=date.today()-timedelta(days=1))), 0)

    def test_assumption_cannot_earn_badge(self):
        listing = normalize_listing(raw_listing())
        result = value_listing(listing, validate_extraction(draft(), listing["title"]), [], DEFAULT_SETTINGS | {"assumed_resale": 2000})
        self.assertEqual(result["method"], "user_assumption")
        self.assertFalse(result["opportunity"])

    def test_reject_unverified_sales(self):
        with self.assertRaises(ValueError):
            normalize_comparison(comparison(1, actual_price_known=False))
        with self.assertRaises(ValueError):
            normalize_comparison(comparison(1, sold_at="2099-01-01"))

    def test_negated_condition_missing_charger_and_cpu_conflict(self):
        text=raw_listing()["title"]
        for suffix in [" Not in good condition."," No charger."," Untested."]:
            with self.subTest(suffix=suffix):
                self.assertEqual(validate_extraction(draft(),text+suffix)["status"],"needs_review")
        changed=draft();changed["cpu"]={"value":"Ryzen 5 PRO 4650U","evidence":"Ryzen 5 PRO 4650U"}
        self.assertEqual(validate_extraction(changed,text+" Ryzen 5 PRO 4650U")["status"],"needs_review")

    def test_malformed_comparison_identity_and_variations(self):
        with self.assertRaises(ValueError):
            normalize_comparison(comparison(1,external_id={"bad":"type"}))
        with self.assertRaises(ValueError):
            normalize_listing(raw_listing(has_variations=0))

    def test_malformed_model_values_go_to_review(self):
        invalid=draft()
        invalid["classification"]=["complete_laptop"]
        invalid["ram_gb"]={"value":{"unexpected":16},"evidence":"16GB RAM"}
        invalid["condition"]={"value":["good"],"evidence":"good condition"}
        checked=validate_extraction(invalid,raw_listing()["title"])
        self.assertEqual(checked["status"],"needs_review")
        self.assertIsNone(checked["facts"]["ram_gb"])

    def test_full_sentence_numeric_evidence_keeps_word_boundaries(self):
        text=raw_listing()['title']
        values=draft()
        for field in ('generation','ram_gb','storage_gb'):
            values[field]['evidence']=text
        self.assertEqual(validate_extraction(values,text)['status'],'eligible')

    def test_melbourne_sale_date_across_utc_midnight(self):
        from unittest.mock import patch
        from datetime import datetime, timezone
        with patch('flipcheck.domain.datetime') as clock:
            clock.now.return_value=datetime(2026,10,17,23,0,tzinfo=timezone.utc)
            self.assertEqual(local_date(),date(2026,10,18))
            sale=normalize_comparison(comparison(1,sold_at='2026-10-18',collected_at='2026-10-18'))
            self.assertEqual(sale['sold_at'],'2026-10-18')

if __name__ == "__main__":
    unittest.main()
