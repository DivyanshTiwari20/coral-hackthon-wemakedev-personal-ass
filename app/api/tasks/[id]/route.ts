import { NextResponse } from "next/server";

import { deleteTask } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/tasks/[id]">,
) {
  try {
    const { id } = await context.params;
    const taskId = Number(id);

    if (Number.isNaN(taskId)) {
      return NextResponse.json(
        { error: "Task id must be numeric." },
        { status: 400 },
      );
    }

    deleteTask(taskId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete task failed", error);

    return NextResponse.json(
      { error: "Failed to delete task." },
      { status: 500 },
    );
  }
}
