import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { generateMoM } from "@/lib/gemini";

const prisma = new PrismaClient();

// This is the endpoint where our Bot Runner will POST the final transcript
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { meetingId, transcriptText, source } = body;

        if (!meetingId || !transcriptText) {
            return NextResponse.json(
                { error: "Missing required fields (meetingId, transcriptText)" },
                { status: 400 }
            );
        }

        // 1. Save the transcript to the database
        const transcript = await prisma.transcript.create({
            data: {
                meetingId,
                text: transcriptText,
                source: source || "BOT",
            },
        });

        console.log(`[Webhook] Saved transcript for meeting ${meetingId}. Auto-generating MoM...`);

        // 2. Auto-generate MoM asynchronously (fire & forget so bot doesn't wait)
        (async () => {
            try {
                // Fetch the meeting title for the MoM prompt
                const meeting = await prisma.meeting.findUnique({
                    where: { id: meetingId },
                    select: { title: true },
                });
                const title = meeting?.title || "Untitled Meeting";

                const momData = await generateMoM(transcriptText, title);

                await prisma.moM.create({
                    data: {
                        meetingId,
                        summary: momData.summary,
                        actionItems: momData.actionItems,
                        decisions: momData.decisions,
                    },
                });

                // Update meeting status
                await prisma.meeting.update({
                    where: { id: meetingId },
                    data: { status: "COMPLETED" },
                });

                console.log(`[Webhook] MoM generated and saved for meeting ${meetingId}`);
            } catch (momErr) {
                console.error(`[Webhook] MoM generation failed for meeting ${meetingId}:`, momErr);
            }
        })();

        return NextResponse.json({ success: true, transcriptId: transcript.id, message: "Transcript saved. MoM generation started." });

    } catch (error) {
        console.error("[Webhook Error]:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
