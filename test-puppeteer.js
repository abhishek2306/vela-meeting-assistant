const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    try {
        console.log("Launching...");
        const browser = await puppeteer.launch({ headless: true });
        console.log("Launched successfully.");
        await browser.close();
    } catch (err) {
        console.error("Puppeteer error:", err);
    }
})();
