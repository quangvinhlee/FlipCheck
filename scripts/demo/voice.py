"""Generate Australian English synthetic narration using Edge's online TTS.

Only the public storyboard text is sent. No app records or credentials are read.
Requires uv, ffprobe and internet access. Reuses unchanged voice segments.
"""
import concurrent.futures
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts/demo'
(OUT / 'voice').mkdir(parents=True, exist_ok=True)
story = json.loads((ROOT / 'scripts/demo/storyboard.json').read_text())


def generate(scene):
    base = OUT / 'voice' / scene['id']
    signature = hashlib.sha256(scene['voice'].encode()).hexdigest()
    stamp = base.with_suffix('.sha256')
    if not stamp.exists() or stamp.read_text() != signature or not base.with_suffix('.mp3').exists():
        subprocess.run([
            'uv', 'tool', 'run', '--from', 'edge-tts', 'edge-tts',
            '--voice', 'en-AU-WilliamNeural', '--rate', '+6%', '--text', scene['voice'],
            '--write-media', str(base.with_suffix('.mp3')),
            '--write-subtitles', str(base.with_suffix('.srt')),
        ], check=True)
        stamp.write_text(signature)
    scene['duration'] = float(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(base.with_suffix('.mp3')),
    ])) + 0.9
    return scene


with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    story = list(pool.map(generate, story))
(OUT / 'timeline.json').write_text(json.dumps(story, indent=2))
print(f'Voice ready: {sum(s["duration"] for s in story):.1f} seconds')
