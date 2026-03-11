import { Page } from "puppeteer";
import { ScraperPlugin } from "./ScraperPlugin";
import path from "path";

export class GoogleMeetScraper implements ScraperPlugin {
    canHandle(url: string): boolean {
        return url.includes("meet.google.com");
    }

    async joinMeeting(page: Page, url: string, botName: string): Promise<void> {
        console.log(`[Google Meet] Navigating to ${url}`);

        // Navigate and wait for the page to fully settle
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

        // Save a debug screenshot so we can see what the page looks like
        const screenshotDir = path.resolve(process.cwd());
        await page.screenshot({ path: path.join(screenshotDir, 'debug-step1-initial.png') });
        console.log(`[Google Meet] 📸 Saved debug-step1-initial.png`);

        // Wait for the "Getting ready" spinner to disappear and the actual pre-join UI to load.
        // The "Getting ready" screen can take 15-45 seconds while Google does its bot check.
        console.log(`[Google Meet] Waiting for the pre-join screen to load (up to 60s)...`);
        try {
            await page.waitForFunction(() => {
                // We specifically look for "Ask to join" or "Join now" text — NOT generic buttons
                const allElements = document.querySelectorAll('button, span, div[role="button"]');
                for (const el of allElements) {
                    const text = el.textContent?.toLowerCase().trim() || '';
                    if (text === 'ask to join' || text === 'join now' || text === 'join') {
                        return true;
                    }
                }
                // Also check if the name input field has appeared (anonymous join screen)
                const nameInput = document.querySelector('input[placeholder*="name" i], input[aria-label*="name" i]');
                if (nameInput) return true;
                return false;
            }, { timeout: 60000 });
            console.log(`[Google Meet] ✅ Pre-join screen loaded!`);
        } catch (e) {
            console.warn(`[Google Meet] Timed out waiting for pre-join screen. Taking debug screenshot...`);
            await page.screenshot({ path: path.join(screenshotDir, 'debug-step2-timeout.png') });
            console.log(`[Google Meet] 📸 Saved debug-step2-timeout.png — check this file to see what the bot sees!`);

            // Log what's on the page for debugging
            const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || 'empty');
            console.log(`[Google Meet] Page text: ${pageText}`);
        }

        // Extra settle time for the React UI to fully render
        await new Promise(r => setTimeout(r, 3000));
        await page.screenshot({ path: path.join(screenshotDir, 'debug-step3-prejoin.png') });
        console.log(`[Google Meet] 📸 Saved debug-step3-prejoin.png`);

        try {
            // Dismiss basic browser popups if any
            await page.keyboard.press('Escape');

            // 1. Enter Name (if anonymous — logged-in users don't have this field)
            try {
                const nameInput = await page.$('input[type="text"]');
                if (nameInput) {
                    const isVisible = await nameInput.evaluate(el => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden' && (el as HTMLElement).offsetWidth > 0;
                    });
                    if (isVisible) {
                        console.log(`[Google Meet] Entering bot name: ${botName}`);
                        await nameInput.focus();
                        await page.keyboard.down('Control');
                        await page.keyboard.press('A');
                        await page.keyboard.up('Control');
                        await page.keyboard.press('Backspace');
                        await nameInput.type(botName, { delay: 50 });
                        await new Promise(r => setTimeout(r, 500));
                    }
                }
            } catch (nameErr) {
                console.log("[Google Meet] Name input check skipped.");
            }

            // 2. Click "Ask to join" / "Join now" / "Join"
            await new Promise(r => setTimeout(r, 1000));

            const clickedJoin = await page.evaluate(() => {
                // Search ALL clickable elements for join-related text
                const allElements = document.querySelectorAll('button, span, div[role="button"]');
                for (const el of allElements) {
                    const text = el.textContent?.toLowerCase().trim() || '';
                    if (text === 'ask to join' || text === 'join now' || text === 'join') {
                        (el as HTMLElement).click();
                        return text;
                    }
                }
                return null;
            });

