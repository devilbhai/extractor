const fs = require('fs');
const puppeteer = require('puppeteer');
const argv = require('minimist')(process.argv.slice(2));
const FormData = require('form-data');

const QUERY = argv.query || "";
const CITY = argv.city || "";
const STATE = argv.state || "";
const OUT = argv.out || "results.csv";
const CALLBACK = process.env.CALLBACK_URL || argv.callback || "";
const JOB_ID = argv.job_id || ("job_" + Date.now());

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {

    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox","--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/115 Safari/537.36"
    );

    const searchURL =
        "https://www.google.com/maps/search/" +
        encodeURIComponent(QUERY + " " + CITY);

    await page.goto(searchURL, { waitUntil: "networkidle2", timeout: 60000 });

    // Inject your WORKING DOM-BASED extraction function
    await page.addScriptTag({ path: "/mnt/data/content.js" });

    const results = [];

    let lastCount = 0;
    let noGrowth = 0;

    while (true) {
        const batch = await page.evaluate(() => {
            // THIS runs inside Chrome browser using your uploaded content.js
            if (typeof window.extractDevilData !== "function") return [];
            return window.extractDevilData();
        });

        batch.forEach(b => {
            if (b.phone && b.phone.length === 10) {
                if (!results.find(x => x.phone === b.phone)) {
                    results.push(b);
                }
            }
        });

        // Send progress
        const percent = Math.min(99, Math.floor((results.length / 50) * 10));
        if (CALLBACK) {
            await fetch(CALLBACK, {
                method: 'POST',
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    job_id: JOB_ID,
                    count: results.length,
                    percent,
                    status: "running"
                })
            }).catch(()=>{});
        }

        // Scroll logic EXACTLY like your content.js
        await page.evaluate(() => {
            const sc = document.querySelector('.m6QErb[aria-label]');
            if (sc) sc.scrollTop = sc.scrollHeight;
        });

        await sleep(800);

        if (results.length === lastCount) noGrowth++;
        else noGrowth = 0;

        lastCount = results.length;

        if (noGrowth >= 5) break;
    }

    // Save CSV
    const rows = [
        ["Name","Phone","Category","Rating","Address","City","State"],
        ...results.map(r => [
            r.name || "",
            r.phone || "",
            QUERY,
            r.rating || "",
            r.address || "",
            CITY,
            STATE
        ])
    ];

    const csv = rows
        .map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(","))
        .join("\n");

    fs.writeFileSync(OUT, csv, "utf8");

    // Final upload
    if (CALLBACK) {
        try {
            const form = new FormData();
            form.append("job_id", JOB_ID);
            form.append("file", fs.createReadStream(OUT));

            await fetch(CALLBACK, { method: "POST", body: form });
        } catch {
            const { execSync } = require("child_process");
            execSync(`curl -X POST -F "job_id=${JOB_ID}" -F "file=@${OUT}" "${CALLBACK}"`);
        }

        await fetch(CALLBACK, {
            method: 'POST',
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
                job_id: JOB_ID,
                count: results.length,
                percent: 100,
                status: "completed"
            })
        }).catch(()=>{});
    }

    await browser.close();
    console.log("Done. Extracted:", results.length);

})();
