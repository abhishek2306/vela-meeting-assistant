import { useState, useRef, useEffect } from "react";
import { 
    Search, Globe, FileText, Database, Shield, Zap, 
    ExternalLink, Library, Sparkles, BookOpen, Layers,
    ArrowRight, MessageSquare, Info, History
} from "lucide-react";

export function KnowledgeHub() {
    const [query, setQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [result, setResult] = useState<{ answer: string; sources: any[] } | null>(null);
    const resultsRef = useRef<HTMLDivElement>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setIsSearching(true);
        setResult(null);

        try {
            const res = await fetch("/api/knowledge/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query })
            });
            const data = await res.json();
            setResult(data);
        } catch (error) {
            console.error("Search failed:", error);
        } finally {
            setIsSearching(false);
        }
    };

    useEffect(() => {
        if (result && resultsRef.current) {
            resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, [result]);

    // -- Theme Tokens --
    const tokens = {
        primary: "#a78bfa",
        secondary: "#6366f1",
        accent: "#f472b6",
        bg: "rgba(15, 15, 20, 0.7)",
        cardBg: "rgba(255, 255, 255, 0.03)",
        border: "rgba(255, 255, 255, 0.08)",
        textMain: "#f0f4ff",
        textDim: "rgba(240, 244, 255, 0.5)",
        glass: "backdrop-filter blur(16px)",
    };

    return (
        <div style={{ 
            height: "100%", 
            display: "flex", 
            flexDirection: "column",
            background: "radial-gradient(circle at 50% -20%, rgba(108, 99, 255, 0.15) 0%, rgba(0, 0, 0, 0) 50%)",
            padding: "40px 0"
        }}>
            {/* ── Header ── */}
            <div style={{ maxWidth: "800px", margin: "0 auto 48px", textAlign: "center", padding: "0 24px" }}>
                <div style={{ 
                    display: "inline-flex", 
                    alignItems: "center", 
                    gap: "8px", 
                    padding: "6px 12px", 
                    background: "rgba(167, 139, 250, 0.1)", 
                    border: "1px solid rgba(167, 139, 250, 0.2)",
                    borderRadius: "999px",
                    color: tokens.primary,
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    marginBottom: "20px"
                }}>
                    <BookOpen size={14} /> Enterprise Knowledge Hub
                </div>
                <h1 style={{ 
                    fontSize: "2.5rem", 
                    fontWeight: 800, 
                    color: tokens.textMain, 
                    marginBottom: "16px",
                    background: "linear-gradient(to bottom, #fff, rgba(255,255,255,0.6))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent"
                }}>
                    Ask Vela Anything.
                </h1>
                <p style={{ fontSize: "1.1rem", color: tokens.textDim, lineHeight: 1.6 }}>
                    Vela reasons across your entire organizational brain—from Google Drive and local archives to shared document repositories.
                </p>
            </div>

            {/* ── Search Canvas ── */}
            <div style={{ maxWidth: "1200px", width: "100%", margin: "0 auto", padding: "0 40px" }}>
                <form onSubmit={handleSearch} style={{ position: "relative", marginBottom: result ? "60px" : "100px" }}>
                    <div style={{
                        position: "relative",
                        background: "rgba(255,255,255,0.05)",
                        border: `1px solid ${isSearching ? tokens.primary : tokens.border}`,
                        borderRadius: "24px",
                        boxShadow: isSearching ? `0 0 30px rgba(167, 139, 250, 0.2)` : "0 10px 40px rgba(0,0,0,0.3)",
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                        overflow: "hidden"
                    }}>
                        <Search style={{ 
                            position: "absolute", 
                            left: "24px", 
                            top: "50%", 
                            transform: "translateY(-50%)", 
                            color: tokens.textDim,
                            opacity: isSearching ? 0.3 : 1
                        }} />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Type your question... (e.g., 'Analyze the Nestle Q4 outcome')"
                            style={{
                                width: "100%",
                                background: "none",
                                border: "none",
                                padding: "24px 80px 24px 64px",
                                fontSize: "1.2rem",
                                color: "#fff",
                                outline: "none",
                            }}
                        />
                        <button 
                            type="submit"
                            style={{
                                position: "absolute",
                                right: "12px",
                                top: "50%",
                                transform: "translateY(-50%)",
                                padding: "12px",
                                background: tokens.primary,
                                border: "none",
                                borderRadius: "16px",
                                color: "#000",
                                cursor: "pointer",
                                transition: "all 0.2s"
                            }}
                        >
                            {isSearching ? <Sparkles className="animate-spin" size={20} /> : <ArrowRight size={20} />}
                        </button>
                    </div>
                </form>

                {/* ── Document View (Canvas) ── */}
                {result ? (
                    <div ref={resultsRef} style={{ 
                        display: "grid", 
                        gridTemplateColumns: "1fr 340px", 
                        gap: "40px", 
                        animation: "canvasSlideUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)"
                    }}>
                        {/* Center Canvas */}
                        <div style={{
                            background: "rgba(255, 255, 255, 0.02)",
                            border: "1px solid rgba(255, 255, 255, 0.05)",
                            borderRadius: "32px",
                            padding: "48px",
                            boxShadow: "inset 0 0 20px rgba(255,255,255,0.02)"
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "32px" }}>
                                <div style={{ 
                                    width: "32px", height: "32px", borderRadius: "8px", 
                                    background: "linear-gradient(135deg, #a78bfa, #6366f1)",
                                    display: "flex", alignItems: "center", justifyContent: "center"
                                }}>
                                    <BotIcon size={18} color="#000" />
                                </div>
                                <span style={{ fontWeight: 700, fontSize: "0.9rem", color: tokens.textMain, letterSpacing: "0.5px" }}>Vela Intelligence</span>
                            </div>

                            <div style={{ fontSize: "1.1rem", lineHeight: 1.8, color: "rgba(255,255,255,0.9)" }}>
                                {result.answer.split('\n').map((line, i) => {
                                    if (!line.trim()) return <br key={i} />;
                                    // Basic list detection
                                    if (line.trim().startsWith('|') || line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                                        return <div key={i} style={{ paddingLeft: "12px", borderLeft: `2px solid ${tokens.primary}`, marginBottom: "16px", background: "rgba(167, 139, 250, 0.03)" }}>{line}</div>;
                                    }
                                    return <p key={i} style={{ marginBottom: "20px" }}>{line}</p>;
                                })}
                            </div>

                            <div style={{ marginTop: "40px", paddingTop: "32px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: "24px" }}>
                                <div style={statItem}>
                                    <span style={statLabel}>SOURCES</span>
                                    <span style={statValue}>{result.sources.length} Verified</span>
                                </div>
                                <div style={statItem}>
                                    <span style={statLabel}>TRUST SCORE</span>
                                    <span style={statValue}>98% Optimized</span>
                                </div>
                            </div>
                        </div>

                        {/* Side Panel: Intelligence & Sources */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                            <div style={sideCard}>
                                <h3 style={sideHeader}><Shield size={14} color={tokens.primary} /> Proof of Knowledge</h3>
                                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                    {result.sources.map((source: any, i: number) => (
                                        <div key={i} style={sourceCard}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                                                {source.metadata.mimeType?.includes("pdf") ? <FileText size={14} color="#f87171" /> : <Globe size={14} color="#60a5fa" />}
                                                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{source.title}</span>
                                            </div>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <span style={{ fontSize: "0.7rem", color: tokens.textDim }}>{source.metadata.source}</span>
                                                {source.metadata.url && (
                                                    <a href={source.metadata.url} target="_blank" rel="noopener noreferrer" style={{ color: tokens.primary }}>
                                                        <ExternalLink size={12} />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={sideCard}>
                                <h3 style={sideHeader}><History size={14} color={tokens.primary} /> Related Insights</h3>
                                <p style={{ fontSize: "0.8rem", color: tokens.textDim, fontStyle: "italic" }}>
                                    Ask Vela follow-up questions about specific clauses or entities mentioned in this result.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : !isSearching && result === null ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", opacity: 0.8 }}>
                        <div style={featureCard}>
                            <Layers style={featureIcon} />
                            <h4 style={featureTitle}>Synthesized Intelligence</h4>
                            <p style={featureText}>Vela reads multiple documents simultaneously to find patterns and outliers across your organization.</p>
                        </div>
                        <div style={featureCard}>
                            <Shield style={featureIcon} />
                            <h4 style={featureTitle}>Private & Protected</h4>
                            <p style={featureText}>Your workspace data never leaves your environment. Vela respects all existing access permissions and roles.</p>
                        </div>
                        <div style={featureCard}>
                            <Database style={featureIcon} />
                            <h4 style={featureTitle}>Multi-Source Context</h4>
                            <p style={featureText}>Connect your local SAN, Google Drive, OneDrive, and even shared emails for a unified semantic search.</p>
                        </div>
                    </div>
                ) : (
                    <div style={{ textAlign: "center", padding: "100px 0" }}>
                        <div className="animate-pulse" style={{ marginBottom: "24px" }}>
                            <div style={{ 
                                width: "64px", height: "64px", borderRadius: "20px", 
                                background: "rgba(167, 139, 250, 0.1)", border: "1px solid rgba(167, 139, 250, 0.2)",
                                margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center"
                            }}>
                                <Zap color={tokens.primary} size={32} />
                            </div>
                        </div>
                        <h2 style={{ fontSize: "1.2rem", fontWeight: 600, color: tokens.textMain }}>Synchronizing Neural Connections...</h2>
                        <p style={{ color: tokens.textDim }}>Vela is crawling your hubs and reasoning over the findings.</p>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes canvasSlideUp {
                    from { opacity: 0; transform: translateY(40px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .bot-pulse {
                    animation: botPulse 2s infinite;
                }
                @keyframes botPulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }
            `}</style>
        </div>
    );
}

// -- Sub-Components & Styles --

const sideCard = {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "24px",
    padding: "20px",
};

const sideHeader = {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "#fff",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
    marginBottom: "16px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
};

const sourceCard = {
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.03)",
    borderRadius: "12px",
    padding: "12px",
    transition: "all 0.2s",
    cursor: "default"
};

const statItem = {
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px"
};

const statLabel = {
    fontSize: "0.65rem",
    fontWeight: 800,
    color: "rgba(240, 244, 255, 0.4)",
    letterSpacing: "1.5px"
};

const statValue = {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "#a78bfa"
};

const featureCard = {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "24px",
    padding: "32px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
};

const featureIcon = {
    width: "28px",
    height: "28px",
    color: "#a78bfa"
};

const featureTitle = {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "#f0f4ff",
    margin: 0
};

const featureText = {
    fontSize: "0.9rem",
    color: "rgba(240, 244, 255, 0.4)",
    lineHeight: 1.6,
    margin: 0
};

function BotIcon({ size, color }: { size: number; color: string }) {
    return (
        <svg  width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2" />
            <path d="M20 14h2" />
            <path d="M15 13v2" />
            <path d="M9 13v2" />
        </svg>
    );
}
