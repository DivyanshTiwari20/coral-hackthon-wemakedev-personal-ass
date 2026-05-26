"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCcw } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Assignment } from "@/lib/types";

type AssignmentsPayload = {
  assignments: Assignment[];
};

const statusOptions = ["all", "pending", "submitted"] as const;

function AssignmentsSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("all");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    title: "",
    due_date: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function loadAssignments(nextStatus = status, nextSubject = subjectFilter) {
    setError(null);
    const params = new URLSearchParams();

    if (nextStatus !== "all") {
      params.set("status", nextStatus);
    }

    if (nextSubject.trim()) {
      params.set("subject", nextSubject.trim());
    }

    setIsLoading(true);

    void (async () => {
      try {
        const query = params.toString();
        const response = await fetch(
          query ? `/api/assignments?${query}` : "/api/assignments",
          { cache: "no-store" },
        );

        if (!response.ok) {
          throw new Error("Assignments request failed");
        }

        const payload = (await response.json()) as AssignmentsPayload;
        setAssignments(payload.assignments);
      } catch (assignmentsError) {
        console.error(assignmentsError);
        setError("Assignments could not be loaded.");
      } finally {
        setIsLoading(false);
      }
    })();
  }

  useEffect(() => {
    setError(null);
    setIsLoading(true);

    void (async () => {
      try {
        const response = await fetch("/api/assignments", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Assignments request failed");
        }

        const payload = (await response.json()) as AssignmentsPayload;
        setAssignments(payload.assignments);
      } catch (assignmentsError) {
        console.error(assignmentsError);
        setError("Assignments could not be loaded.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  function handleAddAssignment() {
    if (!form.subject.trim() || !form.title.trim()) {
      setError("Subject and title are required.");
      return;
    }

    setError(null);

    setIsLoading(true);

    void (async () => {
      try {
        const response = await fetch("/api/assignments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject: form.subject,
            title: form.title,
            due_date: form.due_date || null,
            notes: form.notes || null,
          }),
        });

        if (!response.ok) {
          throw new Error("Create assignment failed");
        }

        setForm({ subject: "", title: "", due_date: "", notes: "" });
        setIsDialogOpen(false);
        loadAssignments();
      } catch (createError) {
        console.error(createError);
        setError("The assignment could not be created.");
        setIsLoading(false);
      }
    })();
  }

  function handleMarkSubmitted(id: number) {
    setIsLoading(true);

    void (async () => {
      try {
        const response = await fetch(`/api/assignments/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "submitted" }),
        });

        if (!response.ok) {
          throw new Error("Update assignment failed");
        }

        loadAssignments();
      } catch (updateError) {
        console.error(updateError);
        setError("The assignment status could not be updated.");
        setIsLoading(false);
      }
    })();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge className="mb-3" variant="secondary">
            Coursework tracker
          </Badge>
          <h2 className="text-3xl font-semibold text-zinc-50">Assignments</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Add, filter, and submit assignments here or through chat.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => loadAssignments()} disabled={isLoading}>
            <RefreshCcw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                Add assignment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add assignment</DialogTitle>
                <DialogDescription>
                  Capture a class deliverable with due date and notes.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Input
                  placeholder="Subject"
                  value={form.subject}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, subject: event.target.value }))
                  }
                />
                <Input
                  placeholder="Title"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                />
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, due_date: event.target.value }))
                  }
                />
                <Textarea
                  placeholder="Notes"
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  className="min-h-28"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddAssignment} disabled={isLoading}>
                  Save assignment
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle>Current queue</CardTitle>
            <CardDescription>Filter by status and subject.</CardDescription>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Tabs
              value={status}
              onValueChange={(value) => {
                const nextStatus = value as (typeof statusOptions)[number];
                setStatus(nextStatus);
                loadAssignments(nextStatus, subjectFilter);
              }}
            >
              <TabsList>
                {statusOptions.map((option) => (
                  <TabsTrigger key={option} value={option} className="capitalize">
                    {option}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex w-full max-w-sm items-center gap-2">
              <Input
                placeholder="Filter by subject"
                value={subjectFilter}
                onChange={(event) => setSubjectFilter(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    loadAssignments(status, subjectFilter);
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadAssignments(status, subjectFilter)}
                disabled={isLoading}
              >
                Apply filters
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!assignments.length && isLoading ? <AssignmentsSkeleton /> : null}
          {error ? <p className="mb-4 text-sm text-rose-400">{error}</p> : null}

          {assignments.length === 0 && !isLoading ? (
            <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
              No assignments match the current filters.
            </div>
          ) : null}

          {assignments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell>{assignment.subject}</TableCell>
                    <TableCell>{assignment.title}</TableCell>
                    <TableCell>{assignment.due_date ?? "No due date"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          assignment.status === "submitted" ? "secondary" : "default"
                        }
                      >
                        {assignment.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={assignment.status === "submitted" || isLoading}
                        onClick={() => handleMarkSubmitted(assignment.id)}
                      >
                        Mark submitted
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
