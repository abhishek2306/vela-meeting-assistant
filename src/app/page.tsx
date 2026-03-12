import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getUpcomingEvents } from "@/lib/google-api";
import { Chatbot } from "@/components/Chatbot";
import { DashboardContent } from "@/components/DashboardContent";
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
        <DashboardContent events={events} error={error} />
      )}
    </div>
  );
}
