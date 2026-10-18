"""Synthetic contract inputs, never runtime marketplace data."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from flipcheck import facebook
from flipcheck.domain import normalize_listing
from flipcheck.store import Store
from flipcheck.watchlists import validate_watchlist
from flipcheck.providers import ProviderError

CENTER={'latitude':-37.814,'longitude':144.963,'label':'Test search center'}

def settings(**extra):
    return validate_watchlist({'query':'MacBook','sources':['facebook'],'location':CENTER,'radius_km':25,**extra})

def row(**extra):
    return {'id':'123456789012','itemUrl':'https://www.facebook.com/marketplace/item/123456789012/?ref=search','listingTitle':'Apple MacBook Air M2','listingPrice':{'amount':'400','currency':'AUD'},'latitude':-37.81,'longitude':144.96,'locationText':'Melbourne VIC','deliveryTypes':['IN_PERSON'],'isLive':True,'isSold':False,'isPending':False,'description':'16GB RAM, 512GB SSD, good condition.',**extra}

class FacebookTests(unittest.TestCase):
    def test_sources_and_location_validation(self):
        self.assertEqual(validate_watchlist({'query':'old'})['sources'],['ebay'])
        w=settings();self.assertEqual(w['sources'],['facebook']);self.assertEqual(w['location'],CENTER)
        for extra in [{'sources':[]},{'sources':['unknown']},{'sources':['facebook','facebook']},{'location':None},{'radius_km':0},{'radius_km':501},{'location':CENTER|{'latitude':True}},{'location':CENTER|{'longitude':float('nan')}},{'pickup_cost':-1}]:
            with self.subTest(extra=extra),self.assertRaises(ValueError):settings(**extra)
    def test_normalization_distance_and_storage_preserve_source(self):
        listings,skipped=facebook.parse_facebook([row()],settings())
        self.assertEqual(skipped,[]);self.assertEqual(len(listings),1)
        listing=listings[0];self.assertEqual(listing['marketplace'],'facebook');self.assertIsNone(listing['inbound_shipping'])
        self.assertEqual(listing['url'],'https://www.facebook.com/marketplace/item/123456789012/')
        self.assertLess(facebook.distance_km(CENTER,listing),1)
        with tempfile.TemporaryDirectory() as d:
            s=Store(Path(d)/'test.db');ident,_=s.upsert(listing)
            self.assertEqual(s.listing(ident)['latitude'],-37.81)
            self.assertEqual(s.listings(False)[0]['marketplace'],'facebook')
    def test_unverified_geo_currency_inactive_or_nonpickup_never_admitted(self):
        for changes in [{'latitude':None},{'longitude':float('inf')},{'latitude':-33.86,'longitude':151.2},{'listingPrice':{'amount':'400','currency':'USD'}},{'listingPrice':{'amount':'400'}},{'isLive':False},{'isSold':True},{'isPending':True},{'deliveryTypes':['SHIPPING']},{'itemUrl':'https://facebook.com.evil.test/marketplace/item/123456789012/'}]:
            with self.subTest(changes=changes):
                listings,skips=facebook.parse_facebook([row(**changes)],settings());self.assertEqual(listings,[]);self.assertEqual(len(skips),1)
    def test_actor_request_is_bounded_and_secret_is_not_in_url(self):
        calls=[]
        def request(path,**kwargs):
            calls.append((path,kwargs))
            if '/acts/' in path:return {'data':{'id':'run1','status':'SUCCEEDED','defaultDatasetId':'data1'}}
            return [row()]
        with patch.dict('os.environ',{'APIFY_TOKEN':'secret'}),patch('flipcheck.facebook.apify_request',request):
            listings,_=facebook.search_facebook(settings(),limit=5)
        self.assertEqual(len(listings),1)
        path,options=calls[0];self.assertNotIn('secret',path)
        self.assertIn('maxTotalChargeUsd=0.25',path)
        self.assertEqual(options['payload']['maxItems'],5)
        self.assertEqual(options['payload']['latitude'],CENTER['latitude'])
        self.assertTrue(options['payload']['includeSeller'])
        self.assertNotIn('cookies',options['payload'])
        self.assertEqual(options['payload']['locationResultsMode'],'only_nearby_results')
    def test_missing_token_never_starts_actor(self):
        with patch.dict('os.environ',{},clear=True),patch('flipcheck.facebook.apify_request') as request:
            with self.assertRaises(ProviderError):facebook.search_facebook(settings())
            request.assert_not_called()
    def test_remote_failure_stops_and_poll_timeout_aborts(self):
        with patch.dict('os.environ',{'APIFY_TOKEN':'secret'}),patch('flipcheck.facebook.apify_request',return_value={'data':{'id':'run1','status':'FAILED'}}):
            with self.assertRaises(ProviderError):facebook.search_facebook(settings())
        calls=[]
        def running(path,**kwargs):calls.append(path);return {'data':{'id':'run1','status':'RUNNING'}}
        with patch.dict('os.environ',{'APIFY_TOKEN':'secret'}),patch('flipcheck.facebook.apify_request',running),patch('flipcheck.facebook.time.monotonic',side_effect=[0,200]):
            with self.assertRaises(ProviderError):facebook.search_facebook(settings())
        self.assertTrue(any('/abort' in path for path in calls))

    def test_live_nested_provider_shape_and_malformed_details(self):
        # Synthetic analogue of the documented nested response seen in the live probe.
        raw=row();raw.pop('latitude');raw.pop('longitude');raw.pop('listingPrice')
        raw['listing_price']={'amount':'400','formatted_amount':'AU$400'}
        raw['moreDetails']={'location':{'latitude':-37.81,'longitude':144.96},'listing_price':{'amount':'400','currency':'AUD'},'redacted_description':{'text':'Original seller description'},'location_text':'Melbourne VIC'}
        listings,skips=facebook.parse_facebook([raw],settings())
        self.assertEqual(len(listings),1);self.assertEqual(skips,[])
        self.assertEqual(listings[0]['description'],'Original seller description')
        listings,skips=facebook.parse_facebook([row(moreDetails=['invalid']),row(isSold=None),row(isPending=None),row(moreDetails={'is_sold':True})],settings())
        self.assertEqual(listings,[]);self.assertEqual(len(skips),4)
        raw['moreDetails']['is_multi_variant_listing']=True
        self.assertEqual(facebook.parse_facebook([raw],settings())[0],[])

    def test_bad_run_response_is_provider_error(self):
        with patch.dict('os.environ',{'APIFY_TOKEN':'secret'}),patch('flipcheck.facebook.apify_request',return_value=['unexpected']):
            with self.assertRaises(ProviderError):facebook.search_facebook(settings())
