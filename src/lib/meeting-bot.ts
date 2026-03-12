import puppeteer, { Page, Browser } from 'puppeteer';
import path from 'path';
import fs from 'fs';
interface BotConfig {
    meetingUrl: string;
    userId: string;
    meetingId?: string;
}

export class MeetingBot {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private transcript: string[] = [];
    private config: BotConfig;
    private isActive: boolean = false;
    private lastSpeaker: string = "";

    constructor(config: BotConfig) {
        this.config = config;
    }

    async start() {
        console.log(`[Bot] Starting for meeting: ${this.config.meetingUrl}`);
        
        const userDataDir = path.join(process.cwd(), 'puppeteer_data');
        if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir);

        this.browser = await puppeteer.launch({
            headless: false, // Start with false for debugging/initial login
            args: [
                '--use-fake-ui-for-media-stream',
                '--disable-notifications',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ],
            userDataDir
        });

        this.page = await this.browser.newPage();
        
        // Manual Stealth Injection (Webpack Safe bypass for puppeteer-extra-plugin-stealth)
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
        });
        
        // Override user agent to look like a standard Chrome browser
        await this.page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

        // Block mic/camera permissions properly
        const context = this.browser.defaultBrowserContext();
        await context.overridePermissions(this.config.meetingUrl, ['microphone', 'camera', 'notifications']);

        await this.page.goto(this.config.meetingUrl, { waitUntil: 'networkidle2' });
        
        this.isActive = true;
        await this.prepareMeeting();
        this.listenForCaptions();
    }

    private async prepareMeeting() {
        if (!this.page) return;

        try {
            // 1. Mute Mic and Camera immediately
            // Google Meet buttons usually have specific aria-labels
            const micButton = 'div[aria-label*="microphone"][role="button"]';
            const camButton = 'div[aria-label*="camera"][role="button"]';
            
            await this.page.waitForSelector(micButton, { timeout: 10000 });
            
            // Check if they are already off or on. Usually "Turn off microphone" vs "Turn on microphone"
            const micStatus = await this.page.$eval(micButton, el => el.getAttribute('aria-label'));
            if (micStatus?.toLowerCase().includes('turn off')) {
                await this.page.click(micButton);
            }

            const camStatus = await this.page.$eval(camButton, el => el.getAttribute('aria-label'));
            if (camStatus?.toLowerCase().includes('turn off')) {
                await this.page.click(camButton);
            }

            // 2. Join the meeting
            // Could be "Join now" or "Ask to join"
            const joinButton = 'span:contains("Join now"), span:contains("Ask to join")';
            // Since :contains is not standard CSS, manually find
            await this.page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
                const joinBtn = buttons.find(b => 
                    b.textContent?.includes('Join now') || 
                    b.textContent?.includes('Ask to join')
                ) as HTMLElement;
                if (joinBtn) joinBtn.click();
            });

            console.log("[Bot] Clicked Join Button");

            // 3. Turn on Captions
            // Wait until joined
            await new Promise(resolve => setTimeout(resolve, 5000));
            const captionButton = 'button[aria-label*="captions"]';
            await this.page.waitForSelector(captionButton);
            await this.page.click(captionButton);
            console.log("[Bot] Enabled Captions");

        } catch (error) {
            console.error("[Bot] Error during preparation:", error);
        }
    }

    private async listenForCaptions() {
        if (!this.page) return;

        console.log("[Bot] Listening for captions...");

        // Meet Captions DOM structure (approximate as of 2024/2025)
        // Usually it's in a container with class like 'VpW9d' 
        // We'll use a MutationObserver via evaluate
        await this.page.exposeFunction('onCaptionUpdate', (speaker: string, text: string) => {
            if (!text) return;
            
            // Avoid duplicate appends from rapid mutations
            const fullLine = speaker ? `${speaker}: ${text}` : text;
            if (this.transcript.length > 0 && this.transcript[this.transcript.length - 1] === fullLine) return;

            if (speaker && speaker !== this.lastSpeaker) {
                this.transcript.push(`\n[${speaker}]`);
                this.lastSpeaker = speaker;
            }
            this.transcript.push(text);
            console.log(`[Bot Transcript] ${speaker}: ${text}`);
        });

        await this.page.evaluate(() => {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    const nodes = Array.from(mutation.addedNodes) as HTMLElement[];
                    nodes.forEach(node => {
                        // Look for caption blocks
                        // Usually have aria-label or specific classes
                        if (node.tagName === 'DIV' && (node.innerText || node.textContent)) {
                            // Find the container that has speaker and text
                            // This structure is brittle but we can look for specific patterns
                            const speakerEl = node.querySelector('.uS79f, .ZS79f'); // Common speaker classes
                            const textEl = node.querySelector('.VpW9d, .iO9X6b');   // Common text classes
                            
                            if (textEl) {
                                const speaker = speakerEl?.textContent?.trim() || "Unknown";
                                const text = textEl.textContent?.trim() || "";
                                (window as any).onCaptionUpdate(speaker, text);
                            }
                        }
                    });
                });
            });

            // Target the caption container
            const target = document.body; // Safer to start wide or find the specific container
            observer.observe(target, { childList: true, subtree: true });
        });
    }

    async stop() {
        this.isActive = false;
        const fullTranscript = this.transcript.join(" ");
        console.log("[Bot] Meeting ended. Transcript captured.");
        
        if (this.browser) {
            await this.browser.close();
        }

        return fullTranscript;
    }

    getIsActive() {
        return this.isActive;
    }
}
