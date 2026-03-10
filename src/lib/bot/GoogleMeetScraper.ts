import { Page } from "puppeteer";
import { ScraperPlugin } from "./ScraperPlugin";

export class GoogleMeetScraper implements ScraperPlugin {
    canHandle(url: string): boolean {
        return url.includes("meet.google.com");
    }

    async joinMeeting(page: Page, url: string, botName: string): Promise<void> {
        console.log(`Navigating to Google Meet: ${url}`);
        await page.goto(url, { waitUntil: "networkidle2" });

        // Note: A robust implementation will need to handle:
        // 1. Dismissing camera/mic permission popups
        // 2. Typing the botName into the "What's your name?" field if not logged in
        // 3. Clicking "Ask to join" or "Join now"
        // 4. Waiting until actually admitted into the room

        // For this prototype, we simulate waiting for the join button
        try {
            // Very basic Google Meet joining UI selectors (subject to change by Google)
            await page.waitForSelector('input[type="text"]', { timeout: 10000 });
            await page.type('input[type="text"]', botName);

            // Look for a button that contains 'Ask to join' or 'Join'
            const joinButtons = await page.$$('button');
            for (const btn of joinButtons) {
                const text = await page.evaluate(el => el.textContent, btn);
                if (text && (text.includes('Ask to join') || text.includes('Join'))) {
                    await btn.click();
                    break;
                }
            }
            console.log("Waiting to be admitted...");

            // Wait to be in the actual meeting room (look for the meeting controls bar)
            await page.waitForSelector('[data-meeting-title]', { timeout: 60000 });
            console.log("Successfully joined Google Meet!");

        } catch (e) {
            console.log("Error during join flow. Google UI may require manual intervention.", e);
        }
    }

    async startScraping(page: Page): Promise<string> {
        let fullTranscript = "";

        // 1. Turn on captions (Click the 'Turn on captions' CC button)
        try {
            const buttons = await page.$$('button');
            for (const btn of buttons) {
                const text = await page.evaluate(el => el.getAttribute('aria-label'), btn);
                if (text && text.toLowerCase().includes('captions')) {
                    await btn.click();
                    console.log("Turned on live captions.");
                    break;
                }
            }
        } catch (e) {
            console.log("Could not find captions button.");
        }

        console.log("Starting to scrape captions...");

        // 2. Poll the DOM for new caption text
        // (This is a simplified loop that would normally run until the meeting ends)
        // For demonstration, we'll just run it for a set time or until a certain condition

        let lastCaption = "";
        const scrapingInterval = setInterval(async () => {
            try {
                // Find the element Google Meet uses for captions (this class name often changes)
                const captionElements = await page.$$('div[class*="iTtpOb"]');
                let currentText = "";

                for (const el of captionElements) {
                    const text = await page.evaluate(e => e.textContent, el);
                    currentText += text + " ";
                }

                if (currentText && currentText !== lastCaption) {
                    fullTranscript += currentText + "\n";
                    lastCaption = currentText;
                    // console.log(`Scraped: ${currentText}`);
                }
            } catch (e) {
                // Ignore errors if DOM elements disappear temporarily
            }
        }, 2000);

        // Wait until the meeting ends (e.g., waiting for a specific 'You left the meeting' element)
        // For now, we simulate waiting 60 seconds
        return new Promise((resolve) => {
            setTimeout(() => {
                clearInterval(scrapingInterval);
                resolve(fullTranscript);
            }, 60000);
        });
    }
}
