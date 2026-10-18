"""Evidence-grounded product profiles shared by extraction, correction and sold imports."""
import re
from datetime import date
from .domain import canonical, local_date, money, as_number

VERSION='product-v2'
COMMON=('brand','model','condition')
ATTRIBUTES=('generation','variant','cpu','ram_gb','storage_gb','gpu','bundle','lens','edition','vram_gb','lock_status')
FIELDS=COMMON+ATTRIBUTES
NUMERIC={'ram_gb','storage_gb','vram_gb'}
PRODUCT_PROFILES={
    'laptop':('cpu','ram_gb','storage_gb'),
    'camera':('bundle',),
    'phone':('storage_gb','lock_status'), 'tablet':('storage_gb','lock_status'),
    'console':('edition','bundle','storage_gb'), 'gpu':('vram_gb',), 'other':(),
}
CLASSIFICATIONS={'complete_product','accessory','parts_or_faulty','unrelated','uncertain'}


def required_fields(category,facts):
    required=list(COMMON)+list(PRODUCT_PROFILES.get(category,()))
    if category=='camera' and facts.get('bundle')=='kit':required.append('lens')
    if category=='laptop' and (re.search(r'legion|gaming|rog|alienware|predator',str(facts.get('model','')),re.I) or facts.get('gpu')):required.append('gpu')
    return required


def grounded(field,value,quote):
    if field in NUMERIC:
        if type(value) is not int or not 1<=value<=8192:return False
        capacity=rf'(?<![\d.]){value}\s*gb\b'
        if field=='storage_gb' and value%1024==0:capacity=rf'(?:{capacity}|(?<![\d.]){value//1024}\s*tb\b)'
        context={'ram_gb':r'(?:ram|memory)', 'storage_gb':r'(?:ssd|hdd|storage|emmc|nvme)', 'vram_gb':r'(?:vram|gddr[34567x]*)'}[field]
        return bool(re.search(rf'(?:{capacity}\s*{context}\b|\b{context}\s*[:=-]?\s*{capacity})',quote,re.I))
    if not isinstance(value,str) or not value.strip() or len(value)>200:return False
    if field=='condition':
        return value in {'good','fair','excellent'} and bool(re.search(r'\b'+value+r'\b',quote,re.I)) and not re.search(r'\bnot\b',quote,re.I)
    if field=='bundle':
        patterns={'body_only':r'body[ _-]?only', 'kit':r'kit|with.*lens|lens.*included',
                  'console_only':r'console[ _-]?only','standard':r'standard','bundle':r'bundle'}
        return value in patterns and bool(re.search(patterns[value],quote,re.I))
    return canonical(value) in canonical(quote)


def validate_product_extraction(draft,text):
    if not isinstance(draft,dict):draft={}
    classification=draft.get('classification','uncertain')
    if not isinstance(classification,str) or classification not in CLASSIFICATIONS:classification='uncertain'
    category=draft.get('category','other')
    if not isinstance(category,str) or category not in PRODUCT_PROFILES:category='other'
    facts={};evidence={};errors=[]
    for field in FIELDS:
        item=draft.get(field)
        if not isinstance(item,dict) or item.get('value') is None:
            facts[field]=None;continue
        value,quote=item.get('value'),item.get('evidence')
        if not isinstance(quote,str) or not quote.strip() or quote not in text or not grounded(field,value,quote):
            facts[field]=None;errors.append(f'{field}: missing or unsupported source evidence.');continue
        facts[field]=value;evidence[field]=quote
    lower=text.lower()
    fault=re.search(r'\b(for parts|parts only|not working|non-working|broken|faulty|damaged|bios locked|bios password|password locked|cracked screen|battery dead|dead battery|no power|spares only)\b',lower)
    accessory=re.search(r'\b(box only|charger only|screen only|dock only|replacement screen|replacement keyboard)\b',lower)
    if fault:classification='parts_or_faulty'
    elif accessory:classification='accessory'
    if re.search(r'ignore (?:all |previous |the )*(?:instructions|rules)|system prompt|return .*complete_',lower):errors.append('Instruction-like source text requires review.')
    if re.search(r'\b(no charger|missing charger|not tested|untested|not (?:in )?(?:good|excellent|fair))\b',lower):errors.append('Unconfirmed hardware, missing inclusions or negated condition requires review.')
    rams=set(re.findall(r'\b(\d+)\s*gb\s*(?:ram|memory)\b',lower))
    if len(rams)>1:errors.append('Conflicting memory specifications.')
    if not valid_configuration(category,facts):errors.append('Unsupported or incomplete bundle configuration.')
    if category=='camera' and facts.get('bundle')=='body_only' and re.search(r'with[^.;\n]*lens|lens[^.;\n]*included',lower):
        errors.append('Body-only claim conflicts with an included lens.')
    missing=[key for key in required_fields(category,facts) if facts.get(key) is None]
    if category=='other':missing.append('supported_product_profile')
    status='rejected' if classification in {'accessory','parts_or_faulty','unrelated'} else ('eligible' if classification=='complete_product' and not errors and not missing else 'needs_review')
    reason=str(draft.get('reason','Review the seller text before buying.'))[:500]
    if fault:reason=f"Seller text mentions ‘{fault.group(0)}’."
    if accessory and not fault:reason=f"Accessory signal: ‘{accessory.group(0)}’."
    return {'classification':classification,'category':category,'facts':facts,'evidence':evidence,'errors':errors,'unknown_fields':missing,'status':status,'reason':reason,'contract_version':VERSION}


