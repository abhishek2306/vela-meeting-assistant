"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Circle, AlertCircle, Clock, Trash2, Plus, Filter, SortAsc, Layout } from "lucide-react";

interface ActionItem {
    id: string;
    title: string;
    description: string | null;
    status: "PENDING" | "DONE" | "CANCELLED";
    priority: "LOW" | "MEDIUM" | "HIGH";
    dueDate: string | null;
    createdAt: string;
}

export function ActionItems() {
    const [items, setItems] = useState<ActionItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<"ALL" | "PENDING" | "DONE">("ALL");
    const [isAdding, setIsAdding] = useState(false);
    const [newItem, setNewItem] = useState({ title: "", description: "", priority: "MEDIUM", dueDate: "" });

    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/action-items");
            const data = await res.json();
            if (Array.isArray(data)) setItems(data);
        } catch (error) {
            console.error("Failed to fetch items:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleStatus = async (item: ActionItem) => {
        const newStatus = item.status === "DONE" ? "PENDING" : "DONE";
        try {
            const res = await fetch("/api/action-items", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: item.id, status: newStatus }),
            });
            if (res.ok) fetchItems();
        } catch (error) {
            console.error("Failed to update status:", error);
        }
    };

    const deleteItem = async (id: string) => {
        if (!confirm("Are you sure?")) return;
        try {
            const res = await fetch(`/api/action-items?id=${id}`, { method: "DELETE" });
            if (res.ok) fetchItems();
        } catch (error) {
            console.error("Failed to delete item:", error);
        }
    };

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch("/api/action-items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newItem),
            });
            if (res.ok) {
                setNewItem({ title: "", description: "", priority: "MEDIUM", dueDate: "" });
                setIsAdding(false);
                fetchItems();
            }
        } catch (error) {
            console.error("Failed to add item:", error);
        }
    };

    const filteredItems = items.filter(item => {
        if (filter === "ALL") return true;
        return item.status === filter;
    });

    const getPriorityColor = (p: string) => {
        switch (p) {
            case "HIGH": return "#f87171";
            case "MEDIUM": return "#fbbf24";
            case "LOW": return "#34d399";
            default: return "rgba(255,255,255,0.4)";
        }
    };

    return (
        <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderRadius: "24px",
            padding: "32px",
            height: "calc(100vh - 120px)",
            overflowY: "auto",
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
                <div>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "#f0f4ff" }}>Action Items</h2>
                    <p style={{ fontSize: "0.85rem", color: "rgba(240,244,255,0.4)", marginTop: "4px" }}>Keep track of your meeting outcomes and tasks.</p>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
                    style={{
                        padding: "10px 20px",
                        background: "linear-gradient(135deg, #6c63ff, #8b5cf6)",
                        border: "none",
                        borderRadius: "12px",
                        color: "#fff",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        boxShadow: "0 4px 15px rgba(108,99,255,0.3)"
                    }}
                >
                    <Plus size={16} /> Add Task
                </button>
            </div>

            <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
                {["ALL", "PENDING", "DONE"].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f as any)}
                        style={{
                            padding: "6px 14px",
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            background: filter === f ? "rgba(108,99,255,0.15)" : "transparent",
                            border: `1px solid ${filter === f ? "rgba(108,99,255,0.4)" : "rgba(255,255,255,0.1)"}`,
                            color: filter === f ? "#a78bfa" : "rgba(240,244,255,0.5)",
                            cursor: "pointer",
                            textTransform: "capitalize"
                        }}
                    >
                        {f.toLowerCase()}
                    </button>
                ))}
            </div>

            {isAdding && (
                <form onSubmit={handleAddItem} style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(108,99,255,0.2)",
                    borderRadius: "16px",
                    padding: "20px",
                    marginBottom: "24px",
                    display: "grid",
                    gap: "16px"
                }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: "12px" }}>
                        <input
                            type="text"
                            placeholder="What needs to be done?"
                            value={newItem.title}
                            onChange={e => setNewItem({ ...newItem, title: e.target.value })}
                            required
                            style={{
                                background: "rgba(0,0,0,0.2)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "8px",
                                padding: "10px 14px",
                                color: "#fff",
                                fontSize: "0.9rem"
                            }}
                        />
                        <select
                            value={newItem.priority}
                            onChange={e => setNewItem({ ...newItem, priority: e.target.value as any })}
                            style={{
                                background: "rgba(0,0,0,0.2)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "8px",
                                padding: "10px",
                                color: "#fff",
                                fontSize: "0.9rem"
                            }}
                        >
                            <option value="LOW">Low</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="HIGH">High</option>
                        </select>
                    </div>
                    <textarea
                        placeholder="Additional details..."
                        value={newItem.description}
                        onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                        style={{
                            background: "rgba(0,0,0,0.2)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "8px",
                            padding: "10px 14px",
                            color: "#fff",
                            fontSize: "0.9rem",
                            minHeight: "80px",
                            resize: "vertical"
                        }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                        <button
                            type="button"
                            onClick={() => setIsAdding(false)}
                            style={{ padding: "8px 16px", color: "rgba(240,244,255,0.5)", fontSize: "0.85rem", cursor: "pointer", background: "none", border: "none" }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            style={{
                                padding: "8px 24px",
                                background: "#6c63ff",
                                border: "none",
                                borderRadius: "8px",
                                color: "#fff",
                                fontWeight: 600,
                                fontSize: "0.85rem",
                                cursor: "pointer"
                            }}
                        >
                            Save Task
                        </button>
                    </div>
                </form>
            )}

            {isLoading ? (
                <div style={{ textAlign: "center", padding: "40px" }}>
                    <div className="animate-pulse" style={{ color: "rgba(240,244,255,0.2)" }}>Loading tasks...</div>
                </div>
            ) : filteredItems.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", background: "rgba(255,255,255,0.02)", borderRadius: "20px", border: "1px dashed rgba(255,255,255,0.1)" }}>
                    <CheckCircle2 size={48} style={{ color: "rgba(255,255,255,0.05)", margin: "0 auto 16px" }} />
                    <p style={{ color: "rgba(240,244,255,0.3)", fontSize: "0.9rem" }}>No tasks found in this category.</p>
                </div>
            ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                    {filteredItems.map(item => (
                        <div key={item.id} style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            borderRadius: "16px",
                            padding: "16px 20px",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "16px",
                            transition: "all 0.2s",
                            opacity: item.status === "DONE" ? 0.6 : 1
                        }}>
                            <button
                                onClick={() => toggleStatus(item)}
                                style={{
                                    marginTop: "2px",
                                    color: item.status === "DONE" ? "#a78bfa" : "rgba(255,255,255,0.2)",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: 0
                                }}
                            >
                                {item.status === "DONE" ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                            </button>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                                    <h3 style={{
                                        margin: 0,
                                        fontSize: "1rem",
                                        fontWeight: 600,
                                        color: item.status === "DONE" ? "rgba(240,244,255,0.4)" : "#f0f4ff",
                                        textDecoration: item.status === "DONE" ? "line-through" : "none"
                                    }}>
                                        {item.title}
                                    </h3>
                                    <span style={{
                                        fontSize: "0.65rem",
                                        fontWeight: 700,
                                        padding: "2px 8px",
                                        borderRadius: "999px",
                                        background: `${getPriorityColor(item.priority)}20`,
                                        color: getPriorityColor(item.priority),
                                        border: `1px solid ${getPriorityColor(item.priority)}40`,
                                        textTransform: "uppercase"
                                    }}>
                                        {item.priority}
                                    </span>
                                </div>
                                {item.description && (
                                    <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "rgba(240,244,255,0.4)", lineHeight: 1.5 }}>
                                        {item.description}
                                    </p>
                                )}
                                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "12px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.72rem", color: "rgba(240,244,255,0.3)" }}>
                                        <Clock size={12} />
                                        <span>Added {new Date(item.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    {item.dueDate && (
                                        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.72rem", color: "#fbbf24" }}>
                                            <AlertCircle size={12} />
                                            <span>Due {new Date(item.dueDate).toLocaleDateString()}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => deleteItem(item.id)}
                                style={{
                                    color: "rgba(240,113,113,0.3)",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: "4px",
                                    alignSelf: "center",
                                    transition: "color 0.2s"
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = "rgba(240,113,113,0.8)"}
                                onMouseLeave={e => e.currentTarget.style.color = "rgba(240,113,113,0.3)"}
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
