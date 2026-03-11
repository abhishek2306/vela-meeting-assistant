import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncRecentMeetingTranscripts } from "@/lib/transcript-sync";

/**
 * POST /api/sync-transcripts
 * 
 * Triggers a transcript sync job for the authenticated user.
 * Searches Google Drive for auto-generated meeting transcripts
 * from recently ended calendar events, saves them, and generates MoM.
 * 
 * Optional body: { hoursBack: number } — defaults to 24 hours
 */
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !(session as any).accessToken || !(session as any).user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const hoursBack = body.hoursBack || 24;

        const result = await syncRecentMeetingTranscripts(
            (session as any).accessToken as string,
            (session as any).user.id as string,
            hoursBack
        );

        return NextResponse.json({
            success: true,
            ...result,
            message: result.synced > 0
                ? `Synced ${result.synced} transcript(s) from Google Drive.`
                : "No new transcripts found on Google Drive.",
        });
    } catch (error: any) {
        console.error("[Sync API] Error:", error);
        return NextResponse.json(
            { error: "Failed to sync transcripts", details: error.message },
            { status: 500 }
        );
    }
}
