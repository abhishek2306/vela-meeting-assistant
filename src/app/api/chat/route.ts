import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { generateWithFailover } from "@/lib/gemini-client";
import { getUpcomingEvents, scheduleMeeting, searchContactByName, cancelMeeting, sendEmail } from "@/lib/google-api";
import { runMeetingBot } from "@/lib/bot/BotRunner";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !(session as any).accessToken) {
        return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const accessToken = (session as any).accessToken;
    const userEmail = session.user?.email || "";

    try {
        const { message, chatHistory } = await req.json();

        if (!message) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        const historyText = chatHistory ? chatHistory.map((msg: any) => `${msg.role.toUpperCase()}: ${msg.content}`).join("\n") : "";

        const systemPrompt = `
You are Vela, an expert AI Executive Assistant.
Today's current date and time is: ${new Date().toISOString()}.
The user is talking to you directly. Help them manage their meetings, schedule, and meeting records.

If the user asks you to do a specific action, you MUST output a raw JSON object and nothing else.
Here are the commands you support:

1. FETCH_SCHEDULE: Use this if the user asks about their upcoming meetings or what's on their calendar.
   JSON: { "command": "FETCH_SCHEDULE" }

2. JOIN_MEETING: Use this if the user asks you to send the bot to join a specific meeting.
   JSON: { "command": "JOIN_MEETING", "url": "https://meet.google.com/..." }

3. SEARCH_CONTACT: Use this if the user wants to invite someone by name but hasn't provided their email address.
   JSON: { "command": "SEARCH_CONTACT", "name": "John Doe", "nextAction": "SCHEDULE_MEETING", "context": "Meeting about project X for tomorrow" }

4. SCHEDULE_MEETING: Use this if the user asks to schedule a new meeting AND you have all required email addresses.
   JSON: { "command": "SCHEDULE_MEETING", "title": "Meeting Title", "durationMinutes": 30, "attendeeEmails": ["email@example.com"] }
   (If they specify a time, add "startTime": "YYYY-MM-DDTHH:mm:00Z" in UTC. If they don't, assume 1 hour from now.)

5. CANCEL_MEETING: Use this if the user asks to cancel, delete, or remove an existing meeting.
   JSON: { "command": "CANCEL_MEETING", "titleKeyword": "keyword from meeting title or person's name", "startTime": "YYYY-MM-DDTHH:mm:00Z" }

6. FETCH_MOM: Use this if the user asks to see, show, retrieve, or read the Minutes of Meeting (MoM), summary, action items, or decisions for a meeting.
   JSON: { "command": "FETCH_MOM", "keyword": "partial meeting title keyword or empty", "timeHint": "HH:MM or YYYY-MM-DDTHH:mm:00Z if user mentions a time", "attendeeName": "name of person in the meeting if mentioned" }
   Examples: 'latest MoM' → keyword:"latest"; '3pm meeting' → timeHint:"15:00"; 'meeting with Nikita' → attendeeName:"Nikita"

7. SEND_MOM: Use this if the user asks to send, email, or share the MoM or meeting minutes to someone.
   JSON: { "command": "SEND_MOM", "keyword": "partial meeting title keyword or empty", "timeHint": "HH:MM or datetime if mentioned", "attendeeName": "attendee name if mentioned", "recipientEmail": "email@example.com" }
   (If no recipient email is mentioned, leave recipientEmail empty.)

8. FETCH_TRANSCRIPT: Use this if the user asks what was discussed, said, or talked about in a meeting, or wants to see the raw transcript.
   JSON: { "command": "FETCH_TRANSCRIPT", "keyword": "partial meeting title keyword or empty", "timeHint": "HH:MM or datetime if mentioned", "attendeeName": "attendee name if mentioned" }

If the user is just chatting normally, or answering a question you asked, output a helpful reply in plain text.

Prior Conversation History:
${historyText}

Current User message: "${message}"
`;

        const responseText = await generateWithFailover(systemPrompt);

        let command = null;
        try {
            const jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '');
            command = JSON.parse(jsonStr);
        } catch (parseError) {
            return NextResponse.json({ reply: responseText });
        }

        if (command) {

            // ── Shared meeting lookup helper ─────────────────────────────────────
            // Tries 3 strategies in order: title keyword → time window → attendee name in transcript
            async function findMeetingByAnyHint(keyword: string, timeHint?: string, attendeeName?: string) {
                // Strategy 1: exact "latest"
                if (!keyword || keyword === "latest") {
                    return prisma.meeting.findFirst({
                        orderBy: { startTime: "desc" },
                        where: { status: "COMPLETED" },
                        include: { mom: true, transcript: true },
                    });
                }

                // Strategy 2: title keyword match
                const byTitle = await prisma.meeting.findFirst({
                    where: { title: { contains: keyword } },
                    orderBy: { startTime: "desc" },
                    include: { mom: true, transcript: true },
                });
                if (byTitle) return byTitle;

                // Strategy 3: time-based search (if user said "3pm" or "15:00")
                if (timeHint) {
                    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
                    // Accept "HH:MM" shorthand or full ISO
                    const rawTime = timeHint.includes("T") ? timeHint : `${today}T${timeHint.padStart(5, "0")}:00`;
                    const hintDate = new Date(rawTime);
                    if (!isNaN(hintDate.getTime())) {
                        const windowMs = 45 * 60 * 1000; // ±45 min
                        const byTime = await prisma.meeting.findFirst({
                            where: {
                                startTime: {
                                    gte: new Date(hintDate.getTime() - windowMs),
                                    lte: new Date(hintDate.getTime() + windowMs),
                                },
                            },
                            orderBy: { startTime: "desc" },
                            include: { mom: true, transcript: true },
                        });
                        if (byTime) return byTime;
                    }
                }

                // Strategy 4: attendee name in transcript text
                if (attendeeName) {
                    const byTranscript = await prisma.transcript.findFirst({
                        where: { text: { contains: attendeeName } },
                        orderBy: { createdAt: "desc" },
                        include: { meeting: { include: { mom: true, transcript: true } } },
                    });
                    if (byTranscript?.meeting) return byTranscript.meeting;
                }

                return null;
            }

            // ── FETCH_SCHEDULE ──────────────────────────────────────────────────
            if (command.command === "FETCH_SCHEDULE") {
                const events = await getUpcomingEvents(accessToken, 5);
                if (events.length === 0) {
                    return NextResponse.json({ reply: "You don't have any upcoming meetings scheduled right now." });
                }
                const eventText = events.map((e: any) =>
                    `- **${e.summary}** at ${new Date(e.start.dateTime || e.start.date).toLocaleString()}`
                ).join("\n");
                return NextResponse.json({ reply: `Here are your upcoming meetings:\n${eventText}` });
            }

            // ── SEARCH_CONTACT ──────────────────────────────────────────────────
            if (command.command === "SEARCH_CONTACT") {
                const queryName = command.name || "";
                const email = await searchContactByName(accessToken, queryName);

                if (!email) {
                    return NextResponse.json({ reply: `I couldn't find an email address for "${queryName}" in your contacts. Could you provide their email address?` });
                }

                if (command.nextAction === "SCHEDULE_MEETING") {
                    return NextResponse.json({
                        reply: `I found ${queryName}'s email: ${email}. I will schedule the meeting now.`,
                        systemAction: "EXECUTE_NEXT",
                        injectedContext: `The email for ${queryName} is ${email}. Please execute the ${command.nextAction} command with context: ${command.context}`
                    });
                }

                return NextResponse.json({ reply: `I found ${queryName}'s email address: ${email}` });
            }

            // ── JOIN_MEETING ────────────────────────────────────────────────────
            if (command.command === "JOIN_MEETING") {
                if (command.url) {
                    runMeetingBot(command.url, "mock-meeting-id", "Vela Bot")
                        .then(() => console.log("Bot finished successfully."))
                        .catch(e => console.error("Bot crashed.", e));
                    return NextResponse.json({ reply: `I've dispatched the Vela bot to join ${command.url}. It will capture the transcript and generate a MoM once the meeting ends.` });
                }
                return NextResponse.json({ reply: "I need a valid Google Meet link to join." });
            }

            // ── SCHEDULE_MEETING ────────────────────────────────────────────────
            if (command.command === "SCHEDULE_MEETING") {
                const title = command.title || "Vela Scheduled Meeting";
                const duration = command.durationMinutes || 30;
                let attendeeEmails: string[] = [];
                if (Array.isArray(command.attendeeEmails)) {
                    attendeeEmails = command.attendeeEmails;
                } else if (typeof command.attendeeEmails === "string") {
                    attendeeEmails = [command.attendeeEmails];
                }
                const startTime = command.startTime ? new Date(command.startTime) : new Date(Date.now() + 60 * 60 * 1000);
                const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
                const event = await scheduleMeeting(accessToken, title, startTime, endTime, attendeeEmails);
                let replyMessage = `I have scheduled the meeting **"${title}"** for ${startTime.toLocaleString()}.\nHere is your Google Meet link: ${event.hangoutLink}`;
                if (attendeeEmails.length > 0) {
                    replyMessage += `\nCalendar invitations sent to: ${attendeeEmails.join(", ")}.`;
                }
                return NextResponse.json({ reply: replyMessage });
            }

            // ── CANCEL_MEETING ──────────────────────────────────────────────────
            if (command.command === "CANCEL_MEETING") {
                const keyword = command.titleKeyword || "";
                if (!keyword) {
                    return NextResponse.json({ reply: "Which meeting would you like to cancel? Please give me the title or person's name." });
                }
                const cancelledTitle = await cancelMeeting(accessToken, keyword, command.startTime);
                if (!cancelledTitle) {
                    return NextResponse.json({ reply: `I couldn't find an upcoming meeting matching "${keyword}". Please check your schedule and try again.` });
                }
                return NextResponse.json({ reply: `Done! I've cancelled **"${cancelledTitle}"** and sent cancellation notices to all attendees.` });
            }

            // ── FETCH_MOM ───────────────────────────────────────────────────────
            if (command.command === "FETCH_MOM") {
                const meeting = await findMeetingByAnyHint(
                    command.keyword || "latest",
                    command.timeHint,
                    command.attendeeName
                );

                if (!meeting || !(meeting as any).mom) {
                    const hint = command.timeHint ? `around ${command.timeHint}` : command.attendeeName ? `with ${command.attendeeName}` : `"${command.keyword}"`;
                    return NextResponse.json({ reply: `I couldn't find a MoM for the meeting ${hint}. Make sure the meeting was recorded and processed by Vela.` });
                }

                const mom = (meeting as any).mom;
                const reply = `Here are the **Minutes of Meeting** for **"${meeting.title}"**:\n\n` +
                    `**📋 Summary**\n${mom.summary}\n\n` +
                    `**✅ Decisions Made**\n${mom.decisions}\n\n` +
                    `**📌 Action Items**\n${mom.actionItems}`;
                return NextResponse.json({ reply });
            }

            // ── SEND_MOM ────────────────────────────────────────────────────────
            if (command.command === "SEND_MOM") {
                // Resolve recipient: explicit email → contact lookup by name → ask user
                let recipientEmail = command.recipientEmail || "";
                const recipientName = command.attendeeName || command.recipientName || "";

                if (!recipientEmail && recipientName) {
                    // Try to look up the person's email from Google Contacts
                    const looked = await searchContactByName(accessToken, recipientName);
                    if (looked) {
                        recipientEmail = looked;
                    } else {
                        return NextResponse.json({ reply: `I couldn't find an email for "${recipientName}" in your contacts. Could you provide their email address?` });
                    }
                }

                if (!recipientEmail) {
                    return NextResponse.json({ reply: "Who should I send the MoM to? Please provide a name or email address." });
                }

                const meeting = await findMeetingByAnyHint(
                    command.keyword || "latest",
                    command.timeHint,
                    command.attendeeName
                );

                if (!meeting || !(meeting as any).mom) {
                    return NextResponse.json({ reply: `I couldn't find a MoM to send. Try being more specific about the meeting title or time.` });
                }

                const mom = (meeting as any).mom;
                const emailBody = `Minutes of Meeting — ${meeting.title}\n\n` +
                    `SUMMARY\n${mom.summary}\n\n` +
                    `DECISIONS MADE\n${mom.decisions}\n\n` +
                    `ACTION ITEMS\n${mom.actionItems}`;

                await sendEmail(accessToken, recipientEmail, `MoM: ${meeting.title}`, emailBody);
                return NextResponse.json({ reply: `Done! I've emailed the Minutes of Meeting for **"${meeting.title}"** to **${recipientEmail}**.` });
            }

            // ── FETCH_TRANSCRIPT ────────────────────────────────────────────────
            if (command.command === "FETCH_TRANSCRIPT") {
                const meeting = await findMeetingByAnyHint(
                    command.keyword || "latest",
                    command.timeHint,
                    command.attendeeName
                );

                const transcript = (meeting as any)?.transcript;
                if (!meeting || !transcript) {
                    return NextResponse.json({ reply: `I couldn't find a transcript for that meeting. Make sure the Vela bot was recording.` });
                }

                const text = transcript.text.length > 2000
                    ? "...(showing last 2000 characters)\n\n" + transcript.text.slice(-2000)
                    : transcript.text;

                return NextResponse.json({ reply: `Here is the transcript from **"${meeting.title}"**:\n\n\`\`\`\n${text}\n\`\`\`` });
            }
        }

        return NextResponse.json({ reply: responseText });

    } catch (error: any) {
        console.error("Chat API Error:", error);
        return NextResponse.json({ error: error.message || "Failed to process chat." }, { status: 500 });
    }
}
