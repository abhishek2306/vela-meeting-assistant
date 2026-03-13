import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { generateWithFailover } from "@/lib/gemini-client";
import { getUpcomingEvents, scheduleMeeting, searchContactByName, listContacts, cancelMeeting, sendEmail, getMeetingDetailsByKeyword } from "@/lib/google-api";
import { runMeetingBot } from "@/lib/bot/BotRunner";
import { syncRecentMeetingTranscripts } from "@/lib/transcript-sync";
import { generateMoM } from "@/lib/gemini";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !(session as any).accessToken) {
        return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const accessToken = (session as any).accessToken;
    const userEmail = session.user?.email || "";

    try {
        const { message, chatHistory, sessionId, attachments } = await req.json();

        if (!message && (!attachments || attachments.length === 0)) {
            return NextResponse.json({ error: "Message or attachment is required" }, { status: 400 });
        }

        const userId = (session as any).user.id;

        // 1. Determine or create sessionId
        let currentSessionId = sessionId;
        if (!currentSessionId) {
            const newSession = await prisma.chatSession.create({
                data: {
                    userId,
                    title: message.length > 50 ? message.slice(0, 47) + "..." : message,
                }
            });
            currentSessionId = newSession.id;
        }

        // 2. Save User Message with attachments
        await prisma.chatMessage.create({
            data: {
                sessionId: currentSessionId,
                role: "user",
                content: message || "",
                attachments: attachments ? JSON.stringify(attachments) : null
            }
        });

        // 3. Prepare multimodal content and document context
        const imageParts: { data: string; mimeType: string }[] = [];
        let docContext = "";

        if (attachments && attachments.length > 0) {
            for (const at of attachments) {
                if (at.type.startsWith("image/")) {
                    imageParts.push({ data: at.data, mimeType: at.type });
                } else {
                    docContext += `\n\n--- FILE: ${at.name} ---\n${at.data}\n--- END FILE ---\n`;
                }
            }
        }

        const effectiveHistory = chatHistory || [];
        const historyText = effectiveHistory.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");

        const now = new Date();
        const tzOffset = -now.getTimezoneOffset(); // in minutes, e.g. +330 for IST
        const tzSign = tzOffset >= 0 ? '+' : '-';
        const tzHH = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
        const tzMM = String(Math.abs(tzOffset) % 60).padStart(2, '0');
        const tzOffsetStr = `${tzSign}${tzHH}:${tzMM}`; // e.g. "+05:30"

        const userPromptWithContext = docContext
            ? `Attached Documents Context:${docContext}\n\nUser Message: ${message}`
            : message;

        const systemPrompt = `
You are Vela, an expert AI Executive Assistant.
Today's current date and time is: ${now.toISOString()}.
The user's local timezone offset is: ${tzOffsetStr} (e.g. IST is +05:30).
The user is talking to you directly. Help them manage their meetings, schedule, and meeting records.

### CORE INTELLIGENCE:
1. **Multilingual Support**: Detect the language used by the user. Respond in the SAME language unless requested otherwise.
2. **Sentiment Awareness**: Be empathetic and professional.

### INTERNAL COMMAND PROTOCOL:
If the user asks you to do a specific action, you MUST output a raw JSON object and NOTHING else. 
- **NO PREAMBLE**: Do not include conversational text with a command.
- **STRICT EMAIL POLICY**: Do NOT guess or fabricate emails. Placeholders like "@example.com" or "@domain.com" are FORBIDDEN. If unknown, you MUST use \`SEARCH_CONTACT\`.
- **YEAR POLICY**: Always assume the current year (${new Date().getFullYear()}) if not specified. Never ask for the year.
- **NO PLACEHOLDERS**: Never use "..." or "unknown" in \`attendeeEmails\`.

Supported Commands:
1. FETCH_SCHEDULE: { "command": "FETCH_SCHEDULE" }
2. JOIN_MEETING: { "command": "JOIN_MEETING", "url": "..." }
3. SEARCH_CONTACT: { "command": "SEARCH_CONTACT", "name": "...", "nextAction": "SCHEDULE_MEETING", "context": "..." }
4. SCHEDULE_MEETING: { "command": "SCHEDULE_MEETING", "title": "...", "durationMinutes": 30, "attendeeEmails": ["real_email@domain.com"], "startTime": "ISO_8601" }
5. CANCEL_MEETING: { "command": "CANCEL_MEETING", "titleKeywords": ["keyword1", "keyword2"], "startTime": "ISO_DATE" }
6. FETCH_MOM: { "command": "FETCH_MOM", "keyword": "...", "timeHint": "HH:MM", "attendeeName": "..." }
7. SEND_MOM: { "command": "SEND_MOM", "keyword": "...", "recipientNames": ["..."], "recipientEmails": [] }
8. FETCH_TRANSCRIPT: { "command": "FETCH_TRANSCRIPT", "keyword": "..." }
9. SUBMIT_TRANSCRIPT: { "command": "SUBMIT_TRANSCRIPT", "meetingTitle": "...", "transcriptText": "..." }
10. SYNC_TRANSCRIPTS: { "command": "SYNC_TRANSCRIPTS", "hoursBack": 24 }
11. LIST_CONTACTS: { "command": "LIST_CONTACTS", "includeUnknown": false }
12. GET_MEETING_DETAILS: { "command": "GET_MEETING_DETAILS", "keyword": "..." }

IMPORTANT: Confirm title/time UNLESS provided. If email is missing, you MUST call \`SEARCH_CONTACT\` first. Always assume current year. If a user asks who is attending or what is the agenda of a meeting, use \`GET_MEETING_DETAILS\`.

Prior Conversation History:
${historyText}

Current User message: "${userPromptWithContext}"
`;

        const responseText = await generateWithFailover(systemPrompt, imageParts);

        let command = null;
        try {
            // Robust JSON extraction: look for the first JSON object block
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const cleanedJson = jsonMatch[0].trim();
                command = JSON.parse(cleanedJson);
            } else {
                throw new Error("No JSON found");
            }
        } catch (parseError) {
            // This is just a plain chat reply
            await prisma.chatMessage.create({
                data: { sessionId: currentSessionId, role: "assistant", content: responseText }
            });
            await prisma.chatSession.update({
                where: { id: currentSessionId },
                data: { updatedAt: new Date() }
            });
            return NextResponse.json({ reply: responseText, sessionId: currentSessionId });
        }

        if (command) {
            let finalReplyText = "";

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
                    finalReplyText = "You don't have any upcoming meetings scheduled right now.";
                } else {
                    const eventText = events.map((e: any) =>
                        `- **${e.summary}** at ${new Date(e.start.dateTime || e.start.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
                    ).join("\n");
                    finalReplyText = `Here are your upcoming meetings:\n${eventText}\n\n*(You can ask me for details on any of these, like "Who is attending the ${events[0].summary} meeting?")*`;
                }
            }

            // ── GET_MEETING_DETAILS ─────────────────────────────────────────────
            else if (command.command === "GET_MEETING_DETAILS") {
                const kw = command.keyword || "";
                if (!kw) {
                    finalReplyText = "Which meeting would you like details for?";
                } else {
                    const event = await getMeetingDetailsByKeyword(accessToken, kw);
                    if (!event) {
                        finalReplyText = `I couldn't find an upcoming meeting matching **"${kw}"**.`;
                    } else {
                        const title = event.summary || "Untitled Meeting";
                        const start = new Date(event.start?.dateTime || event.start?.date || "").toLocaleString([], { dateStyle: 'full', timeStyle: 'short' });
                        const description = event.description || "_No agenda or description provided._";
                        const location = event.location || "_No location set._";
                        const meetLink = event.hangoutLink || "No Meet link";
                        
                        const attendees = (event.attendees || []).map((a: any) => 
                            `- ${a.displayName || a.email.split('@')[0]} (${a.email}) ${a.responseStatus === 'accepted' ? '✅' : a.responseStatus === 'declined' ? '❌' : '⏳'}`
                        ).join("\n") || "_No other attendees listed._";

                        finalReplyText = `## Meeting Details: ${title}\n` +
                            `**📅 Time:** ${start}\n` +
                            `**📍 Location:** ${location}\n` +
                            `**🔗 Meet:** ${meetLink}\n\n` +
                            `**📝 Agenda/Description:**\n${description}\n\n` +
                            `**👥 Participants:**\n${attendees}`;
                    }
                }
            }

            // ── SEARCH_CONTACT ──────────────────────────────────────────────────
            else if (command.command === "SEARCH_CONTACT") {
                const queryName = command.name || "";
                const email = await searchContactByName(accessToken, queryName);

                if (!email) {
                    finalReplyText = `I couldn't find an email address for "${queryName}" in your contacts. Could you provide their email address?`;
                } else if (command.nextAction === "SCHEDULE_MEETING") {
                    const ctx = command.context ? ` for **"${command.context}"**` : "";
                    if (ctx) {
                        finalReplyText = `I found ${queryName}'s email: **${email}**. I'm ready to schedule the meeting${ctx}.\n\nShould I go ahead and book this for you?`;
                    } else {
                        finalReplyText = `I found ${queryName}'s email: **${email}**. I'm ready to schedule the meeting, but I'll need a title and time first. \n\nWhat would you like the subject to be, and what time should I set?`;
                    }
                } else {
                    finalReplyText = `I found ${queryName}'s email address: ${email}`;
                }
            }

            // ── JOIN_MEETING ────────────────────────────────────────────────────
            else if (command.command === "JOIN_MEETING") {
                if (command.url) {
                    runMeetingBot(command.url, "mock-meeting-id", "Vela Bot")
                        .then(() => console.log("Bot finished successfully."))
                        .catch(e => console.error("Bot crashed.", e));
                    finalReplyText = `I've dispatched the Vela bot to join ${command.url}. It will capture the transcript and generate a MoM once the meeting ends.`;
                } else {
                    finalReplyText = "I need a valid Google Meet link to join.";
                }
            }

            // ── SCHEDULE_MEETING ────────────────────────────────────────────────
            else if (command.command === "SCHEDULE_MEETING") {
                const title = command.title || "Vela Scheduled Meeting";
                const duration = command.durationMinutes || 30;
                let attendeeEmails: string[] = [];

                if (Array.isArray(command.attendeeEmails)) {
                    attendeeEmails = command.attendeeEmails;
                } else if (typeof command.attendeeEmails === "string") {
                    attendeeEmails = [command.attendeeEmails];
                }

                // SECURITY & VALIDATION: Reject fabricated placeholder emails
                const hasPlaceholders = attendeeEmails.some(e =>
                    /example\.com/i.test(e) ||
                    /domain\.com/i.test(e) ||
                    /yourdomain\.com/i.test(e) ||
                    /test\.com/i.test(e) ||
                    /dummy/i.test(e) ||
                    e.includes("...")
                );

                if (hasPlaceholders) {
                    finalReplyText = "I started to schedule that, but I realized I don't have the correct email address for all participants. I've forbidden myself from guessing emails.\n\nCould you please provide the correct email address, or should I look it up again?";
                } else {
                    // DATE SANITIZATION: Automatically inject year if the AI or user missed it
                    let rawStart = command.startTime;
                    if (rawStart && typeof rawStart === "string" && !rawStart.match(/^\d{4}/)) {
                        // If it starts with DD/MM or MM/DD instead of YYYY, prefix current year
                        const currentYear = new Date().getFullYear();
                        rawStart = `${currentYear}-${rawStart}`;
                    }

                    const startTime = rawStart ? new Date(rawStart) : new Date(Date.now() + 60 * 60 * 1000);

                    // Ensure the year is at least current year (vague AI parsing fallback)
                    if (startTime.getFullYear() < 2000) {
                        startTime.setFullYear(new Date().getFullYear());
                    }

                    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
                    const event = await scheduleMeeting(accessToken, title, startTime, endTime, attendeeEmails);

                    finalReplyText = `I have scheduled the meeting **"${title}"** for ${startTime.toLocaleString()}.\nHere is your Google Meet link: ${event.hangoutLink}`;
                    if (attendeeEmails.length > 0) {
                        finalReplyText += `\nCalendar invitations sent to: ${attendeeEmails.join(", ")}.`;
                    }
                }
            }

            // ── CANCEL_MEETING ──────────────────────────────────────────────────
            else if (command.command === "CANCEL_MEETING") {
                let keywords: string[] = [];
                if (Array.isArray(command.titleKeywords)) {
                    keywords = command.titleKeywords;
                } else if (typeof command.titleKeyword === "string") {
                    keywords = [command.titleKeyword];
                } else if (typeof command.titleKeywords === "string") {
                    keywords = [command.titleKeywords];
                }

                if (keywords.length === 0 || !keywords[0]) {
                    finalReplyText = "Which meeting would you like to cancel? Please give me the title or person's name.";
                } else {
                    const cancelled: string[] = [];
                    const notFound: string[] = [];

                    for (const kw of keywords) {
                        const cancelledTitle = await cancelMeeting(accessToken, kw, command.startTime);
                        if (cancelledTitle) {
                            cancelled.push(cancelledTitle);
                        } else {
                            // try splitting keyword if it's long and has "and"
                            let foundFallback = false;
                            if (kw.toLowerCase().includes(" and ")) {
                                const subKws = kw.split(/ and /i);
                                for (const subKw of subKws) {
                                    const subCancel = await cancelMeeting(accessToken, subKw.trim(), command.startTime);
                                    if (subCancel) {
                                        cancelled.push(subCancel);
                                        foundFallback = true;
                                    }
                                }
                            }
                            if (!foundFallback) {
                                notFound.push(kw);
                            }
                        }
                    }

                    if (cancelled.length > 0 && notFound.length === 0) {
                        finalReplyText = `Done! I've cancelled **"${cancelled.join('", "')}"** and sent cancellation notices to all attendees.`;
                    } else if (cancelled.length > 0 && notFound.length > 0) {
                        finalReplyText = `I've cancelled **"${cancelled.join('", "')}"**, but I couldn't find upcoming meetings matching **"${notFound.join('", "')}"**.`;
                    } else {
                        finalReplyText = `I couldn't find upcoming meetings matching **"${notFound.join('", "')}"**. Please check your schedule and try again.`;
                    }
                }
            }

            // ── FETCH_MOM ───────────────────────────────────────────────────────
            else if (command.command === "FETCH_MOM") {
                const meeting = await findMeetingByAnyHint(
                    command.keyword || "latest",
                    command.timeHint,
                    command.attendeeName
                );

                if (!meeting || !(meeting as any).mom) {
                    const hint = command.timeHint ? `around ${command.timeHint}` : command.attendeeName ? `with ${command.attendeeName}` : `"${command.keyword}"`;
                    finalReplyText = `I couldn't find a MoM for the meeting ${hint}. Make sure the meeting was recorded and processed by Vela.`;
                } else {
                    const mom = (meeting as any).mom;
                    finalReplyText = `Here are the **Minutes of Meeting** for **"${meeting.title}"**:\n\n` +
                        `**📋 Summary**\n${mom.summary}\n\n` +
                        `**✅ Decisions Made**\n${mom.decisions}\n\n` +
                        `**📌 Action Items**\n${mom.actionItems}\n\n` +
                        `**📊 Meeting Vibe**\n${mom.sentiment || "Neutral"}`;
                }
            }

            // ── SEND_MOM ────────────────────────────────────────────────────────
            else if (command.command === "SEND_MOM") {
                // Support both old single-recipient and new multi-recipient format
                const recipientNames: string[] = command.recipientNames ||
                    (command.attendeeName ? [command.attendeeName] : command.recipientName ? [command.recipientName] : []);
                const providedEmails: string[] = command.recipientEmails ||
                    (command.recipientEmail ? [command.recipientEmail] : []);

                if (recipientNames.length === 0 && providedEmails.length === 0) {
                    finalReplyText = "Who should I send the MoM to? Please provide a name or email address.";
                } else {
                    // Look up emails for all named recipients
                    const resolvedEmails: string[] = [...providedEmails];
                    const notFound: string[] = [];

                    for (const name of recipientNames) {
                        const found = await searchContactByName(accessToken, name);
                        if (found) {
                            resolvedEmails.push(found);
                        } else {
                            notFound.push(name);
                        }
                    }

                    if (notFound.length > 0 && resolvedEmails.length === 0) {
                        finalReplyText = `I couldn't find email addresses for: **${notFound.join(", ")}**. Could you provide their email addresses?`;
                    } else {
                        const meeting = await findMeetingByAnyHint(
                            command.keyword || "latest",
                            command.timeHint,
                            undefined
                        );

                        if (!meeting || !(meeting as any).mom) {
                            finalReplyText = `I couldn't find a MoM to send. Try being more specific about the meeting title or time.`;
                        } else {
                            const mom = (meeting as any).mom;
                            const emailBody = `Minutes of Meeting — ${meeting.title}\n\n` +
                                `SUMMARY\n${mom.summary}\n\n` +
                                `DECISIONS MADE\n${mom.decisions}\n\n` +
                                `ACTION ITEMS\n${mom.actionItems}`;

                            // Send to all resolved recipients
                            const sent: string[] = [];
                            for (const email of resolvedEmails) {
                                await sendEmail(accessToken, email, `MoM: ${meeting.title}`, emailBody);
                                sent.push(email);
                            }

                            let reply = `✅ Done! I've emailed the MoM for **"${meeting.title}"** to: **${sent.join(", ")}**.`;
                            if (notFound.length > 0) {
                                reply += `\n\n⚠️ Couldn't find email addresses for: **${notFound.join(", ")}**. Please provide their emails if you'd like me to send to them too.`;
                            }
                            finalReplyText = reply;
                        }
                    }
                }
            }

            // ── FETCH_TRANSCRIPT ────────────────────────────────────────────────
            else if (command.command === "FETCH_TRANSCRIPT") {
                const meeting = await findMeetingByAnyHint(
                    command.keyword || "latest",
                    command.timeHint,
                    command.attendeeName
                );

                const transcript = (meeting as any)?.transcript;
                if (!meeting || !transcript) {
                    finalReplyText = `I couldn't find a transcript for that meeting. Make sure the Vela bot was recording.`;
                } else {
                    const text = transcript.text.length > 2000
                        ? "...(showing last 2000 characters)\n\n" + transcript.text.slice(-2000)
                        : transcript.text;
                    finalReplyText = `Here is the transcript from **"${meeting.title}"**:\n\n\`\`\`\n${text}\n\`\`\``;
                }
            }

            // ── SUBMIT_TRANSCRIPT ──────────────────────────────────────────────
            else if (command.command === "SUBMIT_TRANSCRIPT") {
                const transcriptText = command.transcriptText;
                if (!transcriptText || transcriptText.trim().length < 20) {
                    finalReplyText = "The transcript seems too short. Please paste the full meeting notes or transcript so I can generate a proper MoM.";
                } else {
                    const meetingTitle = command.meetingTitle || "Untitled Meeting";
                    const meeting = await prisma.meeting.create({
                        data: { userId, title: meetingTitle, url: "", startTime: new Date(), endTime: new Date(), status: "COMPLETED" },
                    });
                    await prisma.transcript.create({
                        data: { meetingId: meeting.id, text: transcriptText, source: "MANUAL" },
                    });

                    try {
                        const momData = await generateMoM(transcriptText, meetingTitle);
                        await (prisma.moM as any).create({
                            data: {
                                meetingId: meeting.id,
                                summary: momData.summary || "",
                                actionItems: momData.actionItems || "",
                                decisions: momData.decisions || "",
                                sentiment: momData.sentiment || "Neutral",
                            },
                        });
                        finalReplyText = `✅ Got it! I've saved the transcript for **"${meetingTitle}"** and generated the Minutes of Meeting.\n\n` +
                            `**Summary:**\n${momData.summary}\n\n` +
                            `**Action Items:**\n${momData.actionItems}\n\n` +
                            `**Decisions:**\n${momData.decisions}`;
                    } catch (momErr: any) {
                        finalReplyText = `I saved the transcript for **"${meetingTitle}"** but MoM generation failed: ${momErr.message}.`;
                    }
                }
            }

            // ── SYNC_TRANSCRIPTS ───────────────────────────────────────────────
            else if (command.command === "SYNC_TRANSCRIPTS") {
                const hoursBack = command.hoursBack || 24;
                try {
                    const result = await syncRecentMeetingTranscripts(accessToken, userId, hoursBack);
                    if (result.synced > 0) {
                        finalReplyText = `✅ Found and synced **${result.synced} transcript(s)** from Google Drive! MoM has been auto-generated for each.`;
                    } else {
                        finalReplyText = `I checked your Google Drive for transcripts from the last ${hoursBack} hours, but didn't find any new ones.`;
                    }
                } catch (syncErr: any) {
                    finalReplyText = `Failed to sync transcripts: ${syncErr.message}`;
                }
            }

            // ── LIST_CONTACTS ────────────────────────────────────────────────
            else if (command.command === "LIST_CONTACTS") {
                try {
                    const allContacts = await listContacts(accessToken);
                    if (allContacts.length === 0) {
                        finalReplyText = "I couldn't find any contacts in your Google account.";
                    } else {
                        const includeUnknown = !!command.includeUnknown;
                        const namedContacts = allContacts.filter(c => c.name !== "Unknown");
                        const unknownContacts = allContacts.filter(c => c.name === "Unknown");

                        if (includeUnknown) {
                            finalReplyText = "Here is your **full contact list**, including those with hidden names:\n\n" + allContacts.map(c => `• **${c.name}** (${c.email})`).join("\n");
                        } else {
                            finalReplyText = "Here are the contacts I found in your Google account:\n\n" + (namedContacts.length > 0 ? namedContacts.map(c => `• **${c.name}** (${c.email})`).join("\n") : "_No named contacts found._");
                            if (unknownContacts.length > 0) {
                                finalReplyText += `\n\n*(I also found ${unknownContacts.length} other email addresses without names. Let me know if you want to see the full list!)*`;
                            }
                        }
                    }
                } catch (err: any) {
                    finalReplyText = `Failed to list contacts: ${err.message}`;
                }
            }

            // Fallback for missing reply
            if (!finalReplyText) finalReplyText = responseText;

            // Save the assistant reply and update session
            await prisma.chatMessage.create({
                data: { sessionId: currentSessionId, role: "assistant", content: finalReplyText }
            });
            await prisma.chatSession.update({
                where: { id: currentSessionId },
                data: { updatedAt: new Date() }
            });

            return NextResponse.json({ reply: finalReplyText, sessionId: currentSessionId });
        }

        return NextResponse.json({ reply: responseText, sessionId: currentSessionId });

    } catch (error: any) {
        console.error("Chat API Error:", error);
        return NextResponse.json({ error: error.message || "Failed to process chat." }, { status: 500 });
    }
}
