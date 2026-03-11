import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { GoogleMeetScraper } from "./GoogleMeetScraper";
import { ScraperPlugin } from "./ScraperPlugin";

// Registry of supported platform scrapers
const scrapers: ScraperPlugin[] = [
    new GoogleMeetScraper(),
];

// Guard: only register StealthPlugin once to prevent "already registered" errors
let stealthRegistered = false;

export async function runMeetingBot(meetingUrl: string, meetingId: string, botName = "Vela Bot") {
    if (!stealthRegistered) {
        puppeteer.use(StealthPlugin());
        stealthRegistered = true;
    }

    console.log(`[Bot Runner] Starting bot for ${meetingUrl}`);

    const scraper = scrapers.find(s => s.canHandle(meetingUrl));
    if (!scraper) {
        throw new Error(`Unsupported meeting platform URL: ${meetingUrl}`);
    }

    // Determine Chrome profile path from env or use default
    const chromeUserDataDir = process.env.CHROME_USER_DATA_DIR
        || 'C:\\Users\\abhid\\AppData\\Local\\Google\\Chrome\\User Data';
    const chromeProfileDir = process.env.CHROME_PROFILE_DIR || 'Default';

    // Try to find the real Chrome executable
    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.CHROME_PATH || '',
    ];

    let executablePath: string | undefined;
    const fs = require('fs');
    for (const p of chromePaths) {
        if (p && fs.existsSync(p)) {
            executablePath = p;
            break;
        }
    }

    console.log(`[Bot Runner] Using Chrome profile: ${chromeUserDataDir} (${chromeProfileDir})`);
    if (executablePath) {
        console.log(`[Bot Runner] Using Chrome executable: ${executablePath}`);
    } else {
        console.log(`[Bot Runner] Using Puppeteer's bundled Chromium (real Chrome not found)`);
    }

    // Launch Chrome with the user's REAL profile — this bypasses Google's anti-bot fingerprinting
    // IMPORTANT: All other Chrome windows must be closed before running this!
    const browser = await puppeteer.launch({
        headless: false, // Must be false to pass Google's bot detection
        ...(executablePath ? { executablePath } : {}),
        args: [
            `--user-data-dir=${chromeUserDataDir}`,
            `--profile-directory=${chromeProfileDir}`,
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--disable-notifications',
            '--disable-media-session-api',
            '--window-size=1280,720',
            '--mute-audio',
            '--no-first-run',
            '--no-default-browser-check',
        ],
    });

    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    try {
        // Delegate joining and waiting room logic to the platform plugin
        console.log(`[Bot Runner] Delegating join flow to scraper plugin...`);
        await scraper.joinMeeting(page, meetingUrl, botName);

        // Delegate the actual caption scraping loop
        console.log(`[Bot Runner] Delegating transcript scraping...`);
        const finalTranscript = await scraper.startScraping(page);

        console.log(`[Bot Runner] Scraping complete. Captured ${finalTranscript.length} characters.`);

        // Send the transcript to our local webhook to trigger MoM generation
        try {
            const webhookUrl = process.env.NEXTAUTH_URL
                ? `${process.env.NEXTAUTH_URL}/api/webhooks/bot`
                : 'http://localhost:3000/api/webhooks/bot';

            console.log(`[Bot Runner] Forwarding transcript to webhook: ${webhookUrl}`);
            const res = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    meetingId,
                    transcriptText: finalTranscript,
                    source: "BOT"
                })
            });

            if (!res.ok) throw new Error(`Webhook failed with status ${res.status}`);
            console.log(`[Bot Runner] Webhook triggered successfully.`);

        } catch (postError) {
            console.error("[Bot Runner] Failed to post transcript to webhook:", postError);
        }

        return finalTranscript;

    } catch (error) {
        console.error("[Bot Runner] Error during bot execution:", error);
        throw error;
    } finally {
        console.log("[Bot Runner] Closing browser...");
        await browser.close();
    }
}
