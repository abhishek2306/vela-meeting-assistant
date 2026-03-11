import { google } from "googleapis";
import { getGoogleAuthClient } from "./google-api";

/**
 * Searches Google Drive for meeting transcript files.
 * Google Meet auto-saves transcripts in folders like "Meet Recordings"
 * as Google Docs or .txt files when recording or Gemini Notes is enabled.
 */
export async function searchMeetTranscript(
    accessToken: string,
    meetingTitle: string,
    meetDate?: Date
): Promise<{ fileId: string; fileName: string; mimeType: string } | null> {
    const auth = getGoogleAuthClient(accessToken);
    const drive = google.drive({ version: "v3", auth });

    // Build search queries — Google saves transcripts with patterns like:
    // "Meeting Title (2026-03-10 10:00 GMT+5:30)" or "Meet Transcript - meeting code"
    const queries: string[] = [];

    // Strategy 1: Search by meeting title
    if (meetingTitle) {
        const sanitizedTitle = meetingTitle.replace(/'/g, "\\'");
        queries.push(
            `(name contains '${sanitizedTitle}') and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain' or mimeType = 'application/vnd.google-apps.spreadsheet')`
        );
    }

    // Strategy 2: Search for files in "Meet Recordings" folder
    // Google Meet creates a folder called "Meet Recordings" in Drive
    queries.push(
        `(name contains 'transcript' or name contains 'Transcript') and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain')`
    );

    // Strategy 3: Search for files with the meeting code pattern
    // Meet URLs like meet.google.com/abc-defg-hij → search for "abc-defg-hij"
    const meetCodeMatch = meetingTitle.match(/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
    if (meetCodeMatch) {
        queries.push(
            `name contains '${meetCodeMatch[1]}' and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain')`
        );
    }

    // If we have a date, restrict to files modified around that date
    const dateFilter = meetDate
        ? ` and modifiedTime > '${new Date(meetDate.getTime() - 24 * 60 * 60 * 1000).toISOString()}'`
        : "";

    console.log(`[Drive Search] Queries:`, queries.map(q => q + dateFilter));

    for (const baseQuery of queries) {
        try {
            const fullQuery = baseQuery + dateFilter + " and trashed = false";
            const response = await drive.files.list({
                q: fullQuery,
                fields: "files(id, name, mimeType, modifiedTime, createdTime)",
                orderBy: "modifiedTime desc",
                pageSize: 5,
            });

            const files = response.data.files || [];
            if (files.length > 0) {
                console.log(`[Drive] Found ${files.length} transcript file(s) for query "${fullQuery}". Using: ${files[0].name}`);
                return {
                    fileId: files[0].id!,
                    fileName: files[0].name!,
                    mimeType: files[0].mimeType!,
                };
            }
        } catch (err: any) {
            console.warn(`[Drive] Search query failed:`, err?.message);
        }
    }

    console.log(`[Drive] No transcript found for "${meetingTitle}" after checking all queries.`);
    return null;
}

/**
 * Downloads the content of a Google Drive file as plain text.
 * Handles both Google Docs (exported as text) and plain text files.
 */
export async function downloadDriveFileAsText(
    accessToken: string,
    fileId: string,
    mimeType: string
): Promise<string> {
    const auth = getGoogleAuthClient(accessToken);
    const drive = google.drive({ version: "v3", auth });

    console.log(`[Drive Download] Downloading fileId: ${fileId}, mimeType: ${mimeType}`);

    if (mimeType === "application/vnd.google-apps.document") {
        // Export Google Doc as plain text
        const response = await drive.files.export({
            fileId,
            mimeType: "text/plain",
        }, { responseType: "text" });
        return response.data as string;
    } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
        // Export spreadsheet as CSV (for transcript grids)
        const response = await drive.files.export({
            fileId,
            mimeType: "text/csv",
        }, { responseType: "text" });
        return response.data as string;
    } else {
        // Download regular file content
        const response = await drive.files.get({
            fileId,
            alt: "media",
        }, { responseType: "text" });
        return response.data as string;
    }
}

/**
 * Searches Google Drive for ALL recently modified transcript-like files.
 * This is useful for a bulk sync — find all transcripts from recent meetings.
 */
export async function searchRecentTranscripts(
    accessToken: string,
    hoursBack: number = 24
): Promise<Array<{ fileId: string; fileName: string; mimeType: string; modifiedTime: string }>> {
    const auth = getGoogleAuthClient(accessToken);
    const drive = google.drive({ version: "v3", auth });

    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    const query = `(name contains 'transcript' or name contains 'Transcript' or name contains 'Meet Recordings' or name contains 'meeting notes' or name contains 'Notes') and modifiedTime > '${since}' and trashed = false and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain')`;

    console.log(`[Drive Bulk Search] Since: ${since}`);
    console.log(`[Drive Bulk Search] Query: ${query}`);

    try {
        const response = await drive.files.list({
            q: query,
            fields: "files(id, name, mimeType, modifiedTime)",
            orderBy: "modifiedTime desc",
            pageSize: 20,
        });

        const files = response.data.files || [];
        console.log(`[Drive Bulk Search] Found ${files.length} potential transcript files.`);
        if (files.length > 0) {
            files.forEach(f => console.log(` - ${f.name} (Modified: ${f.modifiedTime})`));
        }

        return files.map(f => ({
            fileId: f.id!,
            fileName: f.name!,
            mimeType: f.mimeType!,
            modifiedTime: f.modifiedTime!,
        }));
    } catch (err: any) {
        console.error("[Drive] Failed to search recent transcripts:", err?.message);
        return [];
    }
}

