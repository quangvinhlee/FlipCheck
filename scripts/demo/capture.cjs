// Records real UI interactions without writing to the workspace or starting paid scans.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'artifacts/demo');
const timeline = JSON.parse(fs.readFileSync(path.join(output, 'timeline.json')));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await chromium.launch({headless: true,
    executablePath: process.env.CHROMIUM_PATH || '/home/vinhle/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'});
  for (const scene of timeline.filter(s => !['opening','local','closing'].includes(s.id) && (!process.env.SCENES || process.env.SCENES.split(',').includes(s.id)))) {
    const context = await browser.newContext({viewport: {width:1600,height:900},
      recordVideo: {dir:path.join(output,'raw'),size:{width:1600,height:900}}});
    await context.route('**/api/**', route => route.request().method() === 'GET' ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(process.env.DEMO_URL || 'http://127.0.0.1:3030');
    await page.locator('.listing-name').first().waitFor();
    await page.waitForTimeout(700);
    await page.addStyleTag({content: `*{caret-color:transparent!important} .chosen-location small{filter:blur(5px)} .demo-cursor{position:fixed;width:22px;height:22px;border:3px solid #b9e88a;background:#123c30aa;border-radius:50%;z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%);box-shadow:0 0 0 5px #183e2c22} .demo-focus{outline:3px solid #43895a!important;outline-offset:5px!important;transition:outline .3s}`});
    await page.evaluate(() => {
      const pointer=document.createElement('div');pointer.className='demo-cursor';pointer.style.left='1500px';pointer.style.top='80px';document.body.append(pointer);
      window.addEventListener('mousemove', e => {const host=document.querySelector('dialog[open]')||document.body;if(pointer.parentNode!==host)host.append(pointer);pointer.style.left=e.clientX+'px';pointer.style.top=e.clientY+'px';});
    });
    async function point(locator,click=false) {
      await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:30});
      await locator.evaluate(el=>el.classList.add('demo-focus'));await pause(500);
      if(click) await locator.click();
      await pause(450);await locator.evaluate(el=>el.classList.remove('demo-focus')).catch(()=>{});
    }
    async function scroll(y, dialog=false) {
      await page.evaluate(({y,dialog})=>(dialog?document.querySelector('dialog[open]'):window).scrollBy({top:y,behavior:'smooth'}),{y,dialog});await pause(1100);
    }
    if(['feed','evidence','checks'].includes(scene.id)) {
      await page.locator('.table-panel, .listings-panel').count().then(async n=>{if(!n)await page.locator('.listing-name').first().scrollIntoViewIfNeeded()});
      await page.evaluate(()=>document.querySelector('.listing-name').scrollIntoView({block:'center'}));
      await pause(700);
    }
    const started = Date.now();
    if(scene.id==='searches') {
      await pause(900);await point(page.getByRole('button',{name:'Add search',exact:true}),true);
      await point(page.getByRole('textbox',{name:'Display name (optional)'}),true);
      await page.getByRole('textbox',{name:'Display name (optional)'}).pressSequentially('MacBook repair desk',{delay:65});
      await page.getByRole('combobox',{name:'Product category',exact:true}).selectOption('laptop');
      const query=page.getByRole('textbox',{name:'Search query',exact:true});await query.fill('');await point(query,true);await query.pressSequentially('MacBook Air M1',{delay:85});
      await point(page.getByRole('spinbutton',{name:'Maximum asking price (AUD)',exact:true}));await pause(1200);
    } else if(scene.id==='feed') {
      await point(page.getByRole('button',{name:'Card view',exact:true}),true);await pause(1600);
      await scroll(320);await pause(2100);await scroll(480);await pause(2200);await scroll(-280);
    } else if(scene.id==='nearby') {
      await point(page.getByRole('button',{name:/^Edit Fujifilm/}),true);
      await page.getByRole('spinbutton',{name:'Pickup radius (km)',exact:true}).scrollIntoViewIfNeeded();await pause(1400);
      await point(page.getByRole('spinbutton',{name:'Pickup radius (km)',exact:true}));
      await point(page.getByRole('spinbutton',{name:'Pickup / travel allowance (AUD)',exact:true}));await pause(2000);
    } else if(scene.id==='evidence') {
      await point(page.locator('.listing-name').filter({hasText:'X-T200'}).first(),true);await pause(1200);
      const photos=page.getByRole('button',{name:/Show seller photo/});
      for(let i=1;i<Math.min(await photos.count(),3);i++){await point(photos.nth(i),true);await pause(600)}
      await page.getByRole('heading',{name:'Facts, with their evidence',exact:false}).evaluate(el=>{el.scrollIntoView({block:'start'});document.querySelector('dialog[open]').scrollBy(0,-125)});await pause(1300);
    } else if(scene.id==='checks') {
      await point(page.locator('.listing-name').filter({hasText:'XS20'}).first(),true);await pause(1000);
      await page.getByRole('heading',{name:'What blocks this opportunity',exact:true}).scrollIntoViewIfNeeded();await pause(2200);
      await point(page.getByRole('button',{name:'Close evidence',exact:true}),true);
      await page.evaluate(()=>document.querySelector('[aria-label="Why there are no verified opportunities"]').scrollIntoView({behavior:'smooth',block:'center'}));await pause(2000);
    }
    await pause(Math.max(400,scene.duration*1000-(Date.now()-started)));
    await page.screenshot({path:path.join(output,`${scene.id}-preview.png`)});
    const elapsed=(Date.now()-started)/1000;const video=page.video();await context.close();
    const raw=await video.path();
    const total=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',raw]));
    execFileSync('ffmpeg',['-y','-v','error','-ss',String(Math.max(0,total-elapsed)),'-i',raw,'-t',String(scene.duration),'-vf','fps=24','-an','-c:v','libx264','-preset','fast','-crf','18',path.join(output,`${scene.id}.mp4`)]);
    console.log(`Captured ${scene.id}: ${scene.duration.toFixed(1)}s`);
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
