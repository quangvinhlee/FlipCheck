"""Bounded, authenticated Facebook Marketplace discovery through Apify.

Provider contract: memo23/facebook-marketplace-scraper-ppe. No cookies, seller
identities or Google-indexed fallback. Published map pins are approximate.
"""
import json
import math
import os
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from .domain import normalize_listing, money
from .locations import distance_km, validate_location, coordinate
from .providers import ProviderError
from .images import facebook_images

ACTOR='memo23~facebook-marketplace-scraper-ppe'
TERMINAL={'SUCCEEDED','FAILED','TIMED-OUT','ABORTED'}


def apify_request(path,*,payload=None,on_request=None):
    if on_request:on_request()
    request=Request('https://api.apify.com/v2'+path,
                    data=None if payload is None else json.dumps(payload).encode(),
                    headers={'Authorization':'Bearer '+os.getenv('APIFY_TOKEN',''),
                             'Content-Type':'application/json','User-Agent':'FlipCheck/0.3'})
    try:
        with urlopen(request,timeout=20) as response:
            data=response.read(4_000_001)
            if len(data)>4_000_000:raise ProviderError('Marketplace provider response was too large.')
            return json.loads(data)
    except HTTPError as exc:
        raise ProviderError(f'Marketplace provider returned HTTP {exc.code}. Check APIFY_TOKEN, actor access and available credit.') from None
    except (URLError,TimeoutError,OSError):raise ProviderError('Marketplace provider could not be reached. Run creation is not retried automatically.') from None
    except (ValueError,UnicodeDecodeError):raise ProviderError('Marketplace provider returned invalid JSON.') from None


def parse_facebook(rows,settings):
    if not isinstance(rows,list):raise ProviderError('Marketplace dataset must be a list of listings.')
    center=validate_location(settings.get('location'))
    listings=[];skipped=[]
    for row in rows:
        title=str(row.get('listingTitle',row.get('marketplace_listing_title','Unknown listing')))[:150] if isinstance(row,dict) else 'Invalid record'
        try:
            if not isinstance(row,dict):raise ValueError('Invalid Marketplace listing.')
            details=row.get('moreDetails') or {}
            if not isinstance(details,dict):raise ValueError('Invalid Marketplace detail metadata.')
            if row.get('isLive',row.get('is_live')) is not True or row.get('isSold',row.get('is_sold')) is not False or row.get('isPending',row.get('is_pending')) is not False or row.get('isHidden',row.get('is_hidden')) is True:
                raise ValueError('Listing is unavailable, pending, hidden or has unknown availability.')
            if details.get('is_sold') is True or details.get('is_pending') is True or details.get('is_hidden') is True or details.get('is_live') is False:
                raise ValueError('Listing detail reports unavailable inventory.')
            if 'IN_PERSON' not in row.get('deliveryTypes',row.get('delivery_types',[])):raise ValueError('Local pickup is not confirmed.')
            if details.get('is_multi_variant_listing') is True:raise ValueError('Multi-variation listings require manual inspection.')
            price=details.get('listing_price') or row.get('listingPrice',row.get('listing_price',{}))
            if not isinstance(price,dict) or price.get('currency')!='AUD':raise ValueError('An explicit AUD price is required.')
            amount=money(price.get('amount'))
            if amount>money(settings['max_price']):raise ValueError('Asking price exceeds this search budget.')
            pin=details.get('location') or {}
            if not isinstance(pin,dict):raise ValueError('Invalid published location metadata.')
            lat=coordinate(pin.get('latitude',row.get('latitude')),-90,90);lon=coordinate(pin.get('longitude',row.get('longitude')),-180,180)
            if distance_km(center,{'latitude':lat,'longitude':lon})>settings['radius_km']:raise ValueError('Outside the selected pickup radius.')
            description=details.get('redacted_description') or row.get('description','')
            if isinstance(description,dict):description=description.get('text','')
            listing=normalize_listing({'marketplace':'facebook','external_id':row.get('id'),
                'url':row.get('itemUrl',row.get('listingUrl')),'title':row.get('listingTitle',row.get('marketplace_listing_title')),
                'description':description or '', 'images':facebook_images(row,details), 'asking_price':float(amount),'inbound_shipping':None,
                'currency':'AUD','country':'AU','buying_format':'fixed_price','latitude':lat,'longitude':lon,
                'location_label':details.get('location_text') or row.get('locationText') or 'Published Marketplace location',
                'location_is_precise':row.get('locationIsPrecise') is True})
            listing['location_basis']='Approximate straight-line distance from published map coordinates; verify pickup address.'
            listings.append(listing)
        except (ValueError,TypeError,KeyError) as exc:skipped.append({'title':title,'reason':str(exc)})
    return listings,skipped


def run_response(body):
    if not isinstance(body,dict) or not isinstance(body.get('data'),dict):raise ProviderError('Marketplace provider returned invalid run metadata.')
    return body['data']


def search_facebook(settings,*,limit=10,on_request=None):
    if not os.getenv('APIFY_TOKEN'):raise ProviderError('Set APIFY_TOKEN in your private .env and restart to search Facebook Marketplace. eBay uses SERPAPI_KEY separately.')
    location=validate_location(settings.get('location'))
    limit=max(1,min(10,int(limit)))
    params=urlencode({'timeout':120,'maxItems':limit,'maxTotalChargeUsd':0.25,'restartOnError':'false'})
    payload={'searchQuery':settings['query'],'latitude':location['latitude'],'longitude':location['longitude'],
             'radiusKm':settings['radius_km'],'maxPrice':math.ceil(settings['max_price']),
             'maxItems':limit,'sortBy':'distance_ascend','availability':'in stock','deliveryMethod':'local_pick_up',
             'preciseLocation':True,'locationResultsMode':'only_nearby_results','includeSeller':True,
             'monitoringMode':False,'flattenOutput':False,'maxRequestRetries':1,
             'proxy':{'useApifyProxy':True,'apifyProxyCountry':'AU'}}
    run_id=None;finished=False
    started=time.monotonic()
    try:
        run=run_response(apify_request(f'/acts/{ACTOR}/runs?{params}',payload=payload,on_request=on_request))
        ident=run.get('id')
        if not isinstance(ident,str) or not re.fullmatch('[A-Za-z0-9]+',ident):raise ProviderError('Marketplace provider did not return a valid run ID.')
        run_id=ident
        while run.get('status') not in TERMINAL:
            if time.monotonic()-started>150:raise ProviderError('Marketplace search timed out; saved results from other sources are preserved.')
            run=run_response(apify_request(f'/actor-runs/{run_id}?waitForFinish=5',on_request=on_request))
            if run.get('status') not in TERMINAL:time.sleep(1)
        finished=True
        if run.get('status')!='SUCCEEDED':raise ProviderError('Marketplace search did not complete successfully. Check the run in Apify.')
        dataset=run.get('defaultDatasetId')
        if not isinstance(dataset,str) or not re.fullmatch('[A-Za-z0-9]+',dataset):raise ProviderError('Marketplace search returned no valid dataset.')
        rows=apify_request(f'/datasets/{dataset}/items?clean=true&limit={limit}',on_request=on_request)
        return parse_facebook(rows,settings)
    finally:
        if run_id and not finished:
            try:apify_request(f'/actor-runs/{run_id}/abort',payload={},on_request=on_request)
            except ProviderError:pass
