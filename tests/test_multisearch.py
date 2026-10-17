import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from flipcheck.store import Store
from flipcheck.service import App
from flipcheck.domain import normalize_listing
from flipcheck.providers import ProviderError
from test_domain import raw_listing
from test_products import laptop

class Model:
    model='gemma4:test'
    def __init__(self):self.calls=0
    def health(self):return {'available':True,'model':self.model,'digest':'test'}
    def extract(self,text):
        self.calls+=1
        raw,_=laptop();return raw,{'elapsed_seconds':0}

class MultiSearchTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(Path(self.temp.name)/'test.db');self.model=Model()
        self.app=App(self.store,model=self.model)
        self.a=self.store.watchlists()[0]
        self.store.save_watchlist({'query':'Legion','max_price':800,'name':'Legion'},self.a['id'])
        self.b=self.store.save_watchlist({'query':'MacBook','category':'laptop','max_price':1200})
        self.c=self.store.save_watchlist({'query':'camera','category':'camera','max_price':600})
    def tearDown(self):self.temp.cleanup()
    def wait(self):
        for _ in range(200):
            if self.app.job['status']!='running':return
            time.sleep(.01)
        self.fail('worker did not finish')
    def listing(self,n):return normalize_listing(raw_listing(external_id=str(n),title='Apple MacBook Air M2 16GB RAM 512GB SSD good',description=f'Apple MacBook Air M2 good listing {n}',asking_price=300))
    def test_scans_three_queries_deduplicates_and_preserves_budgets(self):
        calls=[]
        def search(settings,on_request=None):
            calls.append((settings['query'],settings['max_price']));on_request()
            return [self.listing(1)],[ ]
        with patch.dict(os.environ,{'SERPAPI_KEY':'test'}),patch('flipcheck.service.search_ebay',search):
            self.app.start('live');self.wait()
        self.assertEqual(calls,[('Legion',800),('MacBook',1200),('camera',600)])
        self.assertEqual(self.model.calls,1)
        state=self.app.state();self.assertEqual(len(state['listings']),1)
        row=state['listings'][0]
        self.assertEqual(row['watchlist_ids'],[self.a['id'],self.b['id'],self.c['id']])
        self.assertEqual(row['display_watchlist_id'],self.a['id'])
        self.assertEqual(row['valuations'][str(self.b['id'])]['costs']['max_price'],1200)
        self.assertEqual(self.app.job['requests'],3)
    def test_partial_failure_and_candidate_limits(self):
        def search(settings,on_request=None):
            on_request()
            if settings['query']=='MacBook':raise ProviderError('quota')
            return [self.listing(n) for n in range(25)],[]
        with patch.dict(os.environ,{'SERPAPI_KEY':'test'}),patch('flipcheck.service.search_ebay',search):
            self.app.start('live');self.wait()
        self.assertEqual(len(self.app.state()['listings']),10)
        self.assertEqual(self.app.job['status'],'partial')
        self.assertEqual(self.app.job['requests'],3)
        self.assertEqual(self.model.calls,10)
    def test_disabled_archived_and_explicit_selection(self):
        self.store.save_watchlist({'enabled':False},self.a['id']);self.store.archive_watchlist(self.c['id'])
        calls=[]
        def search(settings,on_request=None):calls.append(settings['query']);on_request();return [],[]
        with patch.dict(os.environ,{'SERPAPI_KEY':'test'}),patch('flipcheck.service.search_ebay',search):
            self.app.start('live',watchlist_ids=[self.b['id']]);self.wait()
            self.assertEqual(calls,['MacBook'])
            with self.assertRaises(ValueError):self.app.start('live',watchlist_ids=[999])
            with self.assertRaises(ValueError):self.app.start('live',watchlist_ids=[self.a['id']])
            self.store.save_watchlist({'enabled':False},self.b['id'])
            with self.assertRaises(ValueError):self.app.start('live')
