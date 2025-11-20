function extractDevilData() {
    try {
        let results = [];
        let listings = document.querySelectorAll('div[role="article"]');

        listings.forEach(listing => {
            try {
                let name =
                    listing.querySelector('div.NwqBmc > div:nth-child(1) > div')
                        ?.innerText.trim() || "";

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

                results.push({ name, rating, category, phone: ph, address });
            } catch (e) {}
        });

        return results;

    } catch (err) {
        console.error("extractDevilData error:", err);
        return [];
    }
}

window.extractDevilData = extractDevilData;
