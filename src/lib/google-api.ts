import { google } from "googleapis";

/**
 * Creates an authenticated Google OAuth2 client using the access token from the session.
 */
export function getGoogleAuthClient(accessToken: string) {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ access_token: accessToken });
    return auth;
}

/**
 * Fetches upcoming calendar events for the authenticated user.
 */
export async function getUpcomingEvents(accessToken: string, maxResults = 10) {
    const auth = getGoogleAuthClient(accessToken);
    const calendar = google.calendar({ version: "v3", auth });

    const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: new Date().toISOString(),
        maxResults: maxResults,
        singleEvents: true,
        orderBy: "startTime",
    });

    return response.data.items || [];
}

/**
 * Schedules a new meeting on the user's Google Calendar and returns the Google Meet link.
 */
export async function scheduleMeeting(
    accessToken: string,
    title: string,
    startTime: Date,
    endTime: Date,
    attendeeEmails: string[] = []
) {
    const auth = getGoogleAuthClient(accessToken);
    const calendar = google.calendar({ version: "v3", auth });

    const event = {
        summary: title,
        start: {
            dateTime: startTime.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
            dateTime: endTime.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        attendees: attendeeEmails.map((email) => ({ email })),
        conferenceData: {
            createRequest: {
                requestId: Math.random().toString(36).substring(7),
                conferenceSolutionKey: {
                    type: "hangoutsMeet",
                },
            },
        },
    };

    const response = await calendar.events.insert({
        calendarId: "primary",
        requestBody: event,
        conferenceDataVersion: 1, // Required to generate Google Meet links
        sendUpdates: "all", // Send emails to attendees
    });

    return response.data;
}

/**
 * Sends an email using the Gmail API (e.g., for sending MoM).
 */
export async function sendEmail(
    accessToken: string,
    to: string,
    subject: string,
    bodyText: string
) {
    const auth = getGoogleAuthClient(accessToken);
    const gmail = google.gmail({ version: "v1", auth });

    // Create standard raw email format
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
    const messageParts = [
        `To: ${to}`,
        `Subject: ${utf8Subject}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=utf-8",
        "",
        bodyText,
    ];
    const message = messageParts.join("\n");

    // The Gmail API requires base64url encoded strings
    const encodedMessage = Buffer.from(message)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
            raw: encodedMessage,
        },
    });

    return response.data;
}

/**
 * Cancels (deletes) a calendar event by searching for it by title keyword.
 * Returns the title of the cancelled event or null if not found.
 */
export async function cancelMeeting(
    accessToken: string,
    titleKeyword: string,
    startTimeHint?: string
): Promise<string | null> {
    const auth = getGoogleAuthClient(accessToken);
    const calendar = google.calendar({ version: "v3", auth });

    // Search upcoming events for one matching the title keyword
    const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: new Date().toISOString(),
        maxResults: 20,
        singleEvents: true,
        orderBy: "startTime",
        q: titleKeyword, // text search
    });

    const events = response.data.items || [];
    if (events.length === 0) return null;

    // If a time hint is provided, try to match more precisely
    let eventToCancel = events[0];
    if (startTimeHint && events.length > 1) {
        const hintDate = new Date(startTimeHint);
        const match = events.find((e) => {
            const eventStart = new Date(e.start?.dateTime || e.start?.date || "");
            return Math.abs(eventStart.getTime() - hintDate.getTime()) < 60 * 60 * 1000; // within 1 hour
        });
        if (match) eventToCancel = match;
    }

    if (!eventToCancel.id) return null;

    await calendar.events.delete({
        calendarId: "primary",
        eventId: eventToCancel.id,
        sendUpdates: "all", // Notify attendees of cancellation
    });

    return eventToCancel.summary || "Meeting";
}

/**
 * Searches the user's Google Contacts AND "Other Contacts" (auto-populated from email history)
 * by name to find their email address.
 */
export async function searchContactByName(accessToken: string, query: string): Promise<string | null> {
    const auth = getGoogleAuthClient(accessToken);
    const people = google.people({ version: "v1", auth });

    // 1. First, search saved Contacts
    try {
        const response = await people.people.searchContacts({
            query: query,
            readMask: "emailAddresses,names",
        });

        const matches = response.data.results || [];
        if (matches.length > 0) {
            const person = matches[0].person;
            if (person && person.emailAddresses && person.emailAddresses.length > 0) {
                const email = person.emailAddresses[0].value;
                if (email) return email;
            }
        }
    } catch (e: any) {
        // Log but don't fail — fall through to otherContacts
        console.error("Error searching saved contacts:", e?.message);
    }

    // 2. Fallback: search "Other Contacts" (auto-created from email history)
    try {
        const otherResponse = await people.otherContacts.search({
            query: query,
            readMask: "emailAddresses,names",
        });

        const otherMatches = otherResponse.data.results || [];
        if (otherMatches.length > 0) {
            const person = otherMatches[0].person;
            if (person && person.emailAddresses && person.emailAddresses.length > 0) {
                const email = person.emailAddresses[0].value;
                if (email) return email;
            }
        }
    } catch (e: any) {
        console.error("Error searching other contacts:", e?.message);
    }

    return null;
}
