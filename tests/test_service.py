import json
import tempfile
import threading
import time
import unittest
from http.client import HTTPConnection
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from flipcheck.service import App
from flipcheck.store import Store
from flipcheck.domain import normalize_listing
from flipcheck.server import create_server
from flipcheck.providers import parse_serpapi,ProviderError
from test_domain import raw_listing,comparison
from test_products import laptop

class FakeModel:
    model='test-model'
    def health(self):return {'available':True,'model':self.model,'digest':'test-digest'}
    def extract(self,text):return laptop()[0],{'elapsed_seconds':.01}

class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(Path(self.temp.name)/'test.db');self.app=App(self.store,model=FakeModel())
    def tearDown(self):self.temp.cleanup()
    def wait_job(self):
        for _ in range(100):
            if self.app.job['status']!='running':return
            time.sleep(.02)
        self.fail('Background job did not finish')
    def imported(self,**values):
        return raw_listing(title='Apple MacBook Air M2 16GB RAM 512GB SSD good condition',**values)
    def test_runtime_never_returns_synthetic_data(self):
        ident,_=self.store.upsert(normalize_listing(raw_listing(),synthetic=True))
        self.store.config('mode','demo')
        self.assertEqual(self.app.state()['mode'],'local')
        self.assertEqual(self.app.state()['listings'],[])
        self.assertEqual(self.app.state()['comparisons'],[])
    def test_import_analyse_decision_and_price_history(self):
        self.app.start('import',[self.imported()]);self.wait_job()
        item=self.app.state()['listings'][0];self.assertEqual(item['extraction']['status'],'eligible')
        self.app.decision(item['id'],'saved')
        self.app.start('import',[self.imported(asking_price=200)]);self.wait_job()
        item=self.app.state()['listings'][0]
        self.assertEqual(item['decision'],'saved');self.assertEqual(len(item['observations']),2);self.assertTrue(item['extraction']['cached'])
    def test_comparison_import_atomic(self):
        with self.assertRaises(ValueError):self.app.import_comparisons([comparison(1),comparison(2,verified=False)])
        self.assertEqual(self.store.comparisons(False),[])
    def test_human_correction(self):
        self.app.start('import',[self.imported(inbound_shipping=None)]);self.wait_job()
        item=self.app.state()['listings'][0]
        raw,text=laptop();self.app.correct(item['id'],{'note':text,'extraction':raw,'inbound_shipping':15})
        updated=self.store.listing(item['id'])
        self.assertEqual(updated['inbound_shipping'],15);self.assertEqual(updated['extraction']['engine'],'Human correction')
    def test_http_origin_token_demo_disabled_and_watchlist_routes(self):
        server=create_server(self.app,0);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        base=f'http://127.0.0.1:{server.server_port}'
        def post(path,data,token=None,origin=None):
            headers={'Content-Type':'application/json'}
            if token:headers['X-FlipCheck-Token']=token
            if origin:headers['Origin']=origin
            return urlopen(Request(base+'/api/'+path,data=json.dumps(data).encode(),headers=headers))
        try:
            with urlopen(base+'/api/state') as r:state=json.load(r)
            for path in ['demo','mode']:
                with self.assertRaises(HTTPError) as e:post(path,{},state['csrf_token'])
                self.assertEqual(e.exception.code,404);e.exception.close()
            with self.assertRaises(HTTPError) as e:post('watchlists/save',{'query':'MacBook'})
            self.assertEqual(e.exception.code,403);e.exception.close()
            with post('watchlists/save',{'query':'MacBook','category':'laptop'},state['csrf_token']) as r:self.assertEqual(json.load(r)['query'],'MacBook')
            with self.assertRaises(HTTPError) as e:post('watchlists/save',{'query':'camera'},state['csrf_token'],'https://example.com')
            self.assertEqual(e.exception.code,403);e.exception.close()
            with urlopen(base+'/api/export') as r:self.assertNotIn('synthetic',json.dumps(json.load(r)))
        finally:server.shutdown();server.server_close();thread.join()
    def test_backend_home_redirects(self):
        server=create_server(self.app,0);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();c=HTTPConnection('127.0.0.1',server.server_port)
        try:
            c.request('GET','/');r=c.getresponse();self.assertEqual(r.status,307);self.assertEqual(r.getheader('Location'),'http://127.0.0.1:3030');r.read()
        finally:c.close();server.shutdown();server.server_close();thread.join()
    def test_source_change_invalidates_correction(self):
        row=normalize_listing(raw_listing());ident,_=self.store.upsert(row);self.store.set_extraction(ident,{'status':'eligible'},'note')
        self.store.upsert(row|{'description':'changed'})
        self.assertIsNone(self.store.listing(ident)['extraction']);self.assertIsNone(self.store.listing(ident)['correction'])
    def test_failed_model_retains_review_listing(self):
        class Broken(FakeModel):
            def extract(self,text):raise ProviderError('Model unavailable')
        self.app.model=Broken();self.app.start('import',[self.imported()]);self.wait_job()
        self.assertEqual(self.app.job['status'],'partial');self.assertEqual(self.app.state()['listings'][0]['extraction']['status'],'needs_review')
    def test_provider_normalization(self):
        row={'title':raw_listing()['title'],'product_id':'123456789012','price':{'raw':'AU $240.00','extracted':240},'shipping':{'raw':'+AU $15.00 delivery'},'buying_format':'accepts_offers'}
        params={'LH_PrefLoc':'1','ebay_domain':'ebay.com.au','buying_format':'BIN'}
        accepted,skipped=parse_serpapi({'search_parameters':params,'organic_results':[row,row|{'price':{'from':1,'to':2}}]})
        self.assertEqual(len(accepted),1);self.assertEqual(accepted[0]['inbound_shipping'],15);self.assertEqual(len(skipped),1)
        accepted,_=parse_serpapi({'organic_results':[row]});self.assertEqual(accepted,[])
