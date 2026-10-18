"""Render a narrated 1080p product film from real Playwright recordings.

Requirements: Python + Pillow, ffmpeg/ffprobe. Speech is generated separately.
Outputs stay in ignored artifacts/demo; no credentials or workspace data are read.
"""
import json
import math
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts/demo'
FPS, W, H = 24, 1920, 1080
INK, MUTED, LIME, WHITE = '#102e27', '#a7bcb1', '#d2f19a', '#f5f8ef'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONTS = {}


def font(size, bold=False):
    key = (size, bold)
    if key not in FONTS:
        FONTS[key] = ImageFont.truetype(BOLD if bold else FONT, size)
    return FONTS[key]


def text(d, xy, value, size=30, fill=WHITE, bold=False):
    d.text(xy, value, font=font(size, bold), fill=fill, stroke_width=0)


def wrap(d, value, width, size=30, bold=False):
    lines, line = [], ''
    for word in value.split():
        candidate = (line + ' ' + word).strip()
        if d.textlength(candidate, font=font(size, bold)) > width and line:
            lines.append(line)
            line = word
        else:
            line = candidate
    return lines + ([line] if line else [])


def paragraph(d, xy, value, width, size=30, fill=WHITE, bold=False, spacing=10):
    x, y = xy
    for line in wrap(d, value, width, size, bold):
        text(d, (x, y), line, size, fill, bold)
        y += size + spacing
    return y


def ease(x):
    x = max(0, min(1, x))
    return 1 - (1-x)**3


def timestamp(s):
    h, m, sec = s.replace(',', '.').split(':')
    return int(h)*3600 + int(m)*60 + float(sec)


