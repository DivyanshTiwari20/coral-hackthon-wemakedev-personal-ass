import { NextResponse } from "next/server";

import { createAssignment, listAssignments } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const subject = searchParams.get("subject");

  return NextResponse.json({
    assignments: listAssignments({ status, subject }),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      subject?: string;
      title?: string;
      due_date?: string | null;
      notes?: string | null;
    };

    if (!body.subject?.trim() || !body.title?.trim()) {
      return NextResponse.json(
        { error: "Subject and title are required." },
        { status: 400 },
      );
    }

    const assignment = createAssignment({
      subject: body.subject.trim(),
      title: body.title.trim(),
      dueDate: body.due_date?.trim() || null,
      notes: body.notes?.trim() || null,
    });

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    console.error("Create assignment failed", error);

    return NextResponse.json(
      { error: "Failed to create assignment." },
      { status: 500 },
    );
  }
}
