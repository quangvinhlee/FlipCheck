"""Run a synthetic multi-product smoke evaluation on local Gemma; never writes runtime data."""
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
from flipcheck.products import validate_product_extraction as validate_extraction, VERSION
from flipcheck.providers import Ollama, ProviderError


def main():
    load_env()
    parser=argparse.ArgumentParser()
    parser.add_argument('--split',choices=['development','holdout','all'],default='holdout')
    parser.add_argument('--limit',type=int,default=0)
    parser.add_argument('--output',default=str(ROOT/'artifacts/evaluation.json'))
    args=parser.parse_args()
    file=ROOT/'fixtures/product-extraction-evaluation.json'
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
            row={'id':case['id'],'expected':case['expected_classification'],'predicted':checked['classification'],'eligible':checked['status']=='eligible','validation_errors':checked['errors'],'seconds':stats['elapsed_seconds'],'contract_version':VERSION}
        except ProviderError as exc:
            row={'id':case['id'],'expected':case['expected_classification'],'predicted':'failed','eligible':False,'error':str(exc),'contract_version':VERSION}
        results.append(row)
        print(f"{i+1}/{len(cases)} {row['id']}: expected={row['expected']} actual={row['predicted']} eligible={row['eligible']}",flush=True)
    accepted=[x for x in results if x['eligible']]
    precise=sum(x['expected']=='complete_product' for x in accepted)
    timings=[x['seconds'] for x in results if 'seconds' in x]
    report={'scope':'Synthetic smoke cases only; not an unseen benchmark, real-world accuracy, or resale validation.','split':args.split,'dataset_sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'model':health,'platform':platform.platform(),'python':platform.python_version(),'count':len(results),'classification_correct':sum(x['expected']==x['predicted'] for x in results),'automatically_eligible':len(accepted),'eligible_true_complete':precise,'eligible_precision':precise/len(accepted) if accepted else None,'eligible_false_admissions':len(accepted)-precise,'mean_seconds':statistics.mean(timings) if timings else None,'total_seconds':round(time.monotonic()-started,2),'cases':results}
    out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k not in {'cases','model'}},indent=2))
    print(f'Report: {out}')

if __name__=='__main__':main()
