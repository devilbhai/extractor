const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const argv = require("minimist")(process.argv.slice(2));
const FormData = require("form-data");

const QUERY = argv.query || "";
const CITY = argv.city || "";
const STATE = argv.state || "";
const OUT = argv.out || "results.csv";
const CALLBACK = process.env.CALLBACK_URL || argv.callback || "";
const JOB_ID = argv.job_id || ("job_" + Date.now());

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function postProgress(count, percent, status = "running") {
    if (!CALLBACK) return;
    try {
        await fetch(CALLBACK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ job_id: JOB_ID, count, percent, status })
        });
    } catch (e) {}
}

(async () => {

    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });

    const page = await browser.newPage();

    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/115 Safari/537.36"
    );

    await page.goto(
        "https://www.google.com/maps/search/" + encodeURIComponent(`${QUERY} ${CITY}`),
        { waitUntil: "networkidle2", timeout: 60000 }
    );
const html = await page.evaluate(() => document.body.innerHTML);
fs.writeFileSync("debug.html", html);
console.log("HTML saved");
    
    // Inject content.js ONCE
    await page.addScriptTag({
        path: path.join(__dirname, "content.js")
    });

    let results = [];
    let seen = new Set();

    for (let i = 0; i < 60; i++) {

        // extract visible batch
        let batch = await page.evaluate(() => {
            return (typeof extractDevilData === "function") ? extractDevilData() : [];
        });

        batch.forEach(b => {
            if (!seen.has(b.phone)) {
                seen.add(b.phone);
                results.push(b);
            }
        });

        await postProgress(results.length, Math.min(99, i * 2), "running");

        // scroll down
        await page.evaluate(() => {
            let t = document.querySelector('.m6QErb[aria-label]');
            if (t) t.scrollTop = t.scrollHeight;
        });

        await sleep(1000);
    }

    // Write CSV
    let rows = [
        ["Name", "Phone", "Category", "Rating", "Address", "City", "State"],
        ...results.map(r => [
            r.name, r.phone, QUERY, r.rating, r.address, CITY, STATE
        ])
    ];

    fs.writeFileSync(
        OUT,
        rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"),
        "utf8"
    );

    // Upload CSV to callback
    if (CALLBACK) {
        try {
            const fd = new FormData();
            fd.append("job_id", JOB_ID);
            fd.append("file", fs.createReadStream(OUT));
            await fetch(CALLBACK, { method: "POST", body: fd });
        } catch (e) {}
        await postProgress(results.length, 100, "completed");
    }

    console.log("Extracted:", results.length);
    await browser.close();

})();
