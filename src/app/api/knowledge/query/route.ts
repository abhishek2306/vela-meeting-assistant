import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { knowledgeHub } from "@/lib/knowledge/manager";
import { askKnowledgeBase } from "@/lib/gemini";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { query } = await req.json();
        if (!query) {
            return NextResponse.json({ error: "Query is required" }, { status: 400 });
        }

        const accessToken = (session as any).accessToken;

        // 1. Search all providers
        const items = await knowledgeHub.searchAll(query, { accessToken });
        
        if (items.length === 0) {
            return NextResponse.json({ 
                answer: "I couldn't find any documents related to your query in the connected enterprise hubs.",
                sources: [] 
            });
        }

        // 2. Fetch context from top items
        const context = await knowledgeHub.fetchContext(items, { accessToken });

        // 3. Generate Answer
        const answer = await askKnowledgeBase(query, context);

        return NextResponse.json({
            answer,
            sources: items
        });

    } catch (error: any) {
        console.error("[API Knowledge] Error:", error);
        return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
    }
}
