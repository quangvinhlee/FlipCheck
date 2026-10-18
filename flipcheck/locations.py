"""Explicit Australian place lookup and approximate map-pin distances."""
import math
import threading
import time
from urllib.parse import urlencode
from .providers import request_json, ProviderError

_lookup_lock=threading.Lock()
_last_lookup=0


def coordinate(value,low,high):
    if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not low<=value<=high:
        raise ValueError('Provide valid finite latitude and longitude.')
    return float(value)


def validate_location(raw):
    if not isinstance(raw,dict):raise ValueError('Choose a location for Facebook Marketplace searches.')
    lat=coordinate(raw.get('latitude'),-90,90);lon=coordinate(raw.get('longitude'),-180,180)
    if not (-44.5<=lat<=-9 and 112<=lon<=154):raise ValueError('FlipCheck currently supports searches around Australia only.')
    label=raw.get('label','Selected location')
    if not isinstance(label,str) or not label.strip() or len(label)>300:raise ValueError('Location label must be 1–300 characters.')
    return {'latitude':round(lat,3),'longitude':round(lon,3),'label':label.strip()}


def distance_km(a,b):
    lat1=math.radians(coordinate(a.get('latitude'),-90,90));lat2=math.radians(coordinate(b.get('latitude'),-90,90))
    dlat=lat2-lat1;dlon=math.radians(coordinate(b.get('longitude'),-180,180)-coordinate(a.get('longitude'),-180,180))
    h=math.sin(dlat/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 6371.0088*2*math.asin(math.sqrt(min(1,h)))


def lookup_place(query):
    global _last_lookup
    if not isinstance(query,str) or not 2<=len(query.strip())<=120:raise ValueError('Enter an Australian suburb, city or postcode (2–120 characters).')
    # Deliberate lookups only, no autocomplete; global <= 1 request/second.
    with _lookup_lock:
        if time.monotonic()-_last_lookup<1.1:raise ValueError('Please wait a moment before another location lookup.')
        _last_lookup=time.monotonic()
        result=request_json('https://nominatim.openstreetmap.org/search?'+urlencode({'q':query.strip(),'format':'jsonv2','countrycodes':'au','limit':5,'addressdetails':1}),timeout=10)
    if not isinstance(result,list):raise ProviderError('Location lookup returned an unexpected response.')
    places=[]
    for item in result[:5]:
        try:
            if not isinstance(item,dict) or item.get('address',{}).get('country_code')!='au':continue
            places.append(validate_location({'latitude':float(item['lat']),'longitude':float(item['lon']),'label':item['display_name']}))
        except (KeyError,ValueError,TypeError):continue
    return {'places':places,'attribution':'Location search © OpenStreetMap contributors, via Nominatim.'}
