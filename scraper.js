const fs = require("fs");
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
            body: JSON.stringify({
                job_id: JOB_ID,
                count,
                percent,
                status
            })
        });
    } catch (e) { }
}

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/115 Safari/537.36"
    );

    const url = "https://www.google.com/maps/search/" + encodeURIComponent(QUERY + " " + CITY);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // LOAD YOUR WORKING content.js
    await page.addScriptTag({
        url: "https://raw.githubusercontent.com/devilbhai/extractor/main/content.js"
    });

    let results = [];
    let seen = new Set();
    let noGrowth = 0;
    let lastCount = 0;

    for (let i = 0; i < 80; i++) {

        // Run extraction batch inside Maps page
        const batch = await page.evaluate(async () => {
            if (typeof window.devilRunExtraction !== "function") return [];
            const part = await window.extractDevilData();
            return part;
        });

        batch.forEach(b => {
            if (!b.phone) return;
            const ph = b.phone.replace(/\D/g, "");
            if (ph.length !== 10) return;
            if (seen.has(ph)) return;
            seen.add(ph);
            results.push(b);
        });

        // Send progress
        const percent = Math.min(99, Math.floor((results.length / 30) * 10));
        await postProgress(results.length, percent, "running");

        // Scroll in Maps
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

    // Convert results to CSV
    const rows = [
        ["Name", "Phone", "Category", "Rating", "Address", "City", "State"],
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
        .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\n");

    fs.writeFileSync(OUT, csv, "utf8");

    // Upload final CSV
    if (CALLBACK) {
        try {
            const f = new FormData();
            f.append("job_id", JOB_ID);
            f.append("file", fs.createReadStream(OUT));

            await fetch(CALLBACK, { method: "POST", body: f });
        } catch (e) {
            // fallback curl
            const { execSync } = require("child_process");
            execSync(`curl -X POST -F "job_id=${JOB_ID}" -F "file=@${OUT}" "${CALLBACK}"`);
        }

        // Final status
        await postProgress(results.length, 100, "completed");
    }

    await browser.close();

    console.log("Extracted:", results.length);

})();
