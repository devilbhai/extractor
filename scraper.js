// scraper.js
// Puppeteer scraper used inside GitHub Actions
// Usage (GitHub Action will call): node scraper.js --query="car dealer" --city="Rajkot" --state="Gujarat" --out=results.csv

const fs = require('fs');
const puppeteer = require('puppeteer');
const argv = require('minimist')(process.argv.slice(2));

(async () => {
  const QUERY = (argv.query || '').trim();
  const CITY = (argv.city || '').trim();
  const STATE = (argv.state || '').trim() || '';
  const OUT = argv.out || (`./results_${Date.now()}.csv`);
  const HEADLESS = argv.headless === 'false' ? false : true;

  if (!QUERY) {
    console.error('Missing --query');
    process.exit(2);
  }

  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  );

  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(QUERY + ' ' + CITY)}`;
  console.log('Opening', searchUrl);

  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  // evaluate inside the page
  const result = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    function parseAddress(text) {
      if (!text) return '';
      return text.replace(/\s+/g, ' ').trim();
    }

    const feed = document.querySelector('[role="feed"]') || document.querySelector('.section-layout') || document;
    const seen = new Set();
    const items = [];
    let lastCount = 0, noGrowth = 0, loop = 0, totalFound = 0;

    function processCard(card) {
      try {
        const key = (card.getAttribute('data-result-id') || card.innerText || '').slice(0, 200);
        if (seen.has(key)) return null;
        seen.add(key);

        const name = card.querySelector('.qBF1Pd')?.innerText?.trim() || '';
        const rating = card.querySelector('.MW4etd')?.innerText?.trim() || '';

        let phone = '';
        const pAttr = card.querySelector('[data-phone-number]');
        if (pAttr) phone = (pAttr.getAttribute('data-phone-number') || '').replace(/\D/g, '');
        else {
          const m = (card.innerText || '').match(/\+?\d[\d\-\s]{8,}/g);
          if (m && m.length) phone = m[0].replace(/\D/g, '');
        }
        if (phone.length > 10) phone = phone.slice(-10);

        let addressText = '';
        const addrBtn = card.querySelector('button[data-item-id="address"] span') || card.querySelector('.rllt__details');
        if (addrBtn) addressText = addrBtn.innerText.trim();
        if (!addressText) {
          const lines = (card.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
          addressText = lines.find(l => l.includes(',') && l.length > 10) || '';
        }
        const address = parseAddress(addressText);

        return { name, phone, rating, address };
      } catch (e) {
        return null;
      }
    }

    // initial parse
    const initial = Array.from(document.querySelectorAll('.Nv2PK')).filter(c => c.offsetParent !== null);
    for (const c of initial) {
      const it = processCard(c);
      if (it && it.phone && it.phone.length === 10) { items.push(it); totalFound++; }
    }

    // scroll loop: gentle scrolling, stop when no growth
    while (loop < 300) {
      loop++;
      try {
        if (feed && feed.scrollTop !== undefined) {
          feed.scrollTop = feed.scrollHeight; await sleep(350);
          feed.scrollTop = Math.floor(feed.scrollHeight * 0.6); await sleep(250);
          feed.scrollTop = feed.scrollHeight; await sleep(400);
        } else {
          window.scrollTo(0, document.body.scrollHeight); await sleep(700);
        }
      } catch (e) {
        await sleep(500);
      }

      const cards = Array.from(document.querySelectorAll('.Nv2PK')).filter(c => c.offsetParent !== null);
      for (const c of cards) {
        const it = processCard(c);
        if (it && it.phone && it.phone.length === 10) {
          items.push(it); totalFound++;
        }
      }

      const currentCount = Array.from(document.querySelectorAll('.Nv2PK')).filter(c => c.offsetParent !== null).length;
      const currentScrollHeight = feed.scrollHeight || document.body.scrollHeight;
      if (currentCount === lastCount && currentScrollHeight === (window._lastScrollHeight || 0)) noGrowth++;
      else noGrowth = 0;

      window._lastScrollHeight = currentScrollHeight;
      lastCount = currentCount;

      if (noGrowth >= 3) break;
      await sleep(200);
    }

    // dedupe by phone
    const uniq = []; const seenPhone = new Set();
    for (const it of items) {
      if (!it.phone) continue;
      if (seenPhone.has(it.phone)) continue;
      seenPhone.add(it.phone);
      uniq.push(it);
    }
    return { items: uniq, count: uniq.length };
  });

  // attach category/city/state from args
  const final = result.items.map(it => ({
    name: it.name,
    phone: it.phone,
    category: QUERY,
    rating: it.rating,
    address: it.address,
    city: CITY,
    state: STATE
  }));

  const rows = [
    ['Name','Phone','Category','Rating','Address','City','State'],
    ...final.map(r => [r.name||'', r.phone||'', r.category||'', r.rating||'', r.address||'', r.city||'', r.state||''])
  ];

  const csv = rows.map(r => r.map(c => `\"${(c||'').toString().replace(/\"/g,'\"\"')}\"`).join(',')).join('\n');
  fs.writeFileSync(OUT, csv, 'utf8');

  console.log(JSON.stringify({ path: OUT, count: final.length }));
  await browser.close();
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
