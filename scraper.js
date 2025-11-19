const fs = require('fs');
const puppeteer = require('puppeteer');
const argv = require('minimist')(process.argv.slice(2));

(async () => {

  const QUERY = argv.query || "";
  const CITY = argv.city || "";
  const STATE = argv.state || "";
  const OUT = argv.out || "results.csv";

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
  );

  await page.goto(
    "https://www.google.com/maps/search/" + encodeURIComponent(QUERY + " " + CITY),
    { waitUntil: "networkidle2" }
  );

  const start = Date.now();

  const results = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const feed = document.querySelector('[role="feed"]');
    const seen = new Set();
    const items = [];

    function extractCard(card) {
      try {
        const key = (card.innerText || "").slice(0, 200);
        if (seen.has(key)) return null;
        seen.add(key);

        const name = card.querySelector(".qBF1Pd")?.innerText?.trim() || "";
        const rating = card.querySelector(".MW4etd")?.innerText?.trim() || "";
        const rawText = card.innerText;

        let phone = "";
        const m = rawText.match(/\+?\d[\d\-\s]{8,}/g);
        if (m && m.length) {
          phone = m[0].replace(/\D/g, "");
          if (phone.length > 10) phone = phone.slice(-10);
        }

        const address = rawText
          .split("\n")
          .filter(x => x.includes(",") && x.length > 10)[0] || "";

        return { name, rating, phone, address };
      } catch {
        return null;
      }
    }

    let lastHeight = 0;
    let noGrowth = 0;
    let loops = 0;

    while (true) {
      const cards = Array.from(document.querySelectorAll(".Nv2PK"));
      cards.forEach(c => {
        const data = extractCard(c);
        if (data && data.phone.length === 10) items.push(data);
      });

      feed.scrollTop = feed.scrollHeight;
      await sleep(700);

      if (feed.scrollHeight === lastHeight) {
        noGrowth++;
      } else {
        noGrowth = 0;
      }

      lastHeight = feed.scrollHeight;
      loops++;

      // stop conditions
      if (noGrowth >= 5) break;
      if (loops > 80) break;
    }

    const filtered = [];
    const seenPhones = new Set();
    for (const x of items) {
      if (!seenPhones.has(x.phone)) {
        seenPhones.add(x.phone);
        filtered.push(x);
      }
    }

    return filtered;
  });

  const rows = [
    ["Name","Phone","Category","Rating","Address","City","State"],
    ...results.map(r => [
      r.name, r.phone, QUERY, r.rating, r.address, CITY, STATE
    ])
  ];

  const csv = rows.map(r => r.map(c => `"${(c||"").replace(/"/g,'""')}"`).join(",")).join("\n");
  fs.writeFileSync(OUT, csv, "utf8");

  await browser.close();
})();
