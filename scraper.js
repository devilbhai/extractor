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
            body: JSON.stringify({
                job_id: JOB_ID,
                count,
                percent,
                status
            })
        });
    } catch (e) {}
}

(async () => {

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage"
        ]
    });

    const page = await browser.newPage();

    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/115 Safari/537.36"
    );

    const url =
        "https://www.google.com/maps/search/" +
        encodeURIComponent(`${QUERY} ${CITY}`);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // ================================
    // 🔥 Inject content.js ONLY ONCE
    // ================================
    const alreadyInjected = await page.evaluate(() => window.__DEVIL_INJECTED__ === true);

    if (!alreadyInjected) {
        await page.addScriptTag({
            path: path.join(__dirname, "content.js")
        });

        await page.evaluate(() => {
            window.__DEVIL_INJECTED__ = true;
        });
    }

    // ================================
    // 🔥 RUN ONE FULL EXTRACTION
    // ================================
    let allResults = await page.evaluate(async () => {
        if (typeof window.devilRunExtraction !== "function") {
            return [];
        }
        return await window.devilRunExtraction();
    });

    // ================
    // REMOVE DUPLICATES
    // ================
    let seen = new Set();
    let finalResults = [];

    allResults.forEach(r => {
        let ph = (r.phone || "").replace(/\D/g, "");
        if (ph.length === 10 && !seen.has(ph)) {
            seen.add(ph);
            finalResults.push(r);
        }
    });

    // Update progress
    await postProgress(finalResults.length, 100, "completed");

    // ============================
    // 🔥 SAVE CSV
    // ============================
    let rows = [
        ["Name", "Phone", "Category", "Rating", "Address", "City", "State"],
        ...finalResults.map(r => [
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

    // ============================
    // 🔥 SEND BACK TO CALLBACK
    // ============================
    if (CALLBACK) {
        try {
            const form = new FormData();
            form.append("job_id", JOB_ID);
            form.append("file", fs.createReadStream(OUT));

            await fetch(CALLBACK, { method: "POST", body: form });
        } catch (err) {
            const { execSync } = require("child_process");
            execSync(
                `curl -X POST -F "job_id=${JOB_ID}" -F "file=@${OUT}" "${CALLBACK}"`
            );
        }

        await postProgress(finalResults.length, 100, "completed");
    }

    await browser.close();
    console.log("Extracted:", finalResults.length);

})();
