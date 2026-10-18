"""Preserve marketplace-provided image URLs; never substitute model/product photos."""
from urllib.parse import urlsplit, urlunsplit


def image_urls(values):
    if not isinstance(values,list):return []
    result=[]
    for value in values[:100]:
        if not isinstance(value,str) or len(value)>4096:continue
        try:
            parsed=urlsplit(value)
            host=(parsed.hostname or '').lower()
            if parsed.scheme!='https' or parsed.username or parsed.password or parsed.port not in {None,443}:continue
            if not any(host==base or host.endswith('.'+base) for base in ('ebayimg.com','fbcdn.net','fbsbx.com')):continue
            clean=urlunsplit((parsed.scheme,parsed.netloc,parsed.path,parsed.query,''))
            if clean not in result:result.append(clean)
            if len(result)==12:break
        except ValueError:continue
    return result


def facebook_images(row,details):
    candidates=[]
    photos=details.get('listing_photos') or row.get('listingPhotos') or []
    if isinstance(photos,list):
        for photo in photos[:30]:
            if isinstance(photo,dict) and isinstance(photo.get('image'),dict):candidates.append(photo['image'].get('uri'))
    for name in ('primary_listing_photo','primaryListingPhoto'):
        photo=row.get(name)
        if isinstance(photo,dict) and isinstance(photo.get('image'),dict):candidates.append(photo['image'].get('uri'))
    return image_urls(candidates)
