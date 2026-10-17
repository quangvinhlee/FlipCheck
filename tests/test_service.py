import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from flipcheck.service import App
from flipcheck.store import Store
from flipcheck.domain import normalize_listing
from flipcheck.server import create_server
from flipcheck.providers import parse_serpapi, ProviderError
from test_domain import raw_listing, draft, comparison


class FakeModel:
    model = "test-model"
    def health(self):
        return {"available": True, "model": self.model, "digest": "test-digest"}
    def extract(self, text):
        return draft(), {"elapsed_seconds": .01}


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name)/"test.sqlite3")
        self.app = App(self.store, model=FakeModel())
    def tearDown(self):
        self.temp.cleanup()
    def wait_job(self):
        for _ in range(100):
            if self.app.job["status"] != "running":
                return
            time.sleep(.02)
        self.fail("Background job did not finish")
    def test_demo_is_separate_persistent_and_deduplicated(self):
        self.app.load_demo(); self.app.load_demo()
        state=self.app.state()
        self.assertEqual(len(state["listings"]),8)
        self.assertEqual(len(state["comparisons"]),14)
        self.assertEqual(state["counts"]["excluded"],2)
        self.assertGreater(state["counts"]["opportunities"],0)
        self.assertTrue(all(x["synthetic"] for x in state["listings"]))
        self.app.set_mode("local")
        self.assertEqual(len(self.app.state()["listings"]),0)
        self.app.set_mode("demo")
        self.assertEqual(len(Store(self.store.path).listings(True)),8)
    def test_import_analyse_decision_and_price_history(self):
        self.app.start("import",[raw_listing()]); self.wait_job()
        item=self.app.state()["listings"][0]
        self.assertEqual(item["extraction"]["status"],"eligible")
        self.app.decision(item["id"],"saved")
        self.app.start("import",[raw_listing(asking_price=200)]); self.wait_job()
        item=self.app.state()["listings"][0]
        self.assertEqual(item["decision"],"saved")
        self.assertEqual(len(item["observations"]),2)
        self.assertTrue(item["extraction"]["cached"])
    def test_comparison_import_is_validated_before_writes(self):
        with self.assertRaises(ValueError):
            self.app.import_comparisons([comparison(1),comparison(2,verified=False)])
        self.assertEqual(self.store.comparisons(False),[])
    def test_human_correction_and_shipping_recalculate(self):
        self.app.load_demo()
        item=next(x for x in self.app.state()["listings"] if x["external_id"]=="demo-t14-08")
        self.assertIsNone(item["inbound_shipping"])
        self.app.correct(item["id"],{"note":"Seller confirmed inbound shipping is AUD 15.","extraction":draft(),"inbound_shipping":15})
        updated=self.store.listing(item["id"])
        self.assertEqual(updated["inbound_shipping"],15)
        self.assertEqual(updated["extraction"]["engine"],"Human correction")
    def test_http_origin_token_and_invalid_input(self):
        server=create_server(self.app,0)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        base=f"http://127.0.0.1:{server.server_port}"
        try:
            with urlopen(base+"/api/state") as response: state=json.load(response)
            req=Request(base+"/api/demo",data=b'{}',headers={"Content-Type":"application/json"})
            with self.assertRaises(HTTPError) as error: urlopen(req)
            self.assertEqual(error.exception.code,403)
            error.exception.close()
            req.add_header("X-FlipCheck-Token",state["csrf_token"])
            with urlopen(req) as response: self.assertEqual(response.status,200)
            req.add_header("Origin","https://example.com")
            with self.assertRaises(HTTPError) as error: urlopen(req)
            self.assertEqual(error.exception.code,403)
            error.exception.close()
        finally:
            server.shutdown();server.server_close();thread.join()
    def test_provider_normalization(self):
        row={"title":raw_listing()["title"],"product_id":"123456789012","link":"https://www.ebay.com.au/itm/123456789012", "price":{"raw":"AU $240.00","extracted":240},"shipping":"Free postage","location":"Located in Australia","buying_format":"buy_it_now"}
        accepted,skipped=parse_serpapi({"organic_results":[row,row|{"price":{"from":{"extracted":10},"to":{"extracted":50}}},row|{"location":"Located in United States"}]})
        self.assertEqual(len(accepted),1)
        self.assertEqual(accepted[0]["inbound_shipping"],0)
        self.assertEqual(len(skipped),2)

    def test_live_provider_contract_uses_echoed_domestic_filter(self):
        row={"title":raw_listing()["title"], "product_id":"123456789012", "price":{"raw":"AU $240.00","extracted":240}, "shipping":{"raw":"+AU $15.00 delivery","extracted":15}, "buying_format":"accepts_offers"}
        parameters={"LH_PrefLoc":"1","ebay_domain":"ebay.com.au","buying_format":"BIN"}
        accepted,skipped=parse_serpapi({"search_parameters":parameters,"organic_results":[row]})
        self.assertEqual(len(accepted),1)
        self.assertEqual(accepted[0]["inbound_shipping"],15)
        self.assertIn("domestic AU search filter",accepted[0]["location_basis"])
        accepted,skipped=parse_serpapi({"organic_results":[row]})
        self.assertEqual(len(accepted),0)

    def test_source_change_invalidates_human_corrections(self):
        listing=normalize_listing(raw_listing())
        item_id,_=self.store.upsert(listing)
        self.store.set_extraction(item_id,{"status":"eligible"},"Human note")
        self.store.upsert(listing|{"description":"Changed specifications from seller."})
        current=self.store.listing(item_id)
        self.assertIsNone(current["extraction"])
        self.assertIsNone(current["correction"])

    def test_provider_failure_preserves_listing_for_review(self):
        class BrokenModel(FakeModel):
            def extract(self,text): raise ProviderError("Local model unavailable")
        self.app.model=BrokenModel()
        self.app.start("import",[raw_listing()]); self.wait_job()
        self.assertEqual(self.app.job["status"],"partial")
        self.assertEqual(len(self.store.listings(False)),1)
        self.assertEqual(self.store.listings(False)[0]["extraction"]["status"],"needs_review")

if __name__=="__main__": unittest.main()