            if (clickedJoin) {
                console.log(`[Google Meet] ✅ Clicked join element: "${clickedJoin}"`);
            } else {
                console.warn("[Google Meet] ⚠️ Could not find any join button/span. Taking screenshot...");
                await page.screenshot({ path: path.join(screenshotDir, 'debug-step4-nojoin.png') });
                console.log(`[Google Meet] 📸 Saved debug-step4-nojoin.png`);

                // Log all button texts for debugging
                const buttonTexts = await page.evaluate(() => {
                    const btns = document.querySelectorAll('button, span, div[role="button"]');
                    return Array.from(btns).map(b => b.textContent?.trim()).filter(Boolean).slice(0, 20);
                });
                console.log(`[Google Meet] Available button/span texts: ${JSON.stringify(buttonTexts)}`);
            }

            // 3. Wait for admission into the room
            console.log("[Google Meet] Waiting to enter the room (timeout 120s)...");

            // We need a ROBUST way to detect we're in the meeting (not the lobby).
            // The lobby shows "Please wait until a meeting host brings you into the call"
            // When IN the meeting, the participant video grid is visible and the lobby text is gone.
            try {
                await page.waitForFunction(() => {
                    const bodyText = document.body?.innerText?.toLowerCase() || '';
                    // If we see "please wait" text, we're still in the lobby
                    if (bodyText.includes('please wait until a meeting host')) return false;
                    if (bodyText.includes('getting ready')) return false;
                    // Check for meeting code in the bottom status bar (only visible when in meeting)
                    if (document.querySelector('[data-meeting-title]')) return true;
                    // Check for the meeting code text at bottom (e.g. "gsk-qcgp-tzf")
                    if (document.querySelector('[data-meeting-code]')) return true;
                    // Check for multiple participant video tiles
                    const videos = document.querySelectorAll('video');
                    if (videos.length >= 1) {
                        // Also verify we don't still see the lobby illustration
                        if (!bodyText.includes('please wait')) return true;
                    }
                    // Fallback: if we see participant data but no lobby text
                    const participants = document.querySelectorAll('[data-participant-id]');
                    if (participants.length > 0) return true;
                    return false;
                }, { timeout: 120000, polling: 2000 });

                console.log("[Google Meet] ✅ Successfully entered the meeting room!");
            } catch (e) {
                console.warn("[Google Meet] Timed out waiting to enter room. Taking screenshot...");
                await page.screenshot({ path: path.join(screenshotDir, 'debug-step5-noroom.png') });
                console.log(`[Google Meet] 📸 Saved debug-step5-noroom.png`);
            }

