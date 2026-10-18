import unittest
from unittest.mock import patch
from flipcheck import locations

class LocationTests(unittest.TestCase):
    def test_lookup_is_explicit_au_only_and_validates_query(self):
        for query in ['',None,'x','x'*121]:
            with self.assertRaises(ValueError):locations.lookup_place(query)
        data=[{'lat':'-37.814','lon':'144.963','display_name':'Test AU location','address':{'country_code':'au'}},
              {'lat':'40','lon':'-70','display_name':'Wrong country','address':{'country_code':'us'}}]
        with patch('flipcheck.locations._last_lookup',0),patch('flipcheck.locations.time.monotonic',return_value=100),patch('flipcheck.locations.request_json',return_value=data) as request:
            result=locations.lookup_place('3000')
            self.assertEqual(len(result['places']),1)
            self.assertIn('countrycodes=au',request.call_args.args[0])
            with self.assertRaises(ValueError):locations.lookup_place('3000')
            self.assertEqual(request.call_count,1)
    def test_coordinates_are_rounded_and_invalid_values_rejected(self):
        self.assertEqual(locations.validate_location({'latitude':-37.81426,'longitude':144.96334})['latitude'],-37.814)
        for point in [{'latitude':True,'longitude':144},{'latitude':float('inf'),'longitude':144},{'latitude':40,'longitude':-70}]:
            with self.assertRaises(ValueError):locations.validate_location(point)
