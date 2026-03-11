import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getUpcomingEvents } from "@/lib/google-api";
import { Chatbot } from "@/components/Chatbot";
import { Calendar, Video, Clock, Zap } from "lucide-react";

export default async function Home() {
  const session = await getServerSession(authOptions);

  let events: any[] = [];
  let error: string | null = null;

  if (session && (session as any).accessToken) {
    try {
      events = await getUpcomingEvents((session as any).accessToken, 8);
    } catch (e: any) {
      error = "Could not fetch calendar. Please ensure Calendar API is enabled.";
    }
  }

  const cardStyle = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    borderRadius: "20px",
    padding: "28px",
  };

  return (
    <div>
      {!session ? (
        /* ── Landing / Sign-in State ── */
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", textAlign: "center", gap: "2.5rem" }}>
          {/* Hero glow */}
          <div style={{
            width: "120px", height: "120px", borderRadius: "30px",
            background: "linear-gradient(135deg, #6c63ff, #a78bfa)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 60px rgba(108,99,255,0.5), 0 0 120px rgba(108,99,255,0.2)",
            marginBottom: "8px",
          }}>
            <Zap style={{ width: "52px", height: "52px", color: "#fff" }} />
          </div>

          <div>
            <h1 style={{ fontSize: "3.5rem", fontWeight: 800, margin: 0, lineHeight: 1.1, background: "linear-gradient(135deg, #f0f4ff 0%, #a78bfa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-2px" }}>
              Meet smarter<br />with Vela
            </h1>
            <p style={{ color: "rgba(240,244,255,0.5)", fontSize: "1.1rem", marginTop: "16px", maxWidth: "480px", lineHeight: 1.6, margin: "16px auto 0" }}>
              Your AI executive assistant for meetings — schedule, transcribe, summarize, and communicate, all through natural conversation or voice.
            </p>
          </div>

          {/* Feature pills */}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center", maxWidth: "600px" }}>
            {["Auto-Schedule", "Smart Contact Lookup", "Meeting Cancellation", "MoM Generation", "Transcript Sync", "Voice Input", "File & Image Upload", "Email Minutes", "Chat History"].map(f => (
              <span key={f} style={{
                padding: "6px 16px", borderRadius: "999px", fontSize: "0.8rem", fontWeight: 500,
                background: "rgba(108,99,255,0.12)", border: "1px solid rgba(108,99,255,0.3)",
                color: "#a78bfa"
              }}>{f}</span>
            ))}
          </div>

          {/* Feature cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", maxWidth: "760px", width: "100%" }}>
            {[
              { icon: "🗓️", title: "Smart Scheduling", desc: "Book meetings by describing them in plain English. Vela finds the right contact and creates the invite." },
              { icon: "📋", title: "Minutes of Meeting", desc: "Paste or sync a transcript and get a structured MoM with decisions and action items instantly." },
              { icon: "🎤", title: "Voice Commands", desc: "Click the mic and speak naturally. Vela transcribes and sends your message hands-free." },
              { icon: "🖼️", title: "File & Image Upload", desc: "Upload screenshots, notes, or text files. Vela reads and analyzes them using multimodal AI." },
              { icon: "☁️", title: "Drive Transcript Sync", desc: "Auto-sync Google Meet transcripts from your Drive and generate MoMs with a single command." },
              { icon: "📧", title: "Email MoM", desc: "Send formatted meeting minutes to all attendees directly from the chat — no copy-pasting needed." },
            ].map(card => (
              <div key={card.title} style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "16px", padding: "20px", textAlign: "left"
              }}>
                <div style={{ fontSize: "1.6rem", marginBottom: "10px" }}>{card.icon}</div>
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "rgba(240,244,255,0.9)", marginBottom: "6px" }}>{card.title}</div>
                <div style={{ fontSize: "0.78rem", color: "rgba(240,244,255,0.4)", lineHeight: 1.6 }}>{card.desc}</div>
              </div>
            ))}
          </div>

          <p style={{ color: "rgba(240,244,255,0.35)", fontSize: "0.875rem" }}>
            Click <strong style={{ color: "rgba(167,139,250,0.7)" }}>Sign In with Google</strong> in the top right to get started.
          </p>
        </div>
      ) : (
        /* ── Main Dashboard ── */
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "24px", alignItems: "start" }}>

          {/* ── Sidebar: Upcoming Meetings ── */}
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <div style={{ background: "rgba(108,99,255,0.15)", borderRadius: "8px", padding: "6px" }}>
                <Calendar style={{ width: "16px", height: "16px", color: "#a78bfa" }} />
              </div>
              <h2 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, color: "rgba(240,244,255,0.9)" }}>Upcoming Meetings</h2>
            </div>

            {error && (
              <p style={{ color: "#f87171", fontSize: "0.8rem", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: "10px", padding: "10px 14px" }}>
                {error}
              </p>
            )}

            {events.length === 0 && !error ? (
              <div style={{ textAlign: "center", padding: "32px 16px" }}>
                <Calendar style={{ width: "32px", height: "32px", color: "rgba(240,244,255,0.15)", margin: "0 auto 12px" }} />
                <p style={{ color: "rgba(240,244,255,0.3)", fontSize: "0.8rem", margin: 0 }}>No upcoming events</p>
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                {events.map((event) => {
                  const start = new Date(event.start?.dateTime || event.start?.date);
                  const isToday = start.toDateString() === new Date().toDateString();
                  return (
                    <li key={event.id} style={{
                      padding: "12px 14px",
                      borderRadius: "12px",
                      background: isToday ? "rgba(108,99,255,0.1)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isToday ? "rgba(108,99,255,0.25)" : "rgba(255,255,255,0.06)"}`,
                      cursor: "default"
                    }}>
                      <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 600, color: "rgba(240,244,255,0.9)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={event.summary}>
                        {event.summary || "Untitled Event"}
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "4px" }}>
                        <Clock style={{ width: "11px", height: "11px", color: "rgba(240,244,255,0.3)" }} />
                        <p style={{ margin: 0, fontSize: "0.72rem", color: "rgba(240,244,255,0.4)" }}>
                          {start.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {isToday && <span style={{ marginLeft: "auto", fontSize: "0.65rem", fontWeight: 600, color: "#a78bfa", background: "rgba(108,99,255,0.2)", padding: "1px 7px", borderRadius: "999px" }}>Today</span>}
                      </div>
                      {event.hangoutLink && (
                        <a
                          href={event.hangoutLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: "5px",
                            marginTop: "8px", fontSize: "0.72rem", fontWeight: 600,
                            color: "#a78bfa", background: "rgba(108,99,255,0.15)",
                            border: "1px solid rgba(108,99,255,0.3)",
                            padding: "3px 10px", borderRadius: "6px", textDecoration: "none"
                          }}
                        >
                          <Video style={{ width: "11px", height: "11px" }} />
                          Join Meet
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ── Main: Chatbot ── */}
          <div>
            <Chatbot />
          </div>

        </div>
      )}
    </div>
  );
}
