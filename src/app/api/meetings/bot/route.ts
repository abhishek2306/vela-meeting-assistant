import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// In-memory storage for active bot instances with timestamps
const activeBots: Record<string, { bot: any; startTime: number }> = {};
const BOT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes timeout for stale bots

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { meetingUrl, id, force } = await req.json();

    if (!meetingUrl) {
        return NextResponse.json({ error: "Meeting URL is required" }, { status: 400 });
    }

    // Check if a bot is already running for this meeting or user
    const existing = activeBots[session.user.email];
    if (existing && !force) {
        const isStale = Date.now() - existing.startTime > BOT_TIMEOUT_MS;
        if (!isStale) {
            return NextResponse.json({ 
                error: "A bot is already active for this user.",
                canForce: true 
            }, { status: 400 });
        }
        console.log(`[API Bot] Clearing stale bot for ${session.user.email}`);
    }

    try {
        const { MeetingBot } = await import("@/lib/meeting-bot");
        const bot = new MeetingBot({
            meetingUrl,
            userId: session.user.email,
            meetingId: id
        });

        activeBots[session.user.email] = { bot, startTime: Date.now() };
        
        // Start the bot in the background
        bot.start().catch(err => {
            console.error("[API Bot] Background bot error:", err);
            
            // Cleanup on fatal launch error
            delete activeBots[session.user.email!];

            // If it's a specific block, we might want to log it specifically
            if (err.message === "ACCESS_DENIED_BY_GOOGLE") {
                console.log("[API Bot] Bot was denied entry by Google or Host.");
            }
        });

        return NextResponse.json({ success: true, message: "Bot joining meeting..." });
    } catch (error) {
        console.error("[API Bot] Failed to launch bot:", error);
        return NextResponse.json({ error: "Failed to launch bot" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { bot } = activeBots[session.user.email] || {};
    if (!bot) {
        return NextResponse.json({ error: "No active bot found" }, { status: 404 });
    }

    try {
        const transcript = await bot.stop();
        delete activeBots[session.user.email];

        if (transcript && transcript.length > 50) {
            // Save to database
            const user = await prisma.user.findUnique({ where: { email: session.user.email } });
            if (!user) throw new Error("User not found");

            // Look for existing meeting or create one
            const urlMatch = req.nextUrl.searchParams.get("id");
            let meetingId = urlMatch;

            if (!meetingId || meetingId === "undefined") {
                const newMeeting = await prisma.meeting.create({
                    data: {
                        userId: user.id,
                        title: "Live Meeting Audio Capture",
                        url: "https://meet.google.com/",
                        startTime: new Date(),
                        endTime: new Date(),
                        status: "COMPLETED"
                    }
                });
                meetingId = newMeeting.id;
            } else {
                // Check if it exists in local DB first
                const existingMeeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
                if (existingMeeting) {
                    await prisma.meeting.update({
                        where: { id: meetingId },
                        data: { status: "COMPLETED" }
                    });
                } else {
                    // Create it if it was from a Google Calendar event that wasn't synced locally
                    await prisma.meeting.create({
                        data: {
                            id: meetingId,
                            userId: user.id,
                            title: "Scheduled Live Meeting",
                            url: `https://meet.google.com/`, 
                            startTime: new Date(),
                            endTime: new Date(),
                            status: "COMPLETED"
                        }
                    });
                }
            }

            // Save Transcript
            await prisma.transcript.create({
                data: {
                    meetingId,
                    text: transcript,
                    source: "BOT"
                }
            });

            // Generate MoM automatically
            try {
                const { generateMoM } = await import("@/lib/gemini");
                const momData = await generateMoM(transcript, "Live Meeting Bot Capture");
                await prisma.moM.create({
                    data: {
                        meetingId,
                        ...momData
                    }
                });
            } catch (momErr) {
                console.error("[API Bot] Failed to auto-generate MoM:", momErr);
            }

            return NextResponse.json({ 
                success: true, 
                message: "Bot stopped. Transcript saved and MoM generated.",
                transcriptLength: transcript.length
            });
        }

        return NextResponse.json({ success: true, message: "Bot stopped. No significant transcript captured." });

    } catch (error) {
        console.error("[API Bot] Failed to stop bot:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { bot, startTime } = activeBots[session.user.email] || {};
        const isActive = bot ? bot.getIsActive() : false;
        
        return NextResponse.json({ 
            active: isActive,
            status: bot ? bot.getStatus() : "Idle",
            startTime: startTime || null
        });
    } catch (error: any) {
        console.error("[API Bot GET] Error:", error);
        return NextResponse.json({ 
            error: "Internal Server Error", 
            details: error.message 
        }, { status: 500 });
    }
}