def srt_time(t):
    ms = round(t*1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'


def captions(scene):
    data = (OUT / 'voice' / (scene['id'] + '.srt')).read_text()
    return [(timestamp(a), timestamp(b), c.replace('\n', ' ')) for a, b, c in
            re.findall(r'(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})\n(.+?)(?=\n\n|\Z)', data, re.S)]


def background(t):
    im = Image.new('RGB', (W, H), INK)
    d = ImageDraw.Draw(im)
    for x in range(0, W, 80):
        d.line((x, 0, x, H), fill='#16372e')
    for y in range(0, H, 80):
        d.line((0, y, W, y), fill='#16372e')
    for i in range(12):
        x = (i*193 + t*(9+i%4)) % W
        y = 120+(i*137)%800
        d.ellipse((x,y,x+3,y+3),fill='#486653')
    return im


def logo(d, x, y, size=48):
    d.rounded_rectangle((x,y,x+size,y+size),radius=14,fill=LIME)
    d.line((x+size*.26,y+size*.52,x+size*.43,y+size*.68,x+size*.76,y+size*.32),fill=INK,width=max(3,int(size*.08)))
    text(d,(x+size+16,y-1),'flipcheck.',int(size*.72),WHITE,True)


def intro(im, t, duration):
    d = ImageDraw.Draw(im)
    logo(d,90,70,64)
    text(d,(94,244),'REPAIR. RESELL. REPEAT.',24,LIME,True)
    paragraph(d,(88,292),'The next good find\nstarts with too many tabs.'.replace('\n',' '),880,72,WHITE,True,12)
    text(d,(94,584),'Built around a real electronics repairer.',29,MUTED)
    # Browsing tabs become a single organised stack.
    settle=ease((t-7)/2.5)
    for i,(name,sub) in enumerate([('Facebook Marketplace','Nearby pickup'),('eBay Australia','Used electronics'),('The repair bench','Devices + donor parts')]):
        x=int(1050 + math.sin(t*.7+i)*24*(1-settle) + i*28*(1-settle))
        y=int(220+i*190 - i*38*settle + math.cos(t+i)*9*(1-settle))
        d.rounded_rectangle((x,y,x+650,y+154),radius=22,fill='#244b3d',outline='#577260',width=2)
        d.rounded_rectangle((x+20,y+20,x+28,y+130),radius=4,fill=LIME)
        text(d,(x+56,y+30),name,31,WHITE,True)
        text(d,(x+56,y+89),sub,24,MUTED)
    if t>8:
        q=ease((t-8)/.8)
        x=94-int(80*(1-q))
        d.rounded_rectangle((x,700,x+760,794),radius=20,fill=LIME)
        text(d,(x+30,719),'ONE PLACE TO START →',37,INK,True)


def architecture(im,t,duration):
    d=ImageDraw.Draw(im)
    text(d,(70,45),'WHY OPEN INNOVATION MATTERS',23,LIME,True)
    text(d,(65,94),'Your model. Your workspace.',61,WHITE,True)
    boxes=[(90,330,480,610,'01','Discovery','eBay + Facebook'),(690,330,1170,610,'02','Gemma 4','Local via Ollama'),(1380,330,1830,610,'03','Your records','Local SQLite')]
    d.rounded_rectangle((630,270,1870,685),radius=32,fill='#1b4135',outline='#749c66',width=2)
    text(d,(660,225),'ON YOUR MACHINE',23,LIME,True)
    for x1,y1,x2,y2,num,title,sub in boxes:
        e=ease((t-int(num)*.55)/.7); dy=int(35*(1-e))
        d.rounded_rectangle((x1,y1+dy,x2,y2+dy),radius=24,fill='#2c5342',outline='#648066',width=2)
        text(d,(x1+28,y1+28+dy),num,25,LIME,True)
        text(d,(x1+28,y1+100+dy),title,38,WHITE,True)
        text(d,(x1+28,y1+169+dy),sub,26,MUTED)
    for a,b in [(495,675),(1185,1365)]:
        d.line((a,470,b,470),fill='#708c68',width=4)
        x=a+(b-a)*((t*.55)%1)
        d.ellipse((x-10,460,x+10,480),fill=LIME)
        d.polygon([(b,470),(b-16,460),(b-16,480)],fill=LIME)
    for i,word in enumerate(['Change the prompts','Repeat analysis','Keep local records']):
        x=150+i*590
        d.rounded_rectangle((x,766,x+510,845),radius=18,outline='#52745b',width=2)
        text(d,(x+24,788),word,28,LIME)
    text(d,(94,910),'Live discovery needs internet and provider accounts.',27,MUTED)


def closing(im,t,duration):
    d=ImageDraw.Draw(im);logo(d,90,60,60)
    text(d,(94,220),'EARLY FEEDBACK',24,LIME,True)
    paragraph(d,(88,270),'He would pay for a more complete version.',1180,70,WHITE,True,13)
    text(d,(94,516),'Positive feedback. No payment yet.',32,LIME)
    text(d,(94,596),'NEXT: repair + parts sourcing, then a real user trial.',30,MUTED)
    e=ease((t-5)/1.2)
    x=int(94-50*(1-e))
    d.rounded_rectangle((x,720,x+1730,895),radius=26,fill=LIME)
    text(d,(x+35,742),'Less searching. More time for the work.',42,INK,True)
    text(d,(x+35,815),'github.com/quangvinhlee/FlipCheck',31,INK)
    for i in range(3):
        r=55+i*36+math.sin(t+i)*6
        d.ellipse((1590-r,370-r,1590+r,370+r),outline='#5c8057',width=3)
    d.line((1540,370,1575,407,1650,322),fill=LIME,width=13)


def footage(im, frame, scene, t):
    d=ImageDraw.Draw(im)
    text(d,(46,25),scene['label'],21,LIME,True)
    text(d,(42,64),scene['title'],45,WHITE,True)
    if scene['id']=='evidence':
        z=ease((t-3)/1.2)
        x=int(280*z); y=0; cw=int(1600-280*z); ch=int(cw*9/16)
        frame=frame.crop((x,y,x+cw,y+ch))
    frame=frame.resize((1440,810),Image.Resampling.LANCZOS)
    d.rounded_rectangle((38,134,1482,977),radius=18,fill='#456551')
    for i,c in enumerate(['#d99c80','#dac689',LIME]):d.ellipse((57+i*21,145,67+i*21,155),fill=c)
    text(d,(150,139),'FLIPCHECK / REAL APP RECORDING',12,WHITE)
    im.paste(frame,(40,164))
    d=ImageDraw.Draw(im)
    text(d,(1525,182),'IN FOCUS',19,LIME,True)
    for i,value in enumerate(scene['points']):
        e=ease((t-.5-i*1.4)/.7); x=int(1525+30*(1-e));y=255+i*171
        d.line((x,y,x+58,y),fill=LIME,width=4)
        paragraph(d,(x,y+24),value,345,31,WHITE,True,10)
    notes={
      'searches':'Preparing a search. Changes are not saved in this recording.',
      'feed':'Previously fetched listings. No fabricated deals.',
      'nearby':'Location is chosen explicitly. Scans are started manually.',
      'evidence':'AI extracts seller claims. Always inspect before buying.',
      'checks':'Current scanner finds asking prices. Sold evidence is imported.'}
    paragraph(d,(1525,805),notes[scene['id']],330,20,MUTED,False,7)


def main():
    timeline=json.loads((OUT/'timeline.json').read_text())
    # Round every scene to exact frame boundaries, keeping audio/captions in sync.
    for s in timeline:s['duration']=math.ceil(s['duration']*FPS)/FPS
    total=sum(s['duration'] for s in timeline)
    encoder=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-an','-c:v','libx264','-threads','4','-preset','fast','-crf','19','-pix_fmt','yuv420p',str(OUT/'picture.mp4')],stdin=subprocess.PIPE)
    elapsed=0;allcaps=[];audio=[]
    for scene in timeline:
        sid=scene['id'];caps=captions(scene);decoder=None;last=None
        if sid not in ['opening','local','closing']:
            decoder=subprocess.Popen(['ffmpeg','-v','error','-i',str(OUT/f'{sid}.mp4'),'-vf',f'fps={FPS},scale=1600:900','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE)
        for n in range(round(scene['duration']*FPS)):
            t=n/FPS;im=background(elapsed+t)
            if decoder:
                raw=decoder.stdout.read(1600*900*3)
                if len(raw)==1600*900*3:last=Image.frombytes('RGB',(1600,900),raw)
                footage(im,last,scene,t)
            elif sid=='opening':intro(im,t,scene['duration'])
            elif sid=='local':architecture(im,t,scene['duration'])
            else:closing(im,t,scene['duration'])
            d=ImageDraw.Draw(im)
            active=next((c for a,b,c in caps if a<=t<b),'')
            d.rectangle((0,988,W,1075),fill='#0b211c')
            lines=wrap(d,active,1750,27)
            for i,line in enumerate(lines):
                width=d.textlength(line,font=font(27));text(d,((W-width)/2,1001+i*34),line,27)
            d.rectangle((0,1076,W,1079),fill='#2b4b3d')
            d.rectangle((0,1076,int(W*(elapsed+t)/total),1079),fill=LIME)
            # Brief fades make cuts deliberate, without taking time away from the demo.
            fade=min(1,t/.18,(scene['duration']-t)/.18)
            if fade<1:im=Image.blend(Image.new('RGB',(W,H),INK),im,max(0,fade))
            encoder.stdin.write(im.tobytes())
            if n==round(5*FPS):im.save(OUT/f'{sid}-frame.jpg',quality=92)
        if decoder:decoder.stdout.close();decoder.wait()
        for a,b,c in caps:allcaps.append((a+elapsed,b+elapsed,c))
        wav=OUT/'voice'/f'{sid}.wav'
        subprocess.run(['ffmpeg','-y','-v','error','-i',str(OUT/'voice'/f'{sid}.mp3'),'-af',f'apad,atrim=0:{scene["duration"]}','-ar','48000','-ac','2',str(wav)],check=True)
        audio.append(wav);elapsed+=scene['duration']
        print(f'Rendered {sid} ({elapsed:.1f}s / {total:.1f}s)',flush=True)
    encoder.stdin.close()
    if encoder.wait():raise RuntimeError('Video encoder failed')
    (OUT/'audio-list.txt').write_text(''.join(f"file '{p}'\n" for p in audio))
    subprocess.run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(OUT/'audio-list.txt'),'-af','loudnorm=I=-16:TP=-1.5:LRA=11',str(OUT/'narration.wav')],check=True)
    (OUT/'flipcheck-demo.srt').write_text('\n\n'.join(f'{i+1}\n{srt_time(a)} --> {srt_time(b)}\n{c}' for i,(a,b,c) in enumerate(allcaps))+'\n')
    subprocess.run(['ffmpeg','-y','-v','error','-i',str(OUT/'picture.mp4'),'-i',str(OUT/'narration.wav'),'-i',str(OUT/'flipcheck-demo.srt'),'-map','0:v','-map','1:a','-map','2:s','-c:v','copy','-c:a','aac','-b:a','192k','-c:s','mov_text','-metadata:s:s:0','language=eng','-movflags','+faststart',str(OUT/'flipcheck-demo.mp4')],check=True)
    print('Finished:',OUT/'flipcheck-demo.mp4',flush=True)


if __name__=='__main__':main()
