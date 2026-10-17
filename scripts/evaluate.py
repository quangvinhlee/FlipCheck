"""Run the frozen synthetic classification/eligibility benchmark on local Gemma."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import statistics
import sys
import time

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from flipcheck.config import load_env
from flipcheck.domain import validate_extraction
from flipcheck.providers import Ollama, ProviderError


def keyword_baseline(text):
    text=text.lower()
    if any(x in text for x in ['for parts','broken','locked','faulty','no power','damaged','non-working','spares']): return 'parts_or_faulty'
    if any(x in text for x in ['only','replacement','protector','sleeve','dock','battery component']): return 'accessory'
    if any(x in text for x in ['t14s','t14p','macbook','t480','latitude']): return 'out_of_scope'
    if 't14' in text and 'gen' in text: return 'complete_laptop'
    return 'uncertain'


def main():
    load_env()
    parser=argparse.ArgumentParser()
    parser.add_argument('--split',choices=['development','holdout','all'],default='holdout')
    parser.add_argument('--limit',type=int,default=0)
    parser.add_argument('--output',default=str(ROOT/'artifacts/evaluation.json'))
    args=parser.parse_args()
    file=ROOT/'fixtures/extraction-evaluation.json'
    cases=json.loads(file.read_text())['cases']
    cases=[c for c in cases if args.split=='all' or c['split']==args.split]
    if args.limit: cases=cases[:args.limit]
    model=Ollama();health=model.health()
    if not health['available']: raise SystemExit(health['message'])
    results=[];started=time.monotonic()
    for i,case in enumerate(cases):
        text=case['title']+'\n'+case['description']
        try:
            draft,stats=model.extract(text)
            checked=validate_extraction(draft,text)
            row={'id':case['id'],'expected':case['expected_classification'],'predicted':checked['classification'],'eligible':checked['status']=='eligible','validation_errors':checked['errors'],'seconds':stats['elapsed_seconds'],'baseline':keyword_baseline(text)}
        except ProviderError as exc:
            row={'id':case['id'],'expected':case['expected_classification'],'predicted':'failed','eligible':False,'error':str(exc),'baseline':keyword_baseline(text)}
        results.append(row)
        print(f"{i+1}/{len(cases)} {row['id']}: expected={row['expected']} actual={row['predicted']} eligible={row['eligible']}",flush=True)
    accepted=[x for x in results if x['eligible']]
    precise=sum(x['expected']=='complete_laptop' for x in accepted)
    timings=[x['seconds'] for x in results if 'seconds' in x]
    report={'scope':'Synthetic cases only; not real-world accuracy or resale validation. Holdout labels were frozen before this run.','split':args.split,'dataset_sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'model':health,'platform':platform.platform(),'python':platform.python_version(),'count':len(results),'classification_correct':sum(x['expected']==x['predicted'] for x in results),'baseline_classification_correct':sum(x['expected']==x['baseline'] for x in results),'automatically_eligible':len(accepted),'eligible_true_complete':precise,'eligible_precision':precise/len(accepted) if accepted else None,'eligible_false_admissions':len(accepted)-precise,'mean_seconds':statistics.mean(timings) if timings else None,'total_seconds':round(time.monotonic()-started,2),'cases':results}
    out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k not in {'cases','model'}},indent=2))
    print(f'Report: {out}')

if __name__=='__main__':main()
