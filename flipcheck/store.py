"""Local SQLite storage; private operational data is never committed."""
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import sqlite3

from .domain import DEFAULT_SETTINGS, VERSION, now, source_text

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS listings (
 id INTEGER PRIMARY KEY, marketplace TEXT NOT NULL, external_id TEXT NOT NULL,
 data TEXT NOT NULL, extraction TEXT, source_hash TEXT NOT NULL, first_seen TEXT NOT NULL,
 last_seen TEXT NOT NULL, decision TEXT NOT NULL DEFAULT 'new', correction TEXT,
 UNIQUE(marketplace, external_id));
CREATE TABLE IF NOT EXISTS observations (
 id INTEGER PRIMARY KEY, listing_id INTEGER NOT NULL REFERENCES listings(id),
 observed_at TEXT NOT NULL, asking_price REAL NOT NULL, shipping REAL);
CREATE TABLE IF NOT EXISTS comparisons (
 id INTEGER PRIMARY KEY, source TEXT NOT NULL, external_id TEXT NOT NULL,
 synthetic INTEGER NOT NULL, data TEXT NOT NULL, UNIQUE(source, external_id, synthetic));
CREATE TABLE IF NOT EXISTS extraction_cache (cache_key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scans (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS valuations (
 id INTEGER PRIMARY KEY, listing_id INTEGER NOT NULL REFERENCES listings(id),
 valued_at TEXT NOT NULL, data TEXT NOT NULL);
"""


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.executescript(SCHEMA)
            db.execute("INSERT OR IGNORE INTO config VALUES ('settings', ?)", (json.dumps(DEFAULT_SETTINGS),))
            db.execute("INSERT OR IGNORE INTO config VALUES ('mode', '\"local\"')")
        self.path.chmod(0o600)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=20)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    def config(self, key, value=None):
        with self.connection() as db:
            if value is not None:
                db.execute("INSERT INTO config VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, json.dumps(value)))
                return value
            row = db.execute("SELECT value FROM config WHERE key=?", (key,)).fetchone()
            return json.loads(row[0]) if row else None

    def upsert(self, listing):
        timestamp = now()
        digest = hashlib.sha256(source_text(listing).encode()).hexdigest()
        with self.connection() as db:
            row = db.execute("SELECT * FROM listings WHERE marketplace=? AND external_id=?", (listing["marketplace"], listing["external_id"])).fetchone()
            if row:
                listing_id = row["id"]
                changed = row["source_hash"] != digest
                db.execute("UPDATE listings SET data=?, last_seen=?, source_hash=?, extraction=?, correction=? WHERE id=?",
                           (json.dumps(listing), timestamp, digest, None if changed else row["extraction"], None if changed else row["correction"], listing_id))
                old = json.loads(row["data"])
                price_changed = any(old.get(k) != listing.get(k) for k in ("asking_price", "inbound_shipping"))
            else:
                cursor = db.execute("INSERT INTO listings (marketplace,external_id,data,source_hash,first_seen,last_seen) VALUES (?,?,?,?,?,?)",
                                    (listing["marketplace"], listing["external_id"], json.dumps(listing), digest, timestamp, timestamp))
                listing_id, changed, price_changed = cursor.lastrowid, True, True
            if price_changed:
                db.execute("INSERT INTO observations (listing_id,observed_at,asking_price,shipping) VALUES (?,?,?,?)", (listing_id, timestamp, listing["asking_price"], listing["inbound_shipping"]))
        return listing_id, changed

    def set_extraction(self, listing_id, extraction, correction=None):
        with self.connection() as db:
            db.execute("UPDATE listings SET extraction=?, correction=? WHERE id=?", (json.dumps(extraction), correction, listing_id))

    def listings(self, synthetic):
        with self.connection() as db:
            rows = db.execute("SELECT * FROM listings WHERE marketplace=? ORDER BY id DESC", ("demo" if synthetic else "ebay_au",)).fetchall()
            result = []
            for row in rows:
                item = json.loads(row["data"])
                item |= {"id": row["id"], "extraction": json.loads(row["extraction"]) if row["extraction"] else None,
                         "decision": row["decision"], "first_seen": row["first_seen"], "last_seen": row["last_seen"], "correction": row["correction"]}
                item["observations"] = [dict(o) for o in db.execute("SELECT observed_at,asking_price,shipping FROM observations WHERE listing_id=? ORDER BY id DESC LIMIT 20", (row["id"],)).fetchall()]
                result.append(item)
            return result

    def listing(self, listing_id):
        with self.connection() as db:
            row = db.execute("SELECT data FROM listings WHERE id=?", (listing_id,)).fetchone()
        if not row:
            raise ValueError("Listing not found.")
        raw = json.loads(row[0])
        return next(x for x in self.listings(raw["synthetic"]) if x["id"] == listing_id)

    def decide(self, listing_id, decision):
        if decision not in {"new", "saved", "dismissed", "contacted", "purchased"}:
            raise ValueError("Unknown decision.")
        self.listing(listing_id)
        with self.connection() as db:
            db.execute("UPDATE listings SET decision=? WHERE id=?", (decision, listing_id))

    def add_comparison(self, comparison):
        with self.connection() as db:
            db.execute("INSERT INTO comparisons (source,external_id,synthetic,data) VALUES (?,?,?,?) ON CONFLICT(source,external_id,synthetic) DO UPDATE SET data=excluded.data",
                       (comparison["source"], comparison["external_id"], int(comparison["synthetic"]), json.dumps(comparison)))

    def comparisons(self, synthetic):
        with self.connection() as db:
            return [json.loads(r[0]) for r in db.execute("SELECT data FROM comparisons WHERE synthetic=?", (int(synthetic),)).fetchall()]

    def cache(self, key, value=None):
        with self.connection() as db:
            if value is not None:
                db.execute("INSERT OR REPLACE INTO extraction_cache VALUES (?,?)", (key, json.dumps(value)))
                return value
            row = db.execute("SELECT value FROM extraction_cache WHERE cache_key=?", (key,)).fetchone()
            return json.loads(row[0]) if row else None

    def scan(self, data):
        with self.connection() as db:
            db.execute("INSERT INTO scans (data) VALUES (?)", (json.dumps(data),))

    def scans(self):
        with self.connection() as db:
            return [json.loads(r[0]) for r in db.execute("SELECT data FROM scans ORDER BY id DESC LIMIT 20")]

    def snapshot(self, listing_id, valuation):
        with self.connection() as db:
            db.execute("INSERT INTO valuations (listing_id, valued_at, data) VALUES (?,?,?)", (listing_id, valuation["valued_at"], json.dumps(valuation)))
