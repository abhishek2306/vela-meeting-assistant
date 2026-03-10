import puppeteer from "puppeteer";
import { GoogleMeetScraper } from "./GoogleMeetScraper";
import { ScraperPlugin } from "./ScraperPlugin";

// Registry of supported platform scrapers
const scrapers: ScraperPlugin[] = [
    new GoogleMeetScraper(),
    // new MsTeamsScraper(), // Can be added later
];

export async function runMeetingBot(meetingUrl: string, meetingId: string, botName = "AI Notetaker") {
    console.log(`[Bot Runner] Starting bot for ${meetingUrl}`);

    // 1. Identify which scraper to use based on the URL
    const scraper = scrapers.find(s => s.canHandle(meetingUrl));
    if (!scraper) {
        throw new Error(`Unsupported meeting platform URL: ${meetingUrl}`);
    }

    // 2. Launch headless Chrome
    // We specify args to optimize for audio/video scraping and bypass permissions
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--use-fake-ui-for-media-stream',
            '--disable-notifications',
            '--disable-media-session-api',
            '--window-size=1280,720' // Ensure a consistent viewport for DOM selectors
        ],
    });

    const page = await browser.newPage();

    // Set a standard user agent to avoid looking like a bot
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');

    try {
        // 3. Delegate joining and waiting room logic to the specific platform plugin
        console.log(`[Bot Runner] Delegating join flow to scraper plugin...`);
        await scraper.joinMeeting(page, meetingUrl, botName);

        // 4. Delegate the actual caption scraping loop
        console.log(`[Bot Runner] Delegating transcript scraping...`);
        const finalTranscript = await scraper.startScraping(page);

        console.log(`[Bot Runner] Scraping complete. Captured ${finalTranscript.length} characters.`);

        // 5. Here we will eventually save finalTranscript to the database associated with meetingId
        // await prisma.transcript.create({ data: { text: finalTranscript, meetingId } });

        return finalTranscript;

    } catch (error) {
        console.error("[Bot Runner] Error during bot execution:", error);
        throw error;
    } finally {
        console.log("[Bot Runner] Closing browser...");
        await browser.close();
    }
}
