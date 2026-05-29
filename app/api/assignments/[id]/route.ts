import { NextResponse } from "next/server";

import { deleteAssignment, updateAssignmentStatus } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/assignments/[id]">,
) {
  try {
    const { id } = await context.params;
    const assignmentId = Number(id);

    if (Number.isNaN(assignmentId)) {
      return NextResponse.json(
        { error: "Assignment id must be numeric." },
        { status: 400 },
      );
    }

    const body = (await request.json()) as { status?: "pending" | "submitted" };
    const status = body.status ?? "submitted";
    const assignment = updateAssignmentStatus(assignmentId, status);

    if (!assignment) {
      return NextResponse.json(
        { error: "Assignment not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ assignment });
  } catch (error) {
    console.error("Update assignment failed", error);

    return NextResponse.json(
      { error: "Failed to update assignment." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/assignments/[id]">,
) {
  try {
    const { id } = await context.params;
    const assignmentId = Number(id);

    if (Number.isNaN(assignmentId)) {
      return NextResponse.json(
        { error: "Assignment id must be numeric." },
        { status: 400 },
      );
    }

    deleteAssignment(assignmentId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete assignment failed", error);

    return NextResponse.json(
      { error: "Failed to delete assignment." },
      { status: 500 },
    );
  }
}
