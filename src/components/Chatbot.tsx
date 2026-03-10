"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Zap, User, Sparkles } from "lucide-react";

interface Message {
    role: "user" | "assistant";
    content: string;
}

export function Chatbot() {
    const [messages, setMessages] = useState<Message[]>([
        {
            role: "assistant",
            content: "Hey! I'm **Vela**, your AI meeting co-pilot ✨\n\nI can help you:\n• Check your upcoming schedule\n• Schedule or cancel meetings by name\n• Show MoM, action items & decisions\n• Email meeting minutes to attendees\n• View meeting transcripts\n• Join a Google Meet link\n\nJust tell me what you need!",
        },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isLoading]);

    const sendMessage = async (e?: React.FormEvent, customMsg?: string) => {
        if (e) e.preventDefault();
        const textToSend = customMsg || input.trim();
        if (!textToSend || isLoading) return;
        if (!customMsg) setInput("");

        const newMessages: Message[] = customMsg
            ? [...messages]
            : [...messages, { role: "user", content: textToSend }];

        if (!customMsg) setMessages(newMessages);
        setIsLoading(true);

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: textToSend, chatHistory: newMessages }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to send message");

            setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);

            if (data.systemAction === "EXECUTE_NEXT" && data.injectedContext) {
                setTimeout(() => sendMessage(undefined, data.injectedContext), 500);
            }
        } catch (error: any) {
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `Sorry, something went wrong: ${error.message}` },
            ]);
            setIsLoading(false);
        } finally {
            setIsLoading(false);
        }
    };

    // Render message content with basic **bold** markdown
    const renderContent = (text: string) => {
        const parts = text.split(/(\*\*[^*]+\*\*)/g);
        return parts.map((part, i) =>
            part.startsWith("**") && part.endsWith("**")
                ? <strong key={i}>{part.slice(2, -2)}</strong>
                : <span key={i}>{part}</span>
        );
    };

    const quickActions = [
        "What's on my schedule today?",
        "Schedule a meeting with someone",
        "Cancel a meeting",
        "Show me the latest MoM",
        "Email the meeting minutes",
        "Show me the latest transcript",
    ];

    return (
        <div style={{
            display: "flex", flexDirection: "column",
            height: "calc(100vh - 120px)", minHeight: "600px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderRadius: "20px",
            overflow: "hidden",
        }}>
            {/* Header */}
            <div style={{
                padding: "20px 24px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                background: "linear-gradient(135deg, rgba(108,99,255,0.12), rgba(167,139,250,0.05))",
                display: "flex", alignItems: "center", gap: "12px"
            }}>
                <div style={{
                    width: "40px", height: "40px", borderRadius: "12px",
                    background: "linear-gradient(135deg, #6c63ff, #a78bfa)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 0 20px rgba(108,99,255,0.4)"
                }}>
                    <Zap style={{ width: "18px", height: "18px", color: "#fff" }} />
                </div>
                <div>
                    <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#f0f4ff" }}>Vela Assistant</h2>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                        <span className="pulse-dot" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#34d399", display: "inline-block" }} />
                        <span style={{ fontSize: "0.72rem", color: "rgba(240,244,255,0.45)" }}>Online — ready to help</span>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className="msg-in"
                        style={{
                            display: "flex",
                            flexDirection: msg.role === "user" ? "row-reverse" : "row",
                            alignItems: "flex-end",
                            gap: "10px",
                        }}
                    >
                        {/* Avatar */}
                        <div style={{
                            width: "32px", height: "32px", borderRadius: "10px", flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: msg.role === "user"
                                ? "linear-gradient(135deg, #6c63ff, #a78bfa)"
                                : "rgba(255,255,255,0.07)",
                            border: msg.role === "user" ? "none" : "1px solid rgba(255,255,255,0.1)",
                        }}>
                            {msg.role === "user"
                                ? <User style={{ width: "15px", height: "15px", color: "#fff" }} />
                                : <Sparkles style={{ width: "15px", height: "15px", color: "#a78bfa" }} />
                            }
                        </div>

                        {/* Bubble */}
                        <div style={{
                            maxWidth: "72%",
                            padding: "12px 16px",
                            borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                            background: msg.role === "user"
                                ? "linear-gradient(135deg, #6c63ff, #8b5cf6)"
                                : "rgba(255,255,255,0.06)",
                            border: msg.role === "user" ? "none" : "1px solid rgba(255,255,255,0.08)",
                            fontSize: "0.87rem",
                            lineHeight: 1.65,
                            color: msg.role === "user" ? "#fff" : "rgba(240,244,255,0.9)",
                            boxShadow: msg.role === "user" ? "0 4px 20px rgba(108,99,255,0.3)" : "none",
                            whiteSpace: "pre-wrap",
                        }}>
                            {renderContent(msg.content)}
                        </div>
                    </div>
                ))}

                {/* Typing indicator */}
                {isLoading && (
                    <div className="msg-in" style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
                        <div style={{
                            width: "32px", height: "32px", borderRadius: "10px", flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
                        }}>
                            <Sparkles style={{ width: "15px", height: "15px", color: "#a78bfa" }} />
                        </div>
                        <div style={{
                            padding: "14px 18px", borderRadius: "18px 18px 18px 4px",
                            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                            display: "flex", gap: "5px", alignItems: "center"
                        }}>
                            <span className="typing-dot" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#a78bfa", display: "inline-block" }} />
                            <span className="typing-dot" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#a78bfa", display: "inline-block" }} />
                            <span className="typing-dot" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#a78bfa", display: "inline-block" }} />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions (only when fresh) */}
            {messages.length === 1 && !isLoading && (
                <div style={{ padding: "0 24px 16px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {quickActions.map((action) => (
                        <button
                            key={action}
                            onClick={() => { setInput(action); inputRef.current?.focus(); }}
                            style={{
                                fontSize: "0.75rem", fontWeight: 500,
                                color: "#a78bfa", cursor: "pointer",
                                background: "rgba(108,99,255,0.1)",
                                border: "1px solid rgba(108,99,255,0.25)",
                                padding: "5px 12px", borderRadius: "999px",
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = "rgba(108,99,255,0.2)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "rgba(108,99,255,0.1)")}
                        >
                            {action}
                        </button>
                    ))}
                </div>
            )}

            {/* Input area */}
            <form onSubmit={sendMessage} style={{
                padding: "16px 20px",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(0,0,0,0.15)"
            }}>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input
                        ref={inputRef}
                        type="text"
                        id="chat-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask Vela anything about your meetings..."
                        disabled={isLoading}
                        style={{
                            width: "100%",
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "14px",
                            padding: "13px 56px 13px 18px",
                            fontSize: "0.875rem",
                            color: "#f0f4ff",
                            outline: "none",
                            caretColor: "#a78bfa",
                        }}
                        onFocus={e => (e.currentTarget.style.border = "1px solid rgba(108,99,255,0.5)")}
                        onBlur={e => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.1)")}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        style={{
                            position: "absolute", right: "8px",
                            width: "36px", height: "36px", borderRadius: "10px",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: input.trim() && !isLoading
                                ? "linear-gradient(135deg, #6c63ff, #8b5cf6)"
                                : "rgba(255,255,255,0.05)",
                            border: "none", cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
                            boxShadow: input.trim() && !isLoading ? "0 0 16px rgba(108,99,255,0.4)" : "none",
                            transition: "all 0.2s",
                        }}
                    >
                        <Send style={{ width: "15px", height: "15px", color: input.trim() && !isLoading ? "#fff" : "rgba(255,255,255,0.2)" }} />
                    </button>
                </div>
            </form>
        </div>
    );
}
