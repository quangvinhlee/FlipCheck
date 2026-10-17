"""Watchlist validation; costs are resolved per search, never shared implicitly."""
from .domain import DEFAULT_SETTINGS, validate_settings
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
    return settings|{'name':name.strip(),'category':category,'enabled':enabled}
