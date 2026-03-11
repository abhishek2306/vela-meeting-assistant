import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const messages = await prisma.chatMessage.findMany({
            where: { sessionId: id },
            orderBy: { createdAt: "asc" },
        });

        const parsedMessages = messages.map((m) => ({
            ...m,
            attachments: m.attachments ? JSON.parse(m.attachments) : undefined,
        }));

        return NextResponse.json(parsedMessages);
    } catch (error: any) {
        console.error("[Session ID API GET] Error:", error);
        return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await prisma.chatSession.delete({
            where: {
                id: id,
                userId: (session.user as any).id,
            }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("[Session ID API DELETE] Error:", error);
        return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
    }
}

