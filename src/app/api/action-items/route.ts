import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const actionItems = await prisma.actionItem.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json(actionItems);
    } catch (error) {
        console.error("Failed to fetch action items:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const body = await req.json();
        const { title, description, priority, dueDate, meetingId } = body;

        const actionItem = await prisma.actionItem.create({
            data: {
                userId: user.id,
                title,
                description,
                priority: priority || "MEDIUM",
                dueDate: dueDate ? new Date(dueDate) : null,
                meetingId,
            },
        });

        return NextResponse.json(actionItem);
    } catch (error) {
        console.error("Failed to create action item:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { id, status, priority, title, description, dueDate } = body;

        // Verify ownership
        const existing = await prisma.actionItem.findUnique({
            where: { id },
            include: { user: true },
        });

        if (!existing || existing.user.email !== session.user.email) {
            return NextResponse.json({ error: "Unauthorized or not found" }, { status: 401 });
        }

        const updated = await prisma.actionItem.update({
            where: { id },
            data: {
                status,
                priority,
                title,
                description,
                dueDate: dueDate ? new Date(dueDate) : undefined,
            },
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Failed to update action item:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    try {
        // Verify ownership
        const existing = await prisma.actionItem.findUnique({
            where: { id },
            include: { user: true },
        });

        if (!existing || existing.user.email !== session.user.email) {
            return NextResponse.json({ error: "Unauthorized or not found" }, { status: 401 });
        }

        await prisma.actionItem.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete action item:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
