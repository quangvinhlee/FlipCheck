"""Watchlist validation; costs are resolved per search, never shared implicitly."""
from .domain import DEFAULT_SETTINGS, validate_settings, money, as_number
from .locations import validate_location
CATEGORIES=('laptop','camera','phone','tablet','console','gpu','other')


def validate_watchlist(raw, defaults=None):
    if not isinstance(raw,dict):raise ValueError('Search must be an object.')
    base=(defaults or DEFAULT_SETTINGS).copy()
    settings=validate_settings(base|raw)
    category=raw.get('category',base.get('category','other'))
    if category not in CATEGORIES:raise ValueError('Unsupported product category.')
    name=raw.get('name',base.get('name') or settings['query'])
    if not isinstance(name,str) or not name.strip() or len(name)>150:raise ValueError('Search name must be 1–150 characters.')
    enabled=raw.get('enabled',base.get('enabled',True))
    if type(enabled) is not bool:raise ValueError('Enabled must be true or false.')
    sources=raw.get('sources',base.get('sources',['ebay']))
    if not isinstance(sources,list) or not sources or any(s not in ('ebay','facebook') for s in sources) or len(set(sources))!=len(sources):
        raise ValueError('Select eBay, Facebook Marketplace, or both.')
    location=raw.get('location',base.get('location'))
    if location is not None or 'facebook' in sources:location=validate_location(location)
    radius=raw.get('radius_km',base.get('radius_km',25))
    if type(radius) is not int or not 1<=radius<=500:raise ValueError('Pickup radius must be 1–500 whole kilometres.')
    pickup=as_number(money(raw.get('pickup_cost',base.get('pickup_cost')),nullable=True))
    return settings|{'name':name.strip(),'category':category,'enabled':enabled,'sources':sources,
                     'location':location,'radius_km':radius,'pickup_cost':pickup}
