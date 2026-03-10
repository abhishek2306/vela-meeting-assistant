"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { Zap, User, LogOut, LogIn } from "lucide-react";

export function Navigation() {
    const { data: session } = useSession();

    return (
        <nav style={{ position: "relative", zIndex: 50 }} className="glass border-b border-white/5">
            <div className="max-w-7xl mx-auto px-6">
                <div className="flex justify-between items-center h-16">
                    {/* Logo */}
                    <div className="flex items-center gap-2.5">
                        <div style={{
                            background: "linear-gradient(135deg, #6c63ff, #a78bfa)",
                            borderRadius: "10px",
                            padding: "6px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 0 20px rgba(108,99,255,0.4)"
                        }}>
                            <Zap style={{ width: "16px", height: "16px", color: "#fff" }} />
                        </div>
                        <span style={{
                            fontSize: "1.25rem",
                            fontWeight: 700,
                            background: "linear-gradient(135deg, #f0f4ff, #a78bfa)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            letterSpacing: "-0.5px"
                        }}>
                            Vela
                        </span>
                        <span style={{
                            fontSize: "0.65rem",
                            fontWeight: 600,
                            color: "rgba(167,139,250,0.7)",
                            background: "rgba(108,99,255,0.15)",
                            border: "1px solid rgba(108,99,255,0.3)",
                            padding: "2px 8px",
                            borderRadius: "999px",
                            letterSpacing: "0.05em",
                            textTransform: "uppercase"
                        }}>
                            AI
                        </span>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-3">
                        {session ? (
                            <>
                                <div className="flex items-center gap-2.5">
                                    {session.user?.image ? (
                                        <img src={session.user.image} alt="" style={{
                                            width: "32px", height: "32px", borderRadius: "50%",
                                            border: "2px solid rgba(108,99,255,0.5)"
                                        }} />
                                    ) : (
                                        <div style={{
                                            width: "32px", height: "32px", borderRadius: "50%",
                                            background: "rgba(108,99,255,0.2)",
                                            display: "flex", alignItems: "center", justifyContent: "center"
                                        }}>
                                            <User style={{ width: "16px", height: "16px", color: "#a78bfa" }} />
                                        </div>
                                    )}
                                    <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "rgba(240,244,255,0.8)" }}>
                                        {session.user?.name?.split(" ")[0]}
                                    </span>
                                </div>
                                <button
                                    onClick={() => signOut()}
                                    style={{
                                        display: "flex", alignItems: "center", gap: "6px",
                                        background: "rgba(255,255,255,0.05)",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        color: "rgba(240,244,255,0.7)",
                                        padding: "6px 14px", borderRadius: "8px",
                                        fontSize: "0.8rem", fontWeight: 500, cursor: "pointer"
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                                >
                                    <LogOut style={{ width: "13px", height: "13px" }} />
                                    Sign Out
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => signIn("google")}
                                style={{
                                    display: "flex", alignItems: "center", gap: "8px",
                                    background: "linear-gradient(135deg, #6c63ff, #8b5cf6)",
                                    color: "#fff", padding: "8px 20px", borderRadius: "10px",
                                    fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
                                    border: "none", boxShadow: "0 0 20px rgba(108,99,255,0.3)"
                                }}
                                onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 0 30px rgba(108,99,255,0.5)")}
                                onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 0 20px rgba(108,99,255,0.3)")}
                            >
                                <LogIn style={{ width: "15px", height: "15px" }} />
                                Sign In with Google
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}
