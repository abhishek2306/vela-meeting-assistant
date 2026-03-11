import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const sessions = await prisma.chatSession.findMany({
            where: { userId: (session.user as any).id },
            orderBy: { updatedAt: "desc" },
            select: {
                id: true,
                title: true,
                updatedAt: true,
            }
        });

        return NextResponse.json(sessions);
    } catch (error: any) {
        console.error("[Session API GET] Error:", error);
        return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
    }
}

export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const newSession = await prisma.chatSession.create({
            data: {
                userId: (session.user as any).id,
                title: "New Chat",
            }
        });

        return NextResponse.json(newSession);
    } catch (error: any) {
        console.error("[Session API POST] Error:", error);
        return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }
}
