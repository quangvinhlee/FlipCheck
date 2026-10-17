import tempfile
import unittest
from pathlib import Path
from flipcheck.store import Store
from flipcheck.domain import DEFAULT_SETTINGS

class WatchlistTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.store=Store(Path(self.temp.name)/'test.db')
    def tearDown(self): self.temp.cleanup()
    def test_three_independent_searches(self):
        for query,category,budget in [('Legion','laptop',800),('MacBook','laptop',1000),('camera','camera',600)]:
            item=self.store.save_watchlist({'query':query,'category':category,'max_price':budget})
            self.assertEqual(item['query'],query)
            self.assertEqual(item['max_price'],budget)
        self.assertEqual(len(self.store.watchlists()),4) # one migrated legacy search
    def test_migration_is_idempotent_and_keeps_settings(self):
        original=self.store.watchlists()[0]
        self.store.save_watchlist({'query':'Edited','enabled':False},original['id'])
        again=Store(self.store.path)
        self.assertEqual(len(again.watchlists()),1)
        self.assertEqual(again.watchlists()[0]['query'],'Edited')
        self.assertFalse(again.watchlists()[0]['enabled'])
    def test_validation_limit_and_archive(self):
        for raw in [{'query':''},{'query':'ok','max_price':-1},{'query':'ok','enabled':'yes'}]:
            with self.assertRaises(ValueError):self.store.save_watchlist(raw)
        for i in range(9):self.store.save_watchlist({'query':str(i)})
        with self.assertRaises(ValueError):self.store.save_watchlist({'query':'eleventh'})
        old=self.store.watchlists()[0]
        self.store.archive_watchlist(old['id'])
        self.store.save_watchlist({'query':'replacement'})
        self.assertEqual(len(self.store.watchlists()),10)
    def test_many_to_many_matches_and_no_duplicate_links(self):
        from test_domain import raw_listing
        from flipcheck.domain import normalize_listing
        listing_id,_=self.store.upsert(normalize_listing(raw_listing()))
        a=self.store.watchlists()[0]
        b=self.store.save_watchlist({'query':'MacBook'})
        self.store.link_listing(listing_id,a['id']);self.store.link_listing(listing_id,b['id']);self.store.link_listing(listing_id,b['id'])
        self.assertEqual(self.store.matches(listing_id),[a['id'],b['id']])
    def test_new_synthetic_records_are_never_auto_linked(self):
        from test_domain import raw_listing
        from flipcheck.domain import normalize_listing
        ident,_=self.store.upsert(normalize_listing(raw_listing(),synthetic=True))
        self.assertEqual(self.store.matches(ident),[])
