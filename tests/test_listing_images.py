import tempfile
import unittest
from pathlib import Path
from flipcheck.domain import normalize_listing
from flipcheck.providers import parse_serpapi
from flipcheck.facebook import parse_facebook
from flipcheck.store import Store
from test_domain import raw_listing
from test_facebook import row,settings

class ListingImagesTests(unittest.TestCase):
    def test_images_are_bounded_validated_and_do_not_invalidate_extraction(self):
        photo='https://i.ebayimg.com/images/g/test/s-l500.webp'
        raw=raw_listing(images=[photo,photo,'javascript:alert(1)','https://127.0.0.1/private','https://fbcdn.net.evil.test/photo.jpg'])
        listing=normalize_listing(raw)
        self.assertEqual(listing['images'],[photo])
        self.assertEqual(len(normalize_listing(raw|{'images':[f'https://i.ebayimg.com/{i}.jpg' for i in range(20)]})['images']),12)
        with tempfile.TemporaryDirectory() as d:
            store=Store(Path(d)/'test.db');ident,_=store.upsert(listing)
            store.set_extraction(ident,{'status':'needs_review','facts':{}})
            store.upsert(normalize_listing(raw|{'images':['https://i.ebayimg.com/images/g/other/s-l500.jpg']}))
            saved=store.listing(ident)
            self.assertEqual(len(saved['observations']),1)
            self.assertEqual(saved['extraction']['status'],'needs_review')
            self.assertEqual(saved['images'],['https://i.ebayimg.com/images/g/other/s-l500.jpg'])
    def test_provider_image_fields_survive(self):
        thumbnail='https://i.ebayimg.com/images/g/test/s-l500.webp'
        data={'search_parameters':{'LH_PrefLoc':'1','ebay_domain':'ebay.com.au','buying_format':'BIN'},'organic_results':[{'product_id':'123456789012','title':'Actual source title','price':{'raw':'AU $400','extracted':400},'buying_format':'buy_it_now','thumbnail':thumbnail}]}
        self.assertEqual(parse_serpapi(data)[0][0]['images'],[thumbnail])
        a='https://scontent.xx.fbcdn.net/photo-a.jpg?token=public-image-signature';b='https://scontent.xx.fbcdn.net/photo-b.jpg'
        raw=row(primary_listing_photo={'image':{'uri':a}},moreDetails={'listing_photos':[{'image':{'uri':b}},None,{'image':'malformed'}]})
        images=parse_facebook([raw],settings())[0][0]['images']
        self.assertEqual(images,[b,a])
