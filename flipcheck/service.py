"""Multi-search orchestration; live/user data only, never a fixture fallback."""
import hashlib
import json
import os
import threading
import time
from .domain import now, normalize_listing, source_text, validate_settings, value_listing
from .products import VERSION, validate_product_extraction, normalize_product_comparison, adapt_legacy_extraction
from .providers import Ollama, ProviderError, SCHEMA, SYSTEM, search_ebay
from .facebook import search_facebook
from .locations import distance_km


class App:
    def __init__(self,store,model=None):
        self.store=store;self.model=model or Ollama();self.lock=threading.Lock()
        self.job=None;self.health_cache=None;self.health_time=0

    def health(self,refresh=False):
        if refresh or self.health_cache is None or time.monotonic()-self.health_time>30:
            self.health_cache=self.model.health();self.health_time=time.monotonic()
        return self.health_cache|{'serpapi_configured':bool(os.getenv('SERPAPI_KEY')),'facebook_configured':bool(os.getenv('APIFY_TOKEN')),'cloud_fallback':False}

    def busy_guard(self):
        if self.job and self.job.get('status')=='running':raise ValueError('A scan is running. Wait for it to finish before editing searches or importing data.')

    def state(self):
        watchlists=self.store.watchlists();by_id={w['id']:w for w in watchlists}
        comparisons=self.store.comparisons(False)
        listings=[]
        for item in self.store.listings(False):
            if item.get('synthetic'):continue
            item['extraction']=adapt_legacy_extraction(item.get('extraction'))
            ids=[i for i in self.store.matches(item['id']) if i in by_id]
            active=[i for i in ids if by_id[i]['enabled']]
            selected=(active or ids or [None])[0]
            distances={};valuations={}
            for i in ids:
                w=by_id[i];cost_item=item
                source='facebook' if item['marketplace']=='facebook' else 'ebay'
                invalid=None
                if source not in w['sources']:invalid='This search no longer includes this marketplace source.'
                if source=='facebook':
                    cost_item=item|{'inbound_shipping':w['pickup_cost']}
                    try:distances[str(i)]=round(distance_km(w.get('location') or {},item),2)
                    except ValueError:distances[str(i)]=None
                    if distances[str(i)] is None or distances[str(i)]>w['radius_km']:
                        invalid='Published location is unknown or outside the current pickup radius.'
                checked=item['extraction'] if invalid is None else item['extraction']|{'status':'needs_review'}
                valuation=value_listing(cost_item,checked,comparisons,w)|{'watchlist_id':i}
                if invalid:valuation['reason']=invalid
                elif source=='facebook' and w['pickup_cost'] is None:
                    valuation['reason']='Pickup/travel allowance is unknown; margin cannot be calculated.'
                valuations[str(i)]=valuation
            if item['marketplace']=='facebook':item['inbound_shipping']=by_id[selected]['pickup_cost'] if selected else None
            fallback=value_listing(item,item['extraction']|{'status':'needs_review'},[],self.store.config('settings'))|{'watchlist_id':None,'reason':'Assign this listing to an available search before valuation.'}
            item|={'distance_by_watchlist':distances,'watchlist_ids':ids,'display_watchlist_id':selected,'valuations':valuations,
                   'valuation':valuations.get(str(selected),fallback)}
            listings.append(item)
        with self.lock:
            job=json.loads(json.dumps(self.job)) if self.job else None
        return {'mode':'local','watchlists':watchlists,'settings':self.store.config('settings'),'listings':listings,
                'comparisons':[c for c in comparisons if not c.get('synthetic')],'scans':self.store.scans(),'job':job,'health':self.health(),
                'counts':{'scanned':len(listings),'excluded':sum(x['extraction']['status']=='rejected' for x in listings),
                          'review':sum(x['extraction']['status']!='rejected' and (x['extraction']['status']=='needs_review' or x['inbound_shipping'] is None) for x in listings),
                          'opportunities':sum(x['valuation']['opportunity'] for x in listings)}}

    def snapshot_all(self):
        state=self.state()
        for item in state['listings']:
            for key,valuation in item['valuations'].items():self.store.snapshot(item['id'],valuation,int(key))

    def save_watchlist(self,data):
        with self.lock:
            self.busy_guard();ident=data.get('id')
            result=self.store.save_watchlist(data,ident)
        self.snapshot_all()
        return result

    def archive_watchlist(self,ident):
        with self.lock:
            self.busy_guard();self.store.archive_watchlist(ident)
        return {'message':'Search archived. Listings and saved decisions are preserved.'}

    def settings(self,values):
        values=validate_settings(values)
        with self.lock:
            self.busy_guard();self.store.config('settings',values)
        return values

    def import_comparisons(self,rows):
        if not isinstance(rows,list) or not 1<=len(rows)<=1000:raise ValueError('Import 1–1000 completed sales.')
        comparisons=[normalize_product_comparison(row) for row in rows]
        with self.lock:
            self.busy_guard()
            for comp in comparisons:self.store.add_comparison(comp)
        self.snapshot_all()
        return {'message':f'Imported {len(comparisons)} completed sale records.'}

    def selected_watchlists(self,ids=None):
        watchlists=self.store.watchlists();by_id={w['id']:w for w in watchlists}
        if ids is None:chosen=[w for w in watchlists if w['enabled']]
        else:
            if not isinstance(ids,list) or not ids or len(ids)>10 or any(type(i) is not int for i in ids):raise ValueError('Select 1–10 valid search IDs.')
            if len(set(ids))!=len(ids):raise ValueError('Search IDs must be unique.')
            if any(i not in by_id or not by_id[i]['enabled'] for i in ids):raise ValueError('A selected search is archived, disabled, or missing.')
            chosen=[w for w in watchlists if w['id'] in ids]
        if not chosen:raise ValueError('Add or enable at least one search first.')
        return chosen

    def start(self,kind,rows=None,listing_id=None,watchlist_ids=None):
        if kind not in {'import','live','analyse'}:raise ValueError('Unknown scan type.')
        normalized=None
        if kind=='import':
            if not isinstance(rows,list) or not 1<=len(rows)<=50:raise ValueError('Import 1–50 listings at a time.')
            if any(row.get('synthetic') for row in rows if isinstance(row,dict)):raise ValueError('Only real listing imports are allowed.')
            normalized=[normalize_listing(row) for row in rows]
        with self.lock:
            self.busy_guard()
            if not self.health(refresh=True)['available']:raise ValueError('Start Ollama and install the configured local model first.')
            if kind=='analyse':
                listing=self.store.listing(listing_id)
                if listing.get('synthetic'):raise ValueError('Synthetic records are unavailable.')
                normalized=[listing]
                linked=self.store.matches(listing['id'])
                chosen=[w for w in self.store.watchlists() if w['id'] in linked]
            else:chosen=self.selected_watchlists(watchlist_ids)
            if kind=='live' and not any((source=='ebay' and os.getenv('SERPAPI_KEY')) or (source=='facebook' and os.getenv('APIFY_TOKEN')) for w in chosen for source in w['sources']):
                raise ValueError('Configure SERPAPI_KEY for eBay or APIFY_TOKEN for Facebook in your private .env, then restart.')
            if kind=='import' and watchlist_ids is None and len(chosen)>1:raise ValueError('Select the search associated with this listing import.')
            if kind=='import' and len(chosen)!=1:raise ValueError('Import listings into one selected search.')
            self.job={'status':'running','kind':kind,'phase':'searching' if kind=='live' else 'analysing','started_at':now(),
                      'processed':0,'total':len(normalized or []),'errors':[],'skipped':[],'requests':0,'searches':[],
                      'message':f'Searching {len(chosen)} product searches…' if kind=='live' else 'Analysing locally with Gemma 4…'}
            job=self.job
            threading.Thread(target=self._run,args=(job,kind,normalized,chosen),daemon=True).start()
        return {'message':f"Started {'scan' if kind=='live' else 'analysis'}.",'job':job}

    def update_job(self,job,**values):
        with self.lock:job.update(values)

    def _run(self,job,kind,listings,watchlists):
        started=time.monotonic();final_status='failed'
        try:
            candidates={}
            if kind=='live':
                for w in watchlists:
                    sources=w['sources'];limit=10//len(sources)
                    for source in sources:
                        source_name='Facebook Marketplace' if source=='facebook' else 'eBay AU'
                        search_run={'watchlist_id':w['id'],'name':w['name'],'query':w['query'],'source':source,'status':'running','requests':0,'admitted':0}
                        with self.lock:job['searches'].append(search_run)
                        self.update_job(job,message=f"Searching {w['name']} on {source_name}…",phase='searching')
                        def count_request():
                            with self.lock:job['requests']+=1;search_run['requests']+=1
                        try:
                            found,skipped=(search_facebook(w,limit=limit,on_request=count_request) if source=='facebook' else search_ebay(w,on_request=count_request))
                            for raw in found[:limit]:
                                key=(raw['marketplace'],raw['external_id'])
                                if key not in candidates:candidates[key]={'listing':raw,'ids':[]}
                                if w['id'] not in candidates[key]['ids']:candidates[key]['ids'].append(w['id'])
                            with self.lock:
                                job['skipped'].extend(s|{'watchlist_id':w['id'],'source':source} for s in skipped)
                                search_run.update(status='completed',admitted=min(limit,len(found)))
                        except (ProviderError,ValueError) as exc:
                            with self.lock:
                                job['errors'].append(f"{w['name']} ({source_name}): {exc}");search_run.update(status='failed',error=str(exc))
            else:
                for listing in listings or []:candidates[(listing['marketplace'],listing['external_id'])]={'listing':listing,'ids':[w['id'] for w in watchlists]}
            self.update_job(job,total=len(candidates),phase='analysing')
            metadata=self.health()
            for candidate in candidates.values():
                listing=candidate['listing'];ident,_=self.store.upsert(listing)
                for search_id in candidate['ids']:self.store.link_listing(ident,search_id)
                self.update_job(job,message=f"Analysing {job['processed']+1} of {job['total']}: {listing['title'][:80]}")
                text=source_text(listing)
                key=hashlib.sha256((VERSION+SYSTEM+json.dumps(SCHEMA,sort_keys=True)+self.model.model+str(metadata.get('digest'))+text).encode()).hexdigest()
                try:
                    cached=None if kind=='analyse' else self.store.cache(key)
                    if cached:extraction=cached|{'cached':True}
                    else:
                        draft,stats=self.model.extract(text)
                        extraction=validate_product_extraction(draft,text)|{'engine':self.model.model,'model_digest':metadata.get('digest'),'stats':stats,'cached':False}
                        if extraction['status']!='needs_review':self.store.cache(key,extraction)
                    self.store.set_extraction(ident,extraction)
                except ProviderError as exc:
                    self.store.set_extraction(ident,{'contract_version':VERSION,'classification':'uncertain','category':'other','status':'needs_review','facts':{},'evidence':{},'reason':'Local inference failed.','errors':[str(exc)],'engine':self.model.model})
                    with self.lock:job['errors'].append(f"{listing['external_id']}: {exc}")
                self.update_job(job,processed=job['processed']+1)
            self.snapshot_all()
            failures=sum(s['status']=='failed' for s in job['searches'])
            final_status='failed' if kind=='live' and failures==len(job['searches']) else ('partial' if job['errors'] or job['skipped'] else 'completed')
            self.update_job(job,message=f"Processed {job['processed']} unique listings across {len(watchlists)} searches; {len(job['errors'])} errors, {len(job['skipped'])} skipped results.")
        except Exception as exc:
            final_status='failed'
            message=str(exc) if isinstance(exc,(ValueError,ProviderError)) else 'Scan failed unexpectedly. Saved records are preserved.'
            with self.lock:job['errors'].append(message);job['message']=message
        finally:
            finished=job|{'finished_at':now(),'elapsed_seconds':round(time.monotonic()-started,2),'status':final_status,'phase':'finished'}
            self.store.scan(finished);self.update_job(job,**finished)

    def decision(self,listing_id,value):
        item=self.store.listing(listing_id)
        if item.get('synthetic'):raise ValueError('Record unavailable.')
        self.store.decide(listing_id,value);return {'message':'Decision saved locally.'}

    def correct(self,listing_id,data):
        with self.lock:
            self.busy_guard();listing=self.store.listing(listing_id)
            if listing.get('synthetic'):raise ValueError('Record unavailable.')
            note=data.get('note')
            if not isinstance(note,str) or not 5<=len(note.strip())<=2000:raise ValueError('Provide a correction note of 5–2000 characters.')
            text=source_text(listing)+'\nUser-confirmed correction: '+note
            extraction=validate_product_extraction(data.get('extraction'),text)|{'engine':'Human correction','corrected_at':now()}
            if 'inbound_shipping' in data:
                from .domain import money,as_number
                listing['inbound_shipping']=as_number(money(data['inbound_shipping'],nullable=True));self.store.upsert(listing)
            self.store.set_extraction(listing_id,extraction,note)
        self.snapshot_all();return {'message':'Correction saved; valuations recalculated.','extraction':extraction}