            // Let UI settle after entering the room
            await new Promise(r => setTimeout(r, 5000));
            await page.screenshot({ path: path.join(screenshotDir, 'debug-inroom.png') });
            console.log("[Google Meet] 📸 Saved debug-inroom.png (should show the in-meeting view)");

        } catch (e) {
            console.warn("[Google Meet] Join flow error:", e);
            await page.screenshot({ path: path.join(screenshotDir, 'debug-error.png') });
        }
    }

    async startScraping(page: Page): Promise<string> {
        let fullTranscript = "";
        const screenshotDir = path.resolve(process.cwd());

        // Double-check: wait until the lobby text is definitely gone
        console.log("[Google Meet] Verifying we are inside the meeting (not lobby)...");
        try {
            await page.waitForFunction(() => {
                const bodyText = document.body?.innerText?.toLowerCase() || '';
                return !bodyText.includes('please wait until a meeting host');
            }, { timeout: 30000 });
            console.log("[Google Meet] ✅ Confirmed: we are in the meeting room.");
        } catch (e) {
            console.warn("[Google Meet] Still seeing lobby text. Proceeding anyway...");
        }

        // Wait a moment for UI to fully settle
        await new Promise(r => setTimeout(r, 3000));

        // 1. Turn on Captions — try MULTIPLE approaches
        try {
            console.log("[Google Meet] Attempting to turn on captions...");

            // Approach A: Click the CC button directly by aria-label
            let ccClicked = false;
            const buttons = await page.$$('button');
            for (const btn of buttons) {
                const ariaLabel = await page.evaluate(el => el.getAttribute('aria-label')?.toLowerCase() || '', btn);
                if (ariaLabel.includes('captions') || ariaLabel.includes('subtitle')) {
                    const isPressed = await page.evaluate(el => el.getAttribute('aria-pressed'), btn);
                    if (isPressed !== "true") {
                        await btn.click();
                        console.log("[Google Meet] ✅ Turned on captions via aria-label button.");
                    } else {
                        console.log("[Google Meet] Captions already on.");
                    }
                    ccClicked = true;
                    break;
                }
            }

            // Approach B: Keyboard shortcut 'c' 
            if (!ccClicked) {
                console.log("[Google Meet] Trying keyboard shortcut 'c'...");
                // Click on the meeting area first to ensure focus
                await page.click('body');
                await new Promise(r => setTimeout(r, 500));
                await page.keyboard.press('c');
                console.log("[Google Meet] Pressed 'c' key to toggle captions.");
            }

            // Approach C: Use the "More options" menu
            if (!ccClicked) {
                try {
                    // Click the three-dot menu
                    const moreButtons = await page.$$('button');
                    for (const btn of moreButtons) {
                        const label = await page.evaluate(el => el.getAttribute('aria-label')?.toLowerCase() || '', btn);
                        if (label.includes('more options') || label.includes('more actions')) {
                            await btn.click();
                            console.log("[Google Meet] Opened 'More options' menu.");
                            await new Promise(r => setTimeout(r, 1000));

                            // Look for "Turn on captions" in the menu
                            const menuItems = await page.$$('li, div[role="menuitem"], span');
                            for (const item of menuItems) {
                                const text = await page.evaluate(el => el.textContent?.toLowerCase() || '', item);
                                if (text.includes('caption') || text.includes('subtitle')) {
                                    await item.click();
                                    console.log("[Google Meet] ✅ Turned on captions from More Options menu.");
                                    ccClicked = true;
                                    break;
                                }
                            }
                            break;
                        }
                    }
                } catch (menuErr) {
                    console.log("[Google Meet] More options menu approach failed.");
                }
            }

            // Wait and screenshot to verify
            await new Promise(r => setTimeout(r, 3000));
            await page.screenshot({ path: path.join(screenshotDir, 'debug-captions.png') });
            console.log("[Google Meet] 📸 Saved debug-captions.png — verify captions are visible!");

        } catch (e) {
            console.log("[Google Meet] Could not enable captions.", e);
        }

        console.log("[Google Meet] Starting active transcription loop (recording for 90 seconds)...");
        console.log("[Google Meet] 🎤 Please speak now! The bot is listening for captions...");
        await new Promise(r => setTimeout(r, 2000));

        // 2. Poll the DOM for new caption text
        let lastScrapedText = "";
        const TEST_DURATION_MS = 90 * 1000; // Record for 90 seconds

        return new Promise((resolve) => {
            const scrapingInterval = setInterval(async () => {
                try {
                    // Try multiple selectors for the caption container
                    const captionSelectors = [
                        '.a4cQT',           // Known caption container class
                        '.iOzk7',           // Alternative caption class
                        '[jsname="tgaKEf"]', // Caption area jsname
                        '.VbkSUe',          // Another known caption wrapper
                        '.T4LgNb',          // Another known caption class
                    ];

                    for (const selector of captionSelectors) {
                        const container = await page.$(selector);
                        if (container) {
                            const newText = await page.evaluate(el => (el as HTMLElement).innerText, container);
                            if (newText && newText.trim() && newText !== lastScrapedText) {
                                const cleanText = newText.trim();
                                if (!fullTranscript.endsWith(cleanText)) {
                                    fullTranscript += cleanText + "\n";
                                    console.log(`[Transcript] ${cleanText.replace(/\n/g, ': ')}`);
                                }
                                lastScrapedText = newText;
                                break;
                            }
                        }
                    }
                } catch (e) {
                    // Ignore DOM errors during polling
                }
            }, 2000); // Poll every 2 seconds

            setTimeout(async () => {
                clearInterval(scrapingInterval);
                try {
                    await page.screenshot({ path: path.join(screenshotDir, 'debug-final.png') });
                    console.log("[Google Meet] 📸 Saved debug-final.png");
                } catch (e) { /* ignore */ }
                console.log("[Google Meet] Bot recording session ended.");
                resolve(fullTranscript);
            }, TEST_DURATION_MS);
        });
    }
}
