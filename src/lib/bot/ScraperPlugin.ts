import { Page } from "puppeteer";

export interface ScraperPlugin {
    /**
     * Identifies if this plugin can handle the given meeting URL.
     */
    canHandle(url: string): boolean;

    /**
     * Joins the meeting, navigates waiting rooms, and sets up capturing.
     */
    joinMeeting(page: Page, url: string, botName: string): Promise<void>;

    /**
     * Begins the loop of scraping captions and returns when the meeting ends.
     */
    startScraping(page: Page): Promise<string>;
}
