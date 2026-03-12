import { getPastEvents } from "./google-api";
import { searchMeetTranscript, downloadDriveFileAsText, searchRecentTranscripts } from "./google-drive";
import { generateMoM } from "./gemini";
import prisma from "./prisma";

/**
 * Syncs transcripts for recently ended meetings.
 * 
 * Flow:
 * 1. Fetch calendar events that ended in the last N hours
 * 2. For each event, check if we already have a transcript in the DB
 * 3. If not, search Google Drive for auto-generated transcript files
 * 4. Download and save the transcript, then auto-generate MoM
 */
export async function syncRecentMeetingTranscripts(
    accessToken: string,
    userId: string,
    hoursBack: number = 24
): Promise<{ synced: number; skipped: number; errors: string[] }> {
    const result = { synced: 0, skipped: 0, errors: [] as string[] };

    console.log(`[Transcript Sync] Starting sync for user ${userId} (last ${hoursBack}h)...`);

    // --- PHASE 1: Sync by Calendar Events ---
    let events: any[] = [];
    try {
        events = await getPastEvents(accessToken, hoursBack);
    } catch (err: any) {
        console.error("[Transcript Sync] Failed to fetch past events:", err?.message);
        result.errors.push("Failed to fetch calendar events");
        events = []; // Continue to standalone sync even if calendar fails
    }

    console.log(`[Transcript Sync] Found ${events.length} calendar events in the last ${hoursBack} hours.`);

    for (const event of events) {
        const title = event.summary || "Untitled Meeting";
        const eventStart = new Date(event.start?.dateTime || event.start?.date || "");
        const eventEnd = new Date(event.end?.dateTime || event.end?.date || "");
        const meetUrl = event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || "";

        if (!meetUrl && !event.hangoutLink) {
            continue;
        }

        const existingMeeting = await prisma.meeting.findFirst({
            where: {
                userId,
                title: { contains: title.substring(0, 20) },
                startTime: {
                    gte: new Date(eventStart.getTime() - 30 * 60 * 1000),
                    lte: new Date(eventStart.getTime() + 30 * 60 * 1000),
                },
            },
            include: { transcript: true },
        });

        if (existingMeeting?.transcript) {
            continue;
        }

        const driveFile = await searchMeetTranscript(accessToken, title, eventStart);
        if (!driveFile) {
            continue;
        }

        await processAndSaveDriveTranscript(accessToken, userId, driveFile, {
            title,
            startTime: eventStart,
            endTime: eventEnd,
            url: meetUrl || `https://meet.google.com`,
            existingMeetingId: existingMeeting?.id
        }, result);
    }

    // --- PHASE 2: Sync Standalone Transcripts (No Calendar Match) ---
    console.log(`[Transcript Sync] Searching for standalone transcripts on Drive...`);
    // Loosen search to 48 hours to be safe
    const recentFiles = await searchRecentTranscripts(accessToken, hoursBack * 2);

    console.log(`[Transcript Sync] Found ${recentFiles.length} standalone files on Drive.`);

    for (const file of recentFiles) {
        // Use 'any' to bypass stale Prisma types until client is regenerated
        const alreadySynced = await (prisma.transcript as any).findUnique({
            where: { driveFileId: file.fileId }
        });

        if (alreadySynced) {
            console.log(`[Transcript Sync] File already synced: "${file.fileName}" (${file.fileId})`);
            continue;
        }

        console.log(`[Transcript Sync] Syncing standalone file: "${file.fileName}"`);

        await processAndSaveDriveTranscript(accessToken, userId, file, {
            title: file.fileName.replace(/\.[^/.]+$/, ""), // Strip extension
            startTime: new Date(file.modifiedTime),
            endTime: new Date(file.modifiedTime),
            url: "https://drive.google.com"
        }, result);
    }

    console.log(`[Transcript Sync] Done. Synced: ${result.synced}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`);
    return result;
}

/**
 * Helper to download, save, and summarize a transcript from Drive.
 */
async function processAndSaveDriveTranscript(
    accessToken: string,
    userId: string,
    driveFile: { fileId: string; fileName: string; mimeType: string },
    meetingInfo: { title: string; startTime: Date; endTime: Date; url: string; existingMeetingId?: string },
    result: { synced: number; skipped: number; errors: string[] }
) {
    // 1. Download
    let transcriptText: string;
    try {
        transcriptText = await downloadDriveFileAsText(accessToken, driveFile.fileId, driveFile.mimeType);
    } catch (err: any) {
        console.error(`[Transcript Sync] Failed to download "${driveFile.fileName}":`, err?.message);
        result.errors.push(`Failed to download: ${driveFile.fileName}`);
        return;
    }

    if (!transcriptText || transcriptText.trim().length < 20) {
        result.skipped++;
        return;
    }

    // 2. Database Meeting Record
    let meetingId = meetingInfo.existingMeetingId;
    if (!meetingId) {
        const meeting = await prisma.meeting.create({
            data: {
                userId,
                title: meetingInfo.title,
                url: meetingInfo.url,
                startTime: meetingInfo.startTime,
                endTime: meetingInfo.endTime,
                status: "COMPLETED",
            },
        });
        meetingId = meeting.id;
    }

    // 3. Save Transcript - Use 'any' for driveFileId
    await (prisma.transcript as any).create({
        data: {
            meetingId: meetingId!,
            text: transcriptText,
            source: "NATIVE_DRIVE",
            driveFileId: driveFile.fileId,
        },
    });

    // 4. Summarize (MoM)
    try {
        const momData = await generateMoM(transcriptText, meetingInfo.title);
        await (prisma.moM as any).create({
            data: {
                meetingId: meetingId!,
                summary: momData.summary || "",
                actionItems: momData.actionItems || "",
                decisions: momData.decisions || "",
                sentiment: momData.sentiment || "Neutral",
            },
        });
        result.synced++;
    } catch (momErr: any) {
        console.error(`[Transcript Sync] MoM generation failed for "${meetingInfo.title}":`, momErr?.message);
        result.errors.push(`MoM generation failed: ${meetingInfo.title}`);
        result.synced++; // Still count as synced because transcript is saved
    }
}
