"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Zap, User, Sparkles, Trash2, Paperclip, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import * as mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";

// Set up PDF.js worker
if (typeof window !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

interface Attachment {
    name: string;
    type: string;
    data: string; // Base64 for images, plain text for docs
}

interface Message {
    role: "user" | "assistant";
    content: string;
    attachments?: Attachment[];
}

export function Chatbot() {
    const WELCOME = "Hey! I'm **Vela**, your AI meeting co-pilot ✨\n\nHere's everything I can do for you:\n• 📅 Check your schedule & upcoming meetings\n• 🗓️ Schedule or cancel meetings with contacts\n• 🎙️ Generate **Minutes of Meeting** from transcripts\n• 📧 Email MoM to attendees automatically\n• 📄 View & sync meeting transcripts from Google Drive\n• 🔍 Search contacts and look up email addresses\n• 🖼️ Analyze images & documents you upload\n• 🎤 Accept voice commands — just hit the mic!\n\nTry a quick action below, or just speak your mind!";

    const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: WELCOME }]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [sessions, setSessions] = useState<any[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isListening, setIsListening] = useState(false);
    const [isSpeechEnabled, setIsSpeechEnabled] = useState(false);
    const [isConversationalMode, setIsConversationalMode] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null); // For focusing
    const inputRefVal = useRef(""); // For accessing latest input in voice callbacks
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);
    const silenceTimerRef = useRef<any>(null);
    const isListeningRef = useRef(false);
    const isConversationalModeRef = useRef(false);
    const isSpeechEnabledRef = useRef(false);
    const messagesRef = useRef<Message[]>(messages);
    const isLoadingRef = useRef(false);

    // On mount: load sessions and restore the last active session
    useEffect(() => {
        const init = async () => {
            try {
                const res = await fetch("/api/chat/sessions");
                const data = await res.json();
                if (Array.isArray(data)) {
                    setSessions(data);

                    // Restore last used session from localStorage
                    const savedId = localStorage.getItem("vela_session_id");
                    const sessionExists = savedId && data.find((s: any) => s.id === savedId);

                    if (sessionExists) {
                        // Load messages for the saved session
                        const msgRes = await fetch(`/api/chat/sessions/${savedId}`);
                        const msgs = await msgRes.json();
                        if (Array.isArray(msgs) && msgs.length > 0) {
                            setMessages(msgs);
                            setCurrentSessionId(savedId);
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to init sessions:", error);
            }
        };
        init();
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isLoading]);

    // Persist currentSessionId to localStorage whenever it changes
    useEffect(() => {
        if (currentSessionId) {
            localStorage.setItem("vela_session_id", currentSessionId);
        }
    }, [currentSessionId]);

    const deleteSession = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this chat session?")) return;

        try {
            const res = await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
            if (res.ok) {
                if (id === currentSessionId) {
                    startNewChat();
                }
                fetchSessions();
            }
        } catch (error) {
            console.error("Failed to delete session:", error);
        }
    };

    const fetchSessions = async () => {
        try {
            const res = await fetch("/api/chat/sessions");
            const data = await res.json();
            if (Array.isArray(data)) setSessions(data);
        } catch (error) {
            console.error("Failed to fetch sessions:", error);
        }
    };

    // Keep Refs in sync with React state to avoid stale closures in voice callbacks
    useEffect(() => { inputRefVal.current = input; }, [input]);
    useEffect(() => { isSpeechEnabledRef.current = isSpeechEnabled; }, [isSpeechEnabled]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

    const loadSession = async (id: string) => {
        if (isLoading || id === currentSessionId) return;
        setIsLoading(true);
        setCurrentSessionId(id);
        try {
            const res = await fetch(`/api/chat/sessions/${id}`);
            const msgs = await res.json();
            if (Array.isArray(msgs)) {
                setMessages(msgs);
            }
        } catch (error) {
            console.error("Failed to load session messages:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const startNewChat = () => {
        setCurrentSessionId(null);
        localStorage.removeItem("vela_session_id");
        setMessages([{ role: "assistant", content: WELCOME }]);
    };

    const speak = (text: string, onEnd?: () => void) => {
        if (!isSpeechEnabledRef.current) {
            if (onEnd) onEnd();
            return;
        }
        window.speechSynthesis.cancel();
        
        const cleanText = text
            .replace(/\*\*(.*?)\*\*/g, "$1") 
            .replace(/### (.*?)\n/g, "$1. ")
            .replace(/• (.*?)\n/g, "$1. ")
            .trim();

        const utterance = new SpeechSynthesisUtterance(cleanText);

        if (onEnd) {
            utterance.onend = () => {
                // Give a small delay before triggering callback (e.g. restarting mic)
                setTimeout(onEnd, 300);
            };
            utterance.onerror = () => onEnd();
        }

        const voices = window.speechSynthesis.getVoices();
        const indianFemaleVoice = voices.find(v => 
            (v.lang === "en-IN" && (v.name.toLowerCase().includes("female") || v.name.toLowerCase().includes("india") || v.name.toLowerCase().includes("heera"))) ||
            (v.lang.startsWith("en") && v.name.toLowerCase().includes("india") && v.name.toLowerCase().includes("female"))
        );

        if (indianFemaleVoice) {
            utterance.voice = indianFemaleVoice;
        } else {
            const fallbackVoice = voices.find(v => v.lang === "en-IN") || 
                                 voices.find(v => v.name.toLowerCase().includes("female") && v.lang.startsWith("en"));
            if (fallbackVoice) utterance.voice = fallbackVoice;
        }

        utterance.rate = 1.0;
        utterance.pitch = 1.05;
        window.speechSynthesis.speak(utterance);
    };

    const sendMessage = async (e?: React.FormEvent, customMsg?: string) => {
        if (e) e.preventDefault();
        
        // Use Ref for loading guard to prevent duplicates from race conditions
        if (isLoadingRef.current) return;

        // Prevent race condition: if a manual send happens, clear silence timer
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        const textToSend = customMsg || input.trim();
        if (!textToSend && attachments.length === 0) return;
        
        if (!customMsg) {
            setInput("");
            inputRefVal.current = "";
        }

        const newMessages: Message[] = customMsg
            ? [...messagesRef.current]
            : [...messagesRef.current, { role: "user", content: textToSend, attachments: attachments.length > 0 ? attachments : undefined }];

        if (!customMsg) {
            setMessages(newMessages);
            setAttachments([]);
        }
        setIsLoading(true);
        isLoadingRef.current = true;

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: textToSend,
                    chatHistory: messagesRef.current,
                    sessionId: currentSessionId,
                    attachments: attachments.length > 0 ? attachments : undefined
                }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to send message");

            setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
            
            // If we are in conversational mode, restart the mic after speaking finishes
            const onSpeechEnd = () => {
                if (isConversationalModeRef.current) {
                    toggleVoice();
                }
            };
            speak(data.reply, onSpeechEnd);

            if (data.sessionId && !currentSessionId) {
                setCurrentSessionId(data.sessionId);
                fetchSessions();
            } else {
                fetchSessions();
            }
        } catch (error: any) {
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `Sorry, something went wrong: ${error.message}` },
            ]);
        } finally {
            setIsLoading(false);
            isLoadingRef.current = false;
        }
    };

    const toggleVoice = useCallback(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Voice input is not supported in this browser. Please use Chrome or Edge.");
            return;
        }

        if (isListeningRef.current) {
            recognitionRef.current?.stop();
            isListeningRef.current = false;
            setIsListening(false);
            isConversationalModeRef.current = false;
            setIsConversationalMode(false);
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            return;
        }

        isConversationalModeRef.current = true;
        setIsConversationalMode(true);

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-IN";

        recognition.onresult = (event: any) => {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

            let interim = "";
            let final = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    final += transcript;
                } else {
                    interim += transcript;
                }
            }

            if (final) {
                const cleanFinal = final.toLowerCase().trim();
                // Send keyword detection
                if (cleanFinal.endsWith("send") || cleanFinal.endsWith("send it") || cleanFinal.endsWith("send message")) {
                    const messageToSubmit = (inputRefVal.current + " " + final.replace(/send( it| message)?/gi, "")).trim();
                    if (messageToSubmit) {
                        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                        setInput("");
                        inputRefVal.current = "";
                        sendMessage(undefined, messageToSubmit);
                        recognition.stop();
                        isListeningRef.current = false;
                        setIsListening(false);
                    }
                    return;
                }

                setInput((prev) => {
                    const updated = (prev + " " + final).trim();
                    inputRefVal.current = updated;
                    return updated;
                });

                // Auto-send after 1.5s of silence on a final transcript
                silenceTimerRef.current = setTimeout(() => {
                    const currentInput = inputRefVal.current;
                    if (currentInput.trim()) {
                        setInput("");
                        inputRefVal.current = "";
                        sendMessage(undefined, currentInput.trim());
                        recognition.stop();
                        isListeningRef.current = false;
                        setIsListening(false);
                    }
                }, 1500);
            }
        };

        recognition.onerror = () => { 
            isListeningRef.current = false;
            setIsListening(false); 
        };
        recognition.onend = () => { 
            isListeningRef.current = false;
            setIsListening(false); 
        };

        recognitionRef.current = recognition;
        recognition.start();

        // If speaking, stop it
        window.speechSynthesis.cancel();
        isListeningRef.current = true;
        setIsListening(true);
        setIsSpeechEnabled(true); 
    }, []); // No dependencies - use Refs for state!


    // Cleanup on unmount
    useEffect(() => {
        return () => { 
            recognitionRef.current?.stop(); 
            window.speechSynthesis.cancel();
        };
    }, []);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const SUPPORTED_TEXT_TYPES = ["text/plain", "text/markdown", "application/json", "text/csv", "text/html"];
        const newAttachments: Attachment[] = [];

        for (const file of files) {
            if (file.type.startsWith("image/")) {
                const base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.readAsDataURL(file);
                });
                newAttachments.push({ name: file.name, type: file.type, data: base64 });
            } else if (SUPPORTED_TEXT_TYPES.includes(file.type) || file.name.match(/\.(txt|md|json|csv|html|log)$/i)) {
                const text = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.readAsText(file);
                });
                newAttachments.push({ name: file.name, type: "text/plain", data: text });
            } else if (file.name.endsWith(".docx")) {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                newAttachments.push({ name: file.name, type: "text/plain", data: result.value });
            } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let fullText = "";
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    const strings = content.items.map((item: any) => item.str);
                    fullText += strings.join(" ") + "\n";
                }
                newAttachments.push({ name: file.name, type: "text/plain", data: fullText });
            } else {
                alert(`❌ "${file.name}" is not supported.\n\nVela supports:\n• Images (jpg, png, gif, webp)\n• PDFs (.pdf)\n• Word Docs (.docx)\n• Text files (txt, md, json, csv)`);
            }
        }

        if (newAttachments.length > 0) setAttachments((prev) => [...prev, ...newAttachments]);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const removeAttachment = (index: number) => {
        setAttachments((prev) => prev.filter((_, i) => i !== index));
    };


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
        "Show me the latest MoM",
        "Email the MoM to all attendees",
        "Sync transcripts from Google Drive",
        "Show me the latest transcript",
        "Search for a contact",
        "Analyze uploaded file or image",
    ];

    return (
        <div style={{
            display: "flex",
            height: "calc(100vh - 120px)", minHeight: "600px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderRadius: "24px",
            overflow: "hidden",
        }}>
            {/* Left Sidebar: Session History */}
            <div style={{
                width: "280px",
                borderRight: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.2)",
                display: "flex",
                flexDirection: "column",
            }}>
                <div style={{ padding: "24px" }}>
                    <button
                        onClick={startNewChat}
                        style={{
                            width: "100%",
                            padding: "12px",
                            borderRadius: "12px",
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            color: "#fff",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            transition: "all 0.2s"
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
                        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                    >
                        <Zap style={{ width: "14px", height: "14px", color: "#a78bfa" }} />
                        New Chat
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 24px" }}>
                    <div style={{ padding: "0 12px 12px", fontSize: "0.7rem", fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1px" }}>
                        Recent History
                    </div>
                    {sessions.map((s) => (
                        <div
                            key={s.id}
                            onClick={() => loadSession(s.id)}
                            style={{
                                padding: "12px 16px",
                                borderRadius: "10px",
                                cursor: "pointer",
                                background: currentSessionId === s.id ? "rgba(108,99,255,0.15)" : "transparent",
                                border: currentSessionId === s.id ? "1px solid rgba(108,99,255,0.3)" : "1px solid transparent",
                                marginBottom: "4px",
                                transition: "all 0.2s",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "8px"
                            }}
                            onMouseEnter={e => {
                                if (currentSessionId !== s.id) e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                            }}
                            onMouseLeave={e => {
                                if (currentSessionId !== s.id) e.currentTarget.style.background = "transparent";
                            }}
                        >
                            <div style={{ flex: 1, overflow: "hidden" }}>
                                <div style={{
                                    color: currentSessionId === s.id ? "#fff" : "rgba(255,255,255,0.7)",
                                    fontSize: "0.82rem",
                                    fontWeight: currentSessionId === s.id ? 600 : 400,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis"
                                }}>
                                    {s.title}
                                </div>
                                <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.3)", marginTop: "4px" }}>
                                    {new Date(s.updatedAt).toLocaleDateString()}
                                </div>
                            </div>

                            <button
                                onClick={(e) => deleteSession(e, s.id)}
                                style={{
                                    padding: "6px",
                                    borderRadius: "6px",
                                    color: "rgba(255,255,255,0.2)",
                                    background: "transparent",
                                    border: "none",
                                    cursor: "pointer",
                                    transition: "all 0.2s",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.color = "#ef4444";
                                    e.currentTarget.style.background = "rgba(239,68,68,0.1)";
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.color = "rgba(255,255,255,0.2)";
                                    e.currentTarget.style.background = "transparent";
                                }}
                            >
                                <Trash2 style={{ width: "14px", height: "14px" }} />
                            </button>
                        </div>
                    ))}

                    {sessions.length === 0 && (
                        <div style={{ padding: "12px", textAlign: "center", fontSize: "0.75rem", color: "rgba(255,255,255,0.2)" }}>
                            No chats yet
                        </div>
                    )}
                </div>
            </div>

            {/* Main Chat Area */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                {/* Header */}
                <div style={{
                    padding: "20px 24px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(255,255,255,0.01)",
                    display: "flex", alignItems: "center", gap: "12px"
                }}>
                    <div style={{
                        width: "36px", height: "36px", borderRadius: "10px",
                        background: "linear-gradient(135deg, #6c63ff, #a78bfa)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        <Zap style={{ width: "16px", height: "16px", color: "#fff" }} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#f0f4ff" }}>
                            {currentSessionId ? sessions.find(s => s.id === currentSessionId)?.title || "Chat Session" : "Vela Assistant"}
                        </h2>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "1px" }}>
                            <span className="pulse-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#34d399", display: "inline-block" }} />
                            <span style={{ fontSize: "0.68rem", color: "rgba(240,244,255,0.4)" }}>Listening and learning</span>
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
                                {msg.attachments && msg.attachments.length > 0 && (
                                    <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                                        {msg.attachments.map((at, i) => (
                                            <div key={i} style={{
                                                fontSize: "0.7rem",
                                                background: "rgba(255,255,255,0.1)",
                                                padding: "4px 8px",
                                                borderRadius: "6px",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "6px",
                                                border: "1px solid rgba(255,255,255,0.1)"
                                            }}>
                                                {at.type.startsWith("image/") ? (
                                                    <img src={at.data} style={{ width: "20px", height: "20px", borderRadius: "2px", objectFit: "cover" }} />
                                                ) : (
                                                    <Paperclip style={{ width: "10px", height: "10px" }} />
                                                )}
                                                <span>{at.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

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
                                display: "flex", gap: "4px", alignItems: "center"
                            }}>
                                <span className="typing-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#a78bfa", display: "inline-block" }} />
                                <span className="typing-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#a78bfa", display: "inline-block" }} />
                                <span className="typing-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#a78bfa", display: "inline-block" }} />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Quick Actions */}
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
                                    padding: "6px 14px", borderRadius: "999px",
                                    transition: "all 0.2s"
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(108,99,255,0.2)"}
                                onMouseLeave={e => e.currentTarget.style.background = "rgba(108,99,255,0.1)"}
                            >
                                {action}
                            </button>
                        ))}
                    </div>
                )}

                {/* Preview area for attachments */}
                {attachments.length > 0 && (
                    <div style={{ padding: "12px 24px 0", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {attachments.map((at, i) => (
                            <div key={i} style={{
                                position: "relative",
                                padding: "6px 12px",
                                background: "rgba(108,99,255,0.1)",
                                border: "1px solid rgba(108,99,255,0.3)",
                                borderRadius: "10px",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                            }}>
                                {at.type.startsWith("image/") ? (
                                    <img src={at.data} style={{ width: "24px", height: "24px", borderRadius: "4px", objectFit: "cover" }} />
                                ) : (
                                    <Paperclip style={{ width: "14px", height: "14px", color: "#a78bfa" }} />
                                )}
                                <span style={{ fontSize: "0.75rem", color: "#f0f4ff" }}>{at.name}</span>
                                <button
                                    onClick={() => removeAttachment(i)}
                                    style={{ background: "none", border: "none", padding: "2px", cursor: "pointer", color: "rgba(255,255,255,0.3)" }}
                                    onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                                    onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.3)"}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Input Area */}
                <form onSubmit={sendMessage} style={{
                    padding: "20px 24px",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(0,0,0,0.1)"
                }}>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        multiple
                        style={{ display: "none" }}
                    />
                    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "8px" }}>
                        {/* Attach file */}
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            title="Attach file"
                            style={{
                                width: "40px", height: "40px", borderRadius: "12px",
                                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer", color: "rgba(255,255,255,0.4)", flexShrink: 0,
                                transition: "all 0.2s"
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = "#f0f4ff"}
                            onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.4)"}
                        >
                            <Paperclip style={{ width: "18px", height: "18px" }} />
                        </button>

                        {/* Mic toggle */}
                        <button
                            type="button"
                            onClick={toggleVoice}
                            title={isListening ? "Stop listening" : "Voice input"}
                            style={{
                                width: "40px", height: "40px", borderRadius: "12px",
                                background: isListening ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)",
                                border: isListening ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.1)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer",
                                color: isListening ? "#ef4444" : "rgba(255,255,255,0.4)",
                                flexShrink: 0,
                                transition: "all 0.2s",
                                boxShadow: isListening ? "0 0 12px rgba(239,68,68,0.3)" : "none",
                                animation: isListening ? "pulse 1.5s ease-in-out infinite" : "none"
                            }}
                        >
                            {isListening
                                ? <MicOff style={{ width: "18px", height: "18px" }} />
                                : <Mic style={{ width: "18px", height: "18px" }} />
                            }
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsSpeechEnabled(!isSpeechEnabled)}
                            title={isSpeechEnabled ? "Disable voice output" : "Enable voice output"}
                            style={{
                                width: "40px", height: "40px", borderRadius: "12px",
                                background: isSpeechEnabled ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.05)",
                                border: isSpeechEnabled ? "1px solid rgba(167,139,250,0.5)" : "1px solid rgba(255,255,255,0.1)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer",
                                color: isSpeechEnabled ? "#a78bfa" : "rgba(255,255,255,0.4)",
                                flexShrink: 0,
                                transition: "all 0.2s",
                                boxShadow: isSpeechEnabled ? "0 0 12px rgba(167,139,250,0.3)" : "none",
                            }}
                            onMouseEnter={e => !isSpeechEnabled && (e.currentTarget.style.color = "#f0f4ff")}
                            onMouseLeave={e => !isSpeechEnabled && (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
                        >
                            {isSpeechEnabled
                                ? <Volume2 style={{ width: "18px", height: "18px" }} />
                                : <VolumeX style={{ width: "18px", height: "18px" }} />
                            }
                        </button>

                        <div style={{ position: "relative", flex: 1 }}>
                            <input
                                ref={inputRef}
                                type="text"
                                id="chat-input"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={isListening ? "🎙️ Listening... speak now" : "Ask Vela anything or upload a file..."}
                                disabled={isLoading}
                                style={{
                                    width: "100%",
                                    background: isListening ? "rgba(239,68,68,0.05)" : "rgba(255,255,255,0.06)",
                                    border: isListening ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.1)",
                                    borderRadius: "16px",
                                    padding: "14px 50px 14px 20px",
                                    fontSize: "0.9rem",
                                    color: "#f0f4ff",
                                    outline: "none",
                                    caretColor: "#a78bfa",
                                    transition: "all 0.2s"
                                }}
                                onFocus={e => e.currentTarget.style.border = isListening ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(108,99,255,0.4)"}
                                onBlur={e => e.currentTarget.style.border = isListening ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.1)"}
                            />
                            <button
                                type="submit"
                                disabled={isLoading || (!input.trim() && attachments.length === 0)}
                                style={{
                                    position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)",
                                    width: "36px", height: "36px", borderRadius: "10px",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    background: (input.trim() || attachments.length > 0) && !isLoading
                                        ? "linear-gradient(135deg, #6c63ff, #8b5cf6)"
                                        : "rgba(255,255,255,0.05)",
                                    border: "none",
                                    cursor: (input.trim() || attachments.length > 0) && !isLoading ? "pointer" : "not-allowed",
                                    boxShadow: (input.trim() || attachments.length > 0) && !isLoading ? "0 0 16px rgba(108,99,255,0.3)" : "none",
                                    transition: "all 0.2s",
                                }}
                            >
                                <Send style={{ width: "16px", height: "16px", color: (input.trim() || attachments.length > 0) && !isLoading ? "#fff" : "rgba(255,255,255,0.2)" }} />
                            </button>
                        </div>
                    </div>
                </form>

            </div>
        </div>
    );
}
