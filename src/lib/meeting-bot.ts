import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Page, Browser } from 'puppeteer';
import path from 'path';
import fs from 'fs';

// Force register plugin once
let stealthInitialized = false;

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
    private status: string = "Idle";
    private lastSpeaker: string = "";
    private currentProfileDir: string = "";

    constructor(config: BotConfig) {
        this.config = config;
    }

    async start() {
        this.status = "Launching Engine...";
        console.log(`[Bot] Starting for meeting: ${this.config.meetingUrl}`);
        
        if (!stealthInitialized) {
            puppeteer.use(StealthPlugin());
            stealthInitialized = true;
        }

        const baseDataDir = path.join(process.cwd(), 'puppeteer_data');
        if (!fs.existsSync(baseDataDir)) fs.mkdirSync(baseDataDir);

        // CREATE UNIQUE SESSION DIR to prevent "Browser already running" lock errors
        this.currentProfileDir = path.join(baseDataDir, `session_${Date.now()}_${Math.random().toString(36).substring(7)}`);
        fs.mkdirSync(this.currentProfileDir);

        // Try to find the real Chrome executable for better reliability on Windows
        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.CHROME_PATH || '',
        ];

        let executablePath: string | undefined;
        for (const p of chromePaths) {
            if (p && fs.existsSync(p)) {
                executablePath = p;
                break;
            }
        }

        if (executablePath) {
            console.log(`[Bot] 🚀 Using real Chrome executable: ${executablePath}`);
        } else {
            console.log(`[Bot] ⚠️ Real Chrome not found, relying on Puppeteer default.`);
        }

        this.browser = await puppeteer.launch({
            headless: false, 
            ...(executablePath ? { executablePath } : {}),
            args: [
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream',
                '--disable-notifications',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1280,720',
                '--start-maximized'
            ],
            userDataDir: this.currentProfileDir,
            ignoreDefaultArgs: ['--enable-automation'] 
        });

        // Get the default page or create one
        const pages = await this.browser.pages();
        this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();

        if (!this.page) throw new Error("Could not initialize browser page.");

        // Use dynamic User Agent from the real browser to avoid "outdated browser" blocks
        const defaultUA = await this.browser.userAgent();
        const userAgent = defaultUA.replace(/HeadlessChrome/g, 'Chrome');
        await this.page.setUserAgent(userAgent);


        // EXTRA STEALTH: Set Realistic Headers
        await this.page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
        });

        // Set Viewport to a common size
        await this.page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

        // IMPORTANT: Set active BEFORE navigation so state sync works
        this.isActive = true;
        this.status = "Joining Lobby...";

        // Block mic/camera permissions properly
        const context = this.browser ? this.browser.defaultBrowserContext() : null;
        if (context) {
            await context.overridePermissions(this.config.meetingUrl, ['microphone', 'camera', 'notifications']);
        }

        // Add a random delay to simulate human navigation
        await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));
        
        try {
            await this.page.goto(this.config.meetingUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        } catch (err) {
            console.error("[Bot] Navigation failed:", err);
            this.status = "Navigation Failed";
            await this.stop();
            throw err;
        }
        
        // Final check for immediate blocks
        const blockedInfo = await this.page.evaluate(() => {
            const body = document.body?.innerText || "";
            const isBlocked = body.includes("You can't join this video call") || 
                              body.includes("automated queries") ||
                              body.includes("Return to home screen");
            return { isBlocked, textPreview: body.slice(0, 150) };
        });

        if (blockedInfo.isBlocked) {
            console.error(`[Bot] ❌ Immediate Block Detected. Text seen: ${blockedInfo.textPreview.replace(/\\n/g, ' ')}...`);
            this.status = "Access Denied";
            await this.stop(); 
            throw new Error("ACCESS_DENIED_BY_GOOGLE");
        }

        await this.prepareMeeting();
        this.status = "Recording";
        this.listenForCaptions();
    }

    private async prepareMeeting() {
        if (!this.page) return;

        try {
            // 0. Check for "You can't join" error page immediately
            const blockPageText = await this.page.evaluate(() => {
                return document.body.innerText.includes("You can't join this video call") || 
                       document.body.innerText.includes("You can't join this call");
            });

            if (blockPageText) {
                console.error("[Bot] ❌ Access Denied: Google blocked the bot or the meeting is restricted.");
                throw new Error("ACCESS_DENIED_BY_GOOGLE");
            }

            // 1. Handle potential "Continue without microphone and camera" prompts
            await this.page.evaluate(() => {
                const continueBtn = Array.from(document.querySelectorAll('span, button')).find(
                    el => el.textContent?.includes('Continue without microphone')
                ) as HTMLElement;
                if (continueBtn) continueBtn.click();
            }).catch(() => {});

            // 2. Mute Mic and Camera (Best Effort)
            const micButton = 'div[aria-label*="microphone"][role="button"], button[aria-label*="microphone"]';
            const camButton = 'div[aria-label*="camera"][role="button"], button[aria-label*="camera"]';
            
            try {
                // Wait for the buttons, but don't crash if they don't appear (e.g., if permissions are permanently blocked by Google)
                await this.page.waitForSelector(micButton, { timeout: 10000 });
                
                const micStatus = await this.page.$eval(micButton, el => el.getAttribute('aria-label'));
                if (micStatus?.toLowerCase().includes('turn off')) {
                    await this.page.click(micButton).catch(() => {});
                }

                const camStatus = await this.page.$eval(camButton, el => el.getAttribute('aria-label'));
                if (camStatus?.toLowerCase().includes('turn off')) {
                    await this.page.click(camButton).catch(() => {});
                }
            } catch (err) {
                console.log("[Bot] Mic/Cam toggle buttons not found. Google Meet might have blocked hardware permissions or changed the UI. Proceeding to join anyway...");
            }

            // 2. Join the meeting
            // Sometimes guest joining requires a name
            const nameInput = 'input[aria-label="Your name"], input[placeholder="Your name"]';
            const existsNameInput = await this.page.$(nameInput);
            if (existsNameInput) {
                await this.page.type(nameInput, "Vela Assistant (Bot)");
                await new Promise(r => setTimeout(r, 1000));
            }

            // Could be "Join now" or "Ask to join"
            await this.page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
                const joinBtn = buttons.find(b => 
                    b.textContent?.includes('Join now') || 
                    b.textContent?.includes('Ask to join') ||
                    b.textContent?.includes('Join anyway')
                ) as HTMLElement;
                if (joinBtn) joinBtn.click();
            });
            this.status = "Waiting for Admission...";
            console.log("[Bot] ✅ Clicked Join Button. Waiting for admission...");

            // 3. Wait until admitted (Lobby check)
            // Long timeout for admission
            await this.page.waitForFunction(() => {
                const body = document.body.innerText.toLowerCase();
                // Successfully joined if we see the leave button or captions button
                return document.querySelector('button[aria-label*="Leave"], button[aria-label*="captions"]') !== null ||
                       body.includes("you're in the call");
            }, { timeout: 120000 }).catch(() => {
                console.log("[Bot] Still in lobby or host didn't admit. Proceeding with caption check...");
                this.status = "Lobby Timeout";
            });

            const captionButton = 'button[aria-label*="captions"]';
            await this.page.waitForSelector(captionButton, { timeout: 10000 }).catch(() => {
                console.log("[Bot] Caption button not found. May still be in lobby.");
            });
            await this.page.click(captionButton).catch(() => {});
            console.log("[Bot] Attempted to Enable Captions");
            this.status = "In Meeting";

        } catch (error: any) {
            console.error("[Bot] Error during preparation:", error);
            
            // TAKE A SCREENSHOT FOR DEBUGGING
            try {
                if (this.page) {
                    const errPath = path.join(process.cwd(), 'puppeteer_data', `error_${Date.now()}.png`);
                    await this.page.screenshot({ path: errPath });
                    console.log(`[Bot] 📸 Saved error screenshot to ${errPath}`);
                }
            } catch (screenshotErr) {
                console.error("[Bot] Failed to take debug screenshot", screenshotErr);
            }

            if (error.message === "ACCESS_DENIED_BY_GOOGLE") {
                this.status = "Access Denied";
            } else {
                this.status = "Preparation Failed";
            }
            throw error; // Propagate to start()'s caller or catch block
        }
    }

    private async listenForCaptions() {
        if (!this.page) return;

        console.log("[Bot] Listening for captions...");
        this.status = "Listening for Captions";

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
                            const speakerEl = node.querySelector('.uS79f, .ZS79f, .poFWrd'); // Common speaker classes
                            const textEl = node.querySelector('.VpW9d, .iO9X6b, .CNusmb');   // Common text classes
                            
                            let speaker = "Unknown";
                            let text = "";

                            if (textEl) {
                                speaker = speakerEl?.textContent?.trim() || "Unknown";
                                text = textEl.textContent?.trim() || "";
                            } else {
                                // FALLBACK: Google Meet changed CSS classes. Grab raw text but filter aggressively.
                                // Don't process menus, dialogs, or tooltips
                                if (node.closest('[role="menu"], [role="dialog"], [role="tooltip"], nav, header')) return;

                                const innerText = node.innerText || node.textContent || "";
                                
                                // Google Meet UI elements to ignore
                                const ignoreList = ["BETA", "Font size", "Font color", "Open caption settings", "Meeting timer", "Press Down Arrow", "Hand raises", "Turn off captions", "No one else is in this meeting", "You left the meeting", "Return to home screen", "Submit feedback", "Your meeting is safe", "Learn more", "People", "Open settings"];
                                if (ignoreList.some(ignore => innerText.includes(ignore))) return;

                                const parts = innerText.split('\\n').map(p => p.trim()).filter(p => p.length > 0);
                                if (parts.length > 1 && parts[0].length < 40) {
                                    speaker = parts[0];
                                    text = parts.slice(1).join(' ');
                                } else if (parts.length === 1 && parts[0].split(' ').length > 2) {
                                    text = parts[0];
                                } else {
                                    return; // Skip short single words which are likely UI labels
                                }
                            }

                            // Clean up text
                            text = text.replace(/\\s+/g, ' ').trim();

                            if (text && text.length > 0) {
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
        this.status = "Stopping";
        const fullTranscript = this.transcript.join(" ");
        console.log("[Bot] Meeting ended. Transcript captured.");
        
        if (this.browser) {
            try {
                await this.browser.close();
            } catch (closeErr) {
                console.error("[Bot] Error closing browser:", closeErr);
            }
            this.browser = null;
            this.page = null;
        }

        // CLEANUP: Try to remove the session data directory
        if (this.currentProfileDir) {
            const cleanupDir = this.currentProfileDir; // Capture in closure
            // Since this is Windows, sometimes files are locked for a few ms after close
            setTimeout(() => {
                try {
                    if (fs.existsSync(cleanupDir)) {
                        fs.rmSync(cleanupDir, { recursive: true, force: true });
                    }
                } catch (err) {
                    console.log(`[Bot] Cleanup Warning: Could not delete ${cleanupDir}`);
                }
            }, 2000);
        }
        this.status = "Stopped";
        return fullTranscript;
    }

    public getIsActive() {
        return this.isActive;
    }

    public getStatus() {
        return this.status;
    }

}
