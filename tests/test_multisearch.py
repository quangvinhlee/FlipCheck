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

    def test_both_sources_preserve_ebay_when_facebook_fails(self):
        from test_facebook import CENTER
        self.store.save_watchlist({'sources':['ebay','facebook'],'location':CENTER},self.a['id'])
        def ebay(settings,on_request=None):on_request();return [self.listing(1)],[]
        with patch.dict(os.environ,{'SERPAPI_KEY':'test'},clear=True),patch('flipcheck.service.search_ebay',ebay):
            self.app.start('live',watchlist_ids=[self.a['id']]);self.wait()
        self.assertEqual(self.app.job['status'],'partial')
        self.assertEqual(len(self.app.state()['listings']),1)
        self.assertEqual([s['source'] for s in self.app.job['searches']],['ebay','facebook'])
        self.assertIn('APIFY_TOKEN',' '.join(self.app.job['errors']))

    def test_facebook_only_needs_no_serpapi_and_has_independent_distances(self):
        from test_facebook import CENTER,row
        from flipcheck.facebook import parse_facebook
        self.store.save_watchlist({'sources':['facebook'],'location':CENTER,'pickup_cost':12,'assumed_resale':1000},self.a['id'])
        self.store.save_watchlist({'sources':['facebook'],'location':CENTER|{'latitude':-37.82},'pickup_cost':30,'assumed_resale':1000},self.b['id'])
        def facebook(settings,limit=10,on_request=None):on_request();return parse_facebook([row()],settings)
        with patch.dict(os.environ,{'APIFY_TOKEN':'test'},clear=True),patch('flipcheck.service.search_facebook',facebook):
            self.app.start('live',watchlist_ids=[self.a['id'],self.b['id']]);self.wait()
        self.assertEqual(self.app.job['status'],'completed')
        self.assertEqual(self.model.calls,1)
        item=self.app.state()['listings'][0]
        self.assertNotEqual(item['distance_by_watchlist'][str(self.a['id'])],item['distance_by_watchlist'][str(self.b['id'])])
        self.assertEqual(item['valuations'][str(self.b['id'])]['costs']['pickup_cost'],30)
        self.assertEqual(item['valuations'][str(self.a['id'])]['scenarios']['assumed']['margin']-item['valuations'][str(self.b['id'])]['scenarios']['assumed']['margin'],18)
        self.store.save_watchlist({'pickup_cost':None},self.b['id'])
        unknown=self.app.state()['listings'][0]['valuations'][str(self.b['id'])]
        self.assertIsNone(unknown['scenarios']['assumed']);self.assertFalse(unknown['opportunity'])
        self.store.save_watchlist({'location':CENTER|{'latitude':-33.86,'longitude':151.2}},self.b['id'])
        stale=self.app.state()['listings'][0]['valuations'][str(self.b['id'])]
        self.assertEqual(stale['method'],'unavailable');self.assertIn('radius',stale['reason'])

    def test_radius_comparison_does_not_round_outside_listing_inside(self):
        from test_facebook import CENTER,row
        from flipcheck.facebook import parse_facebook
        listing=parse_facebook([row()],{'location':CENTER,'radius_km':25,'max_price':800})[0][0]
        ident,_=self.store.upsert(listing);self.store.link_listing(ident,self.a['id'])
        self.store.save_watchlist({'sources':['facebook'],'location':CENTER,'radius_km':25,'pickup_cost':0},self.a['id'])
        with patch('flipcheck.service.distance_km',return_value=25.004):
            value=self.app.state()['listings'][0]['valuation']
        self.assertIn('radius',value['reason'])
