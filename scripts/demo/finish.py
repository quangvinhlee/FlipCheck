"""Add an original, quiet electronic score and package the local video player."""
import json
import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts/demo'
duration = float(subprocess.check_output([
    'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', str(OUT / 'picture.mp4'),
]))
rate = 24000
audio = np.zeros(round(duration*rate), dtype=np.float64)
chords = [(130.81, 196.0, 246.94), (110.0, 164.81, 220.0),
          (87.31, 130.81, 174.61), (98.0, 146.83, 196.0)]
beat = 60/94
for step in range(int(duration/(beat/2))):
    start = step*beat/2
    chord = chords[int(start/10.2) % len(chords)]
    freq = chord[step % 3]*2
    t = np.arange(round(rate*1.3))/rate
    pluck = .022*np.sin(2*np.pi*freq*t)*np.exp(-t*4.5)*(1-np.exp(-t*100))
    offset = round(start*rate); length = min(len(pluck), len(audio)-offset)
    audio[offset:offset+length] += pluck[:length]
    if step % 4 == 0:
        t = np.arange(round(rate*.45))/rate
        pulse = .024*np.sin(2*np.pi*(48*t+3*(1-np.exp(-12*t))))*np.exp(-t*10)*(1-np.exp(-t*160))
        length = min(len(pulse), len(audio)-offset)
        audio[offset:offset+length] += pulse[:length]
for start in np.arange(0,duration,10.2):
    t=np.arange(round(rate*11.2))/rate
    envelope=np.minimum(t/1.2,1)*np.clip((11.2-t)/2,0,1)
    chord=chords[int(round(start/10.2))%4]
    pad=sum(.006*np.sin(2*np.pi*f*t+.15*np.sin(t*.5)) for f in chord)*envelope
    offset=round(start*rate);length=min(len(pad),len(audio)-offset)
    audio[offset:offset+length]+=pad[:length]
fade=np.minimum(np.arange(len(audio))/rate/2,1)*np.minimum((len(audio)-np.arange(len(audio)))/rate/3,1)
audio=np.clip(audio*fade,-1,1)
with wave.open(str(OUT/'score.wav'),'wb') as stream:
    stream.setnchannels(1);stream.setsampwidth(2);stream.setframerate(rate)
    stream.writeframes((audio*32767).astype('<i2').tobytes())
subprocess.run([
    'ffmpeg','-y','-v','error','-i',str(OUT/'picture.mp4'),
    '-i',str(OUT/'narration.wav'),'-i',str(OUT/'score.wav'),
    '-i',str(OUT/'flipcheck-demo.srt'),'-filter_complex',
    '[1:a][2:a]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89:level=false[a]',
    '-map','0:v','-map','[a]','-map','3:s','-c:v','copy',
    '-c:a','aac','-b:a','192k','-c:s','mov_text','-metadata:s:s:0','language=eng',
    '-movflags','+faststart',str(OUT/'flipcheck-demo.mp4'),
],check=True)
(OUT/'poster.jpg').write_bytes((OUT/'feed-frame.jpg').read_bytes())
(OUT/'index.html').write_text('''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FlipCheck — narrated product demo</title>
<style>body{margin:0;background:#102e27;color:#f5f8ef;font:18px system-ui;padding:4vw}main{max-width:1400px;margin:auto}h1{font-size:clamp(28px,4vw,54px);margin:0 0 12px}p{color:#b7cbbd}video{width:100%;border-radius:16px;background:#0b211c;margin:22px 0}a{color:#d2f19a;margin-right:24px}small{display:block;margin-top:24px;color:#b7cbbd}</style>
<main><h1>FlipCheck. Less searching.</h1><p>A real app walkthrough with Australian English narration, animated callouts and captions.</p>
<video controls preload="metadata" poster="poster.jpg"><source src="flipcheck-demo.mp4" type="video/mp4"></video>
<a href="flipcheck-demo.mp4" download>Download 1080p MP4</a><a href="flipcheck-demo.srt" download>Download captions</a>
<small>Synthetic narration. Original generated instrumental score. Real marketplace listings; no sale or profit is claimed.</small></main></html>''')
print(f'Packaged {duration:.1f}s demo with narration, original score and captions.')