def valid_configuration(category,facts):
    if category=='camera':return facts.get('bundle') in {'body_only','kit'}
    if category=='console':return facts.get('bundle') in {'console_only','standard'}
    return True


def product_identity(extraction):
    facts=extraction.get('facts',{})
    category=extraction.get('category',facts.get('category'))
    if category not in PRODUCT_PROFILES or category=='other' or extraction.get('status')!='eligible':return None
    if not valid_configuration(category,facts):return None
    if any(facts.get(k) is None or facts.get(k)=='' for k in required_fields(category,facts)):return None
    # All supplied material attributes participate: unknown cannot match a known generation/lens/GPU.
    return (category,)+tuple((key,canonical(facts.get(key))) for key in FIELDS if key in COMMON or key in ATTRIBUTES)


def adapt_legacy_extraction(raw):
    if not isinstance(raw,dict):raw={}
    if raw.get('contract_version')==VERSION:return raw
    facts={k:raw.get('facts',{}).get(k) for k in FIELDS}
    if facts.get('generation') is not None:facts['generation']=str(facts['generation'])
    return raw|{'classification':'complete_product' if raw.get('classification')=='complete_laptop' else raw.get('classification','uncertain'),
                'category':raw.get('category','laptop'),'facts':facts,'status':'needs_review','reason':'Saved extraction uses the previous product contract. Analyse again to validate this product.','legacy':True}


def normalize_product_comparison(raw):
    if not isinstance(raw,dict):raise ValueError('Each sold comparison must be an object.')
    if raw.get('synthetic'):raise ValueError('Synthetic sales cannot be imported.')
    for k in ('external_id','source','reference','sold_at','collected_at','condition_evidence'):
        if not isinstance(raw.get(k),str) or not raw[k].strip() or len(raw[k])>2000:raise ValueError(f'Sale requires {k}.')
    if raw.get('verified') is not True or raw.get('actual_price_known') is not True:raise ValueError('Actual sold price and verification must both be confirmed.')
    if raw.get('currency')!='AUD' or raw.get('country')!='AU':raise ValueError('Sales must be AU transactions in AUD.')
    sold, collected=date.fromisoformat(raw['sold_at']),date.fromisoformat(raw['collected_at'])
    if sold>collected or collected>local_date():raise ValueError('Sale and collection dates must be chronological and not in the future.')
    category=raw.get('category','laptop' if raw.get('model')=='ThinkPad T14' else 'other')
    facts={k:raw.get(k) for k in FIELDS}
    # Preserve legacy facts while making their product identity explicit.
    if raw.get('model')=='ThinkPad T14' and not facts.get('brand'):facts['brand']='Lenovo'
    if facts.get('generation') is not None:facts['generation']=str(facts['generation'])
    if facts.get('condition') not in {'good','fair','excellent'}:raise ValueError('Sale requires a comparable stated condition.')
    for field,value in facts.items():
        if value is None:continue
        if field in NUMERIC:
            if type(value) is not int or not 1<=value<=8192:raise ValueError(f'Invalid sale {field}.')
        elif not isinstance(value,str) or not value.strip() or len(value)>200:raise ValueError(f'Invalid sale {field}.')
    if product_identity({'status':'eligible','category':category,'facts':facts}) is None:raise ValueError('Sale is missing material configuration fields for its product category.')
    return {k:raw[k] for k in ('external_id','source','reference','sold_at','collected_at','condition_evidence')}|facts|{
        'category':category,'synthetic':False,'verified':True,'actual_price_known':True,'currency':'AUD','country':'AU',
        'sold_price':as_number(money(raw.get('sold_price'))),'shipping':as_number(money(raw.get('shipping')))}
