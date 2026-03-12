"use client";

import { useState, useEffect } from "react";
import { Chatbot } from "@/components/Chatbot";
import { ActionItems } from "@/components/ActionItems";
import { Calendar, MessageSquare, CheckSquare, Clock, Video, Coffee, Sparkles, X, Library } from "lucide-react";
import { KnowledgeHub } from "@/components/KnowledgeHub";

interface DashboardContentProps {
    events: any[];
    error: string | null;
}

export function DashboardContent({ events, error }: DashboardContentProps) {
    const [activeTab, setActiveTab] = useState<"chat" | "tasks" | "knowledge">("chat");
    const [brief, setBrief] = useState<string | null>(null);
    const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
    const [showBriefModal, setShowBriefModal] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Bot States
    const [activeBotId, setActiveBotId] = useState<string | null>(null);
    const [botStatus, setBotStatus] = useState<string>("");

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleJoinBot = async (meetUrl: string, eventId: string) => {
        try {
            setActiveBotId(eventId);
            setBotStatus("Joining...");
            const res = await fetch("/api/meetings/bot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ meetingUrl: meetUrl, id: eventId })
            });
            if (res.ok) {
                setBotStatus("Recording");
            } else {
                const errData = await res.json().catch(() => ({}));
                setBotStatus(`Failed: ${errData.error || res.status}`);
                setTimeout(() => { setActiveBotId(null); setBotStatus("") }, 5000);
            }
        } catch (error: any) {
            console.error(error);
            setBotStatus(`Error: ${error?.message || "Unknown"}`);
            setTimeout(() => { setActiveBotId(null); setBotStatus("") }, 5000);
        }
    };

    const handleStopBot = async (eventId: string) => {
        try {
            setBotStatus("Stopping...");
            await fetch(`/api/meetings/bot?id=${eventId}`, { method: "DELETE" });
            setActiveBotId(null);
            setBotStatus("");
            alert("Meeting ended. Generating summary... You'll see it in your chat shortly.");
        } catch (error) {
            console.error(error);
            setBotStatus("Error stopping");
        }
    };

    const sidebarItemStyle = (isActive: boolean) => ({
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px",
        borderRadius: "12px",
        cursor: "pointer",
        background: isActive ? "rgba(108,99,255,0.15)" : "transparent",
        color: isActive ? "#a78bfa" : "rgba(240,244,255,0.5)",
        border: `1px solid ${isActive ? "rgba(108,99,255,0.3)" : "transparent"}`,
        transition: "all 0.2s",
        fontSize: "0.9rem",
        fontWeight: 600,
        width: "100%",
        textAlign: "left" as const,
        position: "relative" as const,
        overflow: "hidden" as const,
    });

    const generateBrief = async () => {
        setIsGeneratingBrief(true);
        try {
            const res = await fetch("/api/cron/morning-brief");
            const data = await res.json();
            if (data.brief) {
                setBrief(data.brief);
                setShowBriefModal(true);
            }
        } catch (error) {
            console.error("Failed to generate brief:", error);
        } finally {
            setIsGeneratingBrief(false);
        }
    };

    return (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "24px", alignItems: "start" }}>
            {/* ── Sidebar ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                
                {/* Navigation Pills */}
                <div style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    backdropFilter: "blur(16px)",
                    borderRadius: "20px",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px"
                }}>
                    <button 
                        onClick={() => setActiveTab("chat")}
                        style={sidebarItemStyle(activeTab === "chat")}
                    >
                        <MessageSquare size={18} /> Chat with Vela
                    </button>
                    <button 
                        onClick={() => setActiveTab("tasks")}
                        style={sidebarItemStyle(activeTab === "tasks")}
                    >
                        <CheckSquare size={18} /> Action Items
                    </button>
                    <button 
                        onClick={() => setActiveTab("knowledge")}
                        style={sidebarItemStyle(activeTab === "knowledge")}
                    >
                        <Library size={18} /> Knowledge Hub
                    </button>
                    <button 
                        onClick={generateBrief}
                        disabled={isGeneratingBrief}
                        style={{
                            ...sidebarItemStyle(false),
                            marginTop: "8px",
                            background: "linear-gradient(135deg, rgba(108,99,255,0.1), rgba(167,139,250,0.1))",
                            color: "#a78bfa",
                            border: "1px solid rgba(167,139,250,0.2)",
                        }}
                    >
                        {isGeneratingBrief ? (
                            <span className="animate-spin">⌛</span>
                        ) : (
                            <Sparkles size={18} />
                        )} 
                        {isGeneratingBrief ? "Preparing Brief..." : "Morning Briefing"}
                    </button>
                </div>

                {/* Upcoming Meetings Card */}
                <div style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    backdropFilter: "blur(16px)",
                    borderRadius: "20px",
                    padding: "24px",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                        <div style={{ background: "rgba(108,99,255,0.15)", borderRadius: "8px", padding: "6px" }}>
                            <Calendar style={{ width: "16px", height: "16px", color: "#a78bfa" }} />
                        </div>
                        <h2 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, color: "rgba(240,244,255,0.9)" }}>Upcoming Meetings</h2>
                    </div>

                    {error && (
                        <p style={{ color: "#f87171", fontSize: "0.75rem", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: "8px", padding: "8px 12px" }}>
                            {error}
                        </p>
                    )}

                    {events.length === 0 && !error ? (
                        <div style={{ textAlign: "center", padding: "24px 0" }}>
                            <Calendar style={{ width: "24px", height: "24px", color: "rgba(240,244,255,0.1)", margin: "0 auto 8px" }} />
                            <p style={{ color: "rgba(240,244,255,0.2)", fontSize: "0.75rem", margin: 0 }}>No meetings</p>
                        </div>
                    ) : (
                        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                            {events.map((event) => {
                                const start = new Date(event.start?.dateTime || event.start?.date);
                                const isToday = start.toDateString() === new Date().toDateString();
                                return (
                                    <li key={event.id} style={{
                                        padding: "10px 12px",
                                        borderRadius: "10px",
                                        background: "rgba(255,255,255,0.03)",
                                        border: "1px solid rgba(255,255,255,0.06)",
                                    }}>
                                        <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 600, color: "rgba(240,244,255,0.9)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {event.summary || "Untitled"}
                                        </p>
                                        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "4px" }}>
                                            <Clock style={{ width: "10px", height: "10px", color: "rgba(240,244,255,0.2)" }} />
                                            <p style={{ margin: 0, fontSize: "0.68rem", color: "rgba(240,244,255,0.3)" }}>
                                                {mounted ? start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                                            </p>
                                        </div>
                                        {event.hangoutLink && (
                                            <div style={{ marginTop: "10px" }}>
                                                {activeBotId === event.id ? (
                                                    <button
                                                        onClick={() => handleStopBot(event.id)}
                                                        style={{
                                                            background: "rgba(239, 68, 68, 0.2)",
                                                            border: "1px solid rgba(239, 68, 68, 0.4)",
                                                            color: "#f87171",
                                                            padding: "6px 12px",
                                                            borderRadius: "6px",
                                                            fontSize: "0.75rem",
                                                            cursor: "pointer",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "6px",
                                                            width: "100%",
                                                            justifyContent: "center"
                                                        }}
                                                    >
                                                        <span style={{ width: "8px", height: "8px", background: "#f87171", borderRadius: "50%", display: "inline-block", animation: "pulse 2s infinite" }} />
                                                        {botStatus} - Stop
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleJoinBot(event.hangoutLink, event.id)}
                                                        style={{
                                                            background: "rgba(108, 99, 255, 0.15)",
                                                            border: "1px solid rgba(108, 99, 255, 0.3)",
                                                            color: "#a78bfa",
                                                            padding: "6px 12px",
                                                            borderRadius: "6px",
                                                            fontSize: "0.75rem",
                                                            cursor: "pointer",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "6px",
                                                            width: "100%",
                                                            justifyContent: "center",
                                                            transition: "all 0.2s"
                                                        }}
                                                    >
                                                        <Video style={{ width: "14px", height: "14px" }} />
                                                        Join as Bot
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </li>

                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>

            {/* ── Main Content Area ── */}
            <div style={{ position: "relative" }}>
                {activeTab === "chat" && <Chatbot />}
                {activeTab === "tasks" && <ActionItems />}
                {activeTab === "knowledge" && <KnowledgeHub />}

                {/* Morning Brief Modal */}
                {showBriefModal && brief && (
                    <div style={{
                        position: "absolute",
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: "rgba(0,0,0,0.4)",
                        backdropFilter: "blur(8px)",
                        zIndex: 100,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "40px"
                    }}>
                        <div style={{
                            background: "rgba(20,20,25,0.95)",
                            border: "1px solid rgba(108,99,255,0.3)",
                            borderRadius: "24px",
                            padding: "32px",
                            maxWidth: "600px",
                            width: "100%",
                            maxHeight: "80vh",
                            overflowY: "auto",
                            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
                            position: "relative"
                        }}>
                            <button 
                                onClick={() => setShowBriefModal(false)}
                                style={{
                                    position: "absolute", top: "20px", right: "20px",
                                    background: "none", border: "none", color: "rgba(255,255,255,0.5)",
                                    cursor: "pointer"
                                }}
                            >
                                <X size={24} />
                            </button>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                                <div style={{ background: "rgba(108,99,255,0.2)", padding: "10px", borderRadius: "12px" }}>
                                    <Coffee style={{ color: "#a78bfa" }} />
                                </div>
                                <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "#fff" }}>Vela's Morning Brief</h2>
                            </div>
                            <div style={{ 
                                color: "rgba(240,244,255,0.8)", 
                                lineHeight: 1.7, 
                                fontSize: "1rem",
                                whiteSpace: "pre-wrap"
                            }}>
                                {brief}
                            </div>
                            <div style={{ marginTop: "32px", paddingTop: "20px", borderTop: "1px solid rgba(255,255,255,0.1)", textAlign: "center" }}>
                                <button 
                                    onClick={() => setShowBriefModal(false)}
                                    style={{
                                        padding: "10px 32px",
                                        background: "rgba(108,99,255,0.15)",
                                        border: "1px solid rgba(108,99,255,0.3)",
                                        borderRadius: "10px",
                                        color: "#a78bfa",
                                        fontWeight: 600,
                                        cursor: "pointer"
                                    }}
                                >
                                    Dismiss Briefing
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
