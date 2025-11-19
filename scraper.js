// scraper.js - v14
// Usage: node scraper.js --query="car dealer" --city="Rajkot" --state="Gujarat" --out=results.csv
const fs = require('fs');
const argv = require('minimist')(process.argv.slice(2));
const puppeteer = require('puppeteer');

const QUERY = (argv.query || '').trim();
const CITY  = (argv.city || '').trim();
const STATE = (argv.state || '').trim();
const OUT   = argv.out || 'results.csv';
const CALLBACK = process.env.CALLBACK_URL || (argv.callback || '');

if(!QUERY){
  console.error('Missing query');
  process.exit(2);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(QUERY + ' ' + CITY)}`;
  console.log('Opening', searchUrl);
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  // helper
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // function to post progress (if callback provided)
  async function postProgress(job_id, count, percent, status='running'){
    if(!CALLBACK) return;
    try {
      await fetch(CALLBACK, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ job_id, count, percent, status })
      });
    } catch(e){
      // ignore network errors
    }
  }

  // incremental extraction
  const job_id = (argv.job_id) ? argv.job_id : 'job_' + Math.floor(Date.now()/1000) + '_' + Math.random().toString(36).slice(2,8);
  let items = [];
  let seenPhones = new Set();

  // allow 120 loops max to avoid infinite
  let loops = 0;
  let noGrowth = 0;
  let lastCount = 0;

  // try to detect feed container
  let feed = await page.$('[role="feed"]');
  if(!feed){
    // fallback to body
    feed = null;
  }

  while(loops < 250){
    loops++;
    // evaluate visible cards
    const newItems = await page.evaluate(() => {
      const out = [];
      function textOf(sel, node){
        const el = node.querySelector(sel);
        return el ? el.innerText.trim() : '';
      }
      const cards = Array.from(document.querySelectorAll('.Nv2PK')).filter(c => c.offsetParent !== null);
      cards.forEach(card => {
        try {
          const name = textOf('.qBF1Pd', card) || '';
          const rating = textOf('.MW4etd', card) || '';
          const txt = card.innerText || '';
          let phone = '';
          const m = txt.match(/\+?\\d[\\d\\-\\s]{8,}/g);
          if(m && m.length) phone = m[0].replace(/\\D/g,'');
          if(phone.length > 10) phone = phone.slice(-10);
          // address heuristics
          const lines = txt.split('\\n').map(s => s.trim()).filter(Boolean);
          const addr = lines.find(l => l.includes(',') && l.length > 8) || '';
          out.push({name, phone, rating, address: addr});
        } catch(e){}
      });
      return out;
    });

    // add unique 10-digit phones
    for(const it of newItems){
      if(!it.phone) continue;
      if(it.phone.length !== 10) continue;
      if(seenPhones.has(it.phone)) continue;
      seenPhones.add(it.phone);
      items.push(it);
    }

    // send progress
    const count = items.length;
    // estimate percent: heuristic - grows until stagnation; show 0..99 until final
    let percent = Math.min(99, Math.floor((count / Math.max(10, count + 10)) * 100));
    await postProgress(job_id, count, percent, 'running');

    // scroll gently
    try {
      if(feed){
        await page.evaluate(() => {
          const f = document.querySelector('[role="feed"]');
          f.scrollTop = f.scrollHeight;
        });
      } else {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      }
    } catch(e){}

    await sleep(600);

    // check growth
    if(count === lastCount) noGrowth++; else noGrowth = 0;
    lastCount = count;

    if(noGrowth >= 6) break;
  }

  // final final: write CSV
  const rows = [
    ['Name','Phone','Category','Rating','Address','City','State'],
    ...items.map(r => [r.name||'', r.phone||'', QUERY, r.rating||'', r.address||'', CITY, STATE])
  ];
  const csv = rows.map(r => r.map(c => `"${(c||'').toString().replace(/"/g,'""')}"`).join(',')).join('\\n');
  fs.writeFileSync(OUT, csv, 'utf8');

  // post final CSV to callback (form upload)
  if(CALLBACK){
    try {
      const formData = new (require('form-data'))();
      formData.append('job_id', job_id);
      formData.append('file', fs.createReadStream(OUT));
      await fetch(CALLBACK, {method:'POST', body: formData});
    } catch(e){
      // if fetch with form-data fails, fallback to curl via child_process
      try {
        const { execSync } = require('child_process');
        execSync(`curl -X POST -F "job_id=${job_id}" -F "file=@${OUT}" "${CALLBACK}"`, {stdio:'ignore'});
      } catch(e2){}
    }
  }

  // final progress update
  await postProgress(job_id, items.length, 100, 'completed');

  await browser.close();
  console.log(JSON.stringify({path: OUT, count: items.length}));
  process.exit(0);
})();
