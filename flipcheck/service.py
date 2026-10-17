"""Application orchestration: one bounded background scan at a time."""
import hashlib
import json
import os
import threading
import time
from .domain import VERSION, now, normalize_listing, normalize_comparison, source_text, validate_extraction, validate_settings, value_listing
from .providers import Ollama, ProviderError, SCHEMA, SYSTEM, search_ebay
from .demo import demo_data


class App:
    def __init__(self, store, model=None):
        self.store = store
        self.model = model or Ollama()
        self.lock = threading.Lock()
        self.job = None
        self.health_cache = None
        self.health_time = 0

    def health(self, refresh=False):
        if refresh or self.health_cache is None or time.monotonic() - self.health_time > 30:
            self.health_cache = self.model.health()
            self.health_time = time.monotonic()
        return self.health_cache | {"serpapi_configured": bool(os.getenv("SERPAPI_KEY")), "cloud_fallback": False}

    def state(self):
        synthetic = self.store.config("mode") == "demo"
        settings = self.store.config("settings")
        comparisons = self.store.comparisons(synthetic)
        listings = self.store.listings(synthetic)
        for listing in listings:
            extraction = listing.get("extraction") or {"status": "needs_review", "classification": "uncertain", "facts": {}, "evidence": {}, "reason": "Not analysed yet.", "errors": [], "unknown_fields": []}
            listing["extraction"] = extraction
            listing["valuation"] = value_listing(listing, extraction, comparisons, settings)
        return {"mode": "demo" if synthetic else "local", "settings": settings, "listings": listings,
                "comparisons": comparisons, "scans": self.store.scans(), "job": self.job,
                "health": self.health(), "counts": {"scanned": len(listings), "excluded": sum(x["extraction"]["status"] == "rejected" for x in listings),
                    "review": sum(x["extraction"]["status"] != "rejected" and (x["extraction"]["status"] == "needs_review" or x["inbound_shipping"] is None) for x in listings),
                    "opportunities": sum(x["valuation"]["opportunity"] for x in listings)}}

    def snapshot_all(self, synthetic):
        settings = self.store.config("settings")
        comparisons = self.store.comparisons(synthetic)
        for listing in self.store.listings(synthetic):
            self.store.snapshot(listing["id"], value_listing(listing, listing.get("extraction") or {}, comparisons, settings))

    def busy_guard(self):
        if self.job and self.job.get("status") == "running":
            raise ValueError("A scan is already running. Wait for it to finish before changing the workspace.")

    def load_demo(self):
        with self.lock:
            self.busy_guard()
            listings, comparisons = demo_data()
            for comp in comparisons:
                self.store.add_comparison(comp)
            for listing, extraction in listings:
                listing_id, _ = self.store.upsert(listing)
                self.store.set_extraction(listing_id, extraction)
            self.store.config("mode", "demo")
            self.snapshot_all(True)
        return {"message": "Loaded 8 synthetic listings and 14 synthetic comparisons. No live model or search was called."}

    def set_mode(self, mode):
        if mode not in {"local", "demo"}:
            raise ValueError("Unknown workspace mode.")
        with self.lock:
            self.busy_guard()
            self.store.config("mode", mode)
        return {"mode": mode}

    def settings(self, values):
        values = validate_settings(values)
        with self.lock:
            self.busy_guard()
            self.store.config("settings", values)
            self.snapshot_all(self.store.config("mode") == "demo")
        return values

    def import_comparisons(self, rows):
        if not isinstance(rows, list) or not 1 <= len(rows) <= 1000:
            raise ValueError("Import 1–1000 sold comparisons.")
        # Validate the entire batch before writing anything.
        comparisons = [normalize_comparison(row) for row in rows]
        with self.lock:
            self.busy_guard()
            for comparison in comparisons:
                self.store.add_comparison(comparison)
            self.store.config("mode", "local")
            self.snapshot_all(False)
        return {"message": f"Imported {len(comparisons)} sold comparison records (duplicates upserted)."}

    def start(self, kind, rows=None, listing_id=None):
        if kind not in {"import", "live", "analyse"}:
            raise ValueError("Unknown scan type.")
        normalized = None
        if kind == "import":
            if not isinstance(rows, list) or not 1 <= len(rows) <= 50:
                raise ValueError("Import 1–50 listings per batch.")
            normalized = [normalize_listing(row) for row in rows]
        with self.lock:
            self.busy_guard()
            if kind == "live" and not os.getenv("SERPAPI_KEY"):
                raise ValueError("SERPAPI_KEY is not configured. Add it to your local .env and restart.")
            if not self.health(refresh=True)["available"]:
                raise ValueError("Configured local model is unavailable. Start Ollama and install the configured model, or use the synthetic demo.")
            if kind == "analyse":
                listing = self.store.listing(listing_id)
                normalized = [listing]
                mode = "demo" if listing["synthetic"] else "local"
            else:
                mode = "local"
            self.store.config("mode", mode)
            self.job = {"status": "running", "kind": kind, "started_at": now(), "processed": 0,
                        "total": len(normalized or []), "errors": [], "skipped": [], "requests": 0,
                        "message": "Searching eBay Australia…" if kind == "live" else "Analysing locally with Gemma 4…"}
            snapshot = self.job
            threading.Thread(target=self._run, args=(snapshot, kind, normalized), daemon=True).start()
        return {"message": "Scan started.", "job": self.job}

    def _run(self, job, kind, listings):
        started = time.monotonic()
        final_status = "failed"
        try:
            if kind == "live":
                # Search performs at most two network attempts (one transient retry).
                def count_request():
                    job["requests"] += 1
                listings, skipped = search_ebay(self.store.config("settings"), on_request=count_request)
                job["skipped"] = skipped
                job["total"] = len(listings)
            metadata = self.health()
            for listing in listings:
                listing_id, _ = self.store.upsert(listing)
                text = source_text(listing)
                job["message"] = f"Analysing {job['processed'] + 1} of {job['total']}: {listing['title'][:80]}"
                key = hashlib.sha256((VERSION + SYSTEM + json.dumps(SCHEMA, sort_keys=True) + self.model.model + str(metadata.get("digest")) + text).encode()).hexdigest()
                try:
                    cached = None if kind == "analyse" else self.store.cache(key)
                    if cached:
                        extraction = cached | {"cached": True}
                    else:
                        draft, stats = self.model.extract(text)
                        extraction = validate_extraction(draft, text)
                        extraction |= {"engine": self.model.model, "model_digest": metadata.get("digest"), "schema_version": VERSION, "stats": stats, "cached": False}
                        if extraction["status"] != "needs_review":
                            self.store.cache(key, extraction)
                    self.store.set_extraction(listing_id, extraction)
                except ProviderError as exc:
                    self.store.set_extraction(listing_id, {"status": "needs_review", "classification": "uncertain", "facts": {}, "evidence": {}, "errors": [str(exc)], "reason": "Local inference failed; no valuation produced.", "engine": self.model.model})
                    job["errors"].append(f"{listing['external_id']}: {exc}")
                job["processed"] += 1
            self.snapshot_all(self.store.config("mode") == "demo")
            final_status = "partial" if job["errors"] or job["skipped"] else "completed"
            job["message"] = f"Processed {job['processed']} listings; {len(job['skipped'])} provider results skipped; {len(job['errors'])} analysis failures."
        except Exception as exc:
            final_status = "failed"
            job["message"] = str(exc) if isinstance(exc, (ValueError, ProviderError)) else "Scan failed unexpectedly. Previously saved results are preserved."
            job["errors"].append(job["message"])
        finally:
            finished = job | {"finished_at": now(), "elapsed_seconds": round(time.monotonic() - started, 2), "status": final_status}
            self.store.scan(finished)
            job.update(finished)

    def decision(self, listing_id, value):
        self.store.decide(listing_id, value)
        return {"message": "Decision saved locally."}

    def correct(self, listing_id, data):
        with self.lock:
            self.busy_guard()
            listing = self.store.listing(listing_id)
            note = data.get("note")
            if not isinstance(note, str) or not 5 <= len(note.strip()) <= 2000:
                raise ValueError("Provide a correction note of 5–2000 characters describing what you confirmed.")
            supplied = data.get("extraction")
            text = source_text(listing) + "\nUser-confirmed correction: " + note
            extraction = validate_extraction(supplied, text)
            extraction |= {"engine": "Human correction", "corrected_at": now(), "prior_engine": (listing.get("extraction") or {}).get("engine")}
            if "inbound_shipping" in data:
                from .domain import money, as_number
                listing["inbound_shipping"] = as_number(money(data["inbound_shipping"], nullable=True))
                self.store.upsert(listing)
            self.store.set_extraction(listing_id, extraction, note)
            self.snapshot_all(listing["synthetic"])
        return {"message": "Correction saved and valuation recalculated.", "extraction": extraction}
