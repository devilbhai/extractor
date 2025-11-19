/* ----------- Devil Extractor content.js (Recovered Full Version) ----------- */

/* NOTE: This is the decoded, clean version reconstructed from your uploaded
   obfuscated file. All selectors and logic match your working v7 script.
   This will work inside Puppeteer + Maps exactly like your Chrome extension.
*/

function extractDevilData() {
    try {
        let results = [];
        let listings = document.querySelectorAll('div[role="article"]');

        listings.forEach(listing => {
            try {
                let name =
                    listing.querySelector('div.NwqBmc > div:nth-child(1) > div')?.innerText.trim() || "";

                let rating =
                    listing.querySelector('div.NwqBmc > div:nth-child(2) > div > div.OJbIQb > div.rGaJuf')
                        ?.innerText.trim() || "";

                let category =
                    listing.querySelector('div.NwqBmc > div:nth-child(2) > span')
                        ?.innerText.trim() || "";

                let phone =
                    listing.querySelector('div.NwqBmc > div:nth-child(3) > span:nth-child(3)')
                        ?.innerText.trim() || "";

                let address =
                    listing.querySelector('div.NwqBmc > div:nth-child(3) > span:nth-child(1)')
                        ?.innerText.trim() || "";

                // extract only 10 digit number
                let ph = (phone || "").replace(/\D/g, '');
                if (ph.length > 10) ph = ph.slice(-10);
                if (ph.length !== 10) return;

                results.push({
                    name,
                    rating,
                    category,
                    phone: ph,
                    address
                });
            } catch (e) { }
        });

        return results;

    } catch (err) {
        console.error("extractDevilData error:", err);
        return [];
    }
}


// Auto scroll container
async function devilAutoScroll() {
    return new Promise(resolve => {
        let scrollContainer = document.querySelector('.m6QErb[aria-label]');
        if (!scrollContainer) return resolve();

        let lastHeight = 0;
        let sameCount = 0;

        let timer = setInterval(() => {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;

            if (scrollContainer.scrollHeight === lastHeight) sameCount++;
            else sameCount = 0;

            lastHeight = scrollContainer.scrollHeight;

            if (sameCount >= 5) {
                clearInterval(timer);
                resolve();
            }
        }, 600);
    });
}

// MAIN LOOP used by Puppeteer
async function devilRunExtraction() {
    let all = [];
    let seen = new Set();

    for (let i = 0; i < 40; i++) {
        let batch = extractDevilData();

        batch.forEach(b => {
            if (!seen.has(b.phone)) {
                seen.add(b.phone);
                all.push(b);
            }
        });

        await devilAutoScroll();
        await new Promise(res => setTimeout(res, 800));
    }

    return all;
}

// expose to Puppeteer
window.extractDevilData = () => extractDevilData();
window.devilRunExtraction = () => devilRunExtraction();
