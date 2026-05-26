import { execFileSync } from "node:child_process";

import type { CoralRow } from "@/lib/types";

function maybeParseJson(output: string) {
  try {
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? (parsed as CoralRow[]) : null;
  } catch {
    return null;
  }
}

function parseDelimitedOutput(output: string) {
  const trimmed = output.trim();

  if (!trimmed) {
    return [];
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const pipeLines = lines.filter((line) => line.includes("|"));

  if (pipeLines.length >= 2) {
    const cleaned = pipeLines
      .map((line) => line.replace(/^\|/, "").replace(/\|$/, ""))
      .map((line) => line.split("|").map((part) => part.trim()));

    const [headers, ...rows] = cleaned.filter(
      (row) => !row.every((cell) => /^-+$/.test(cell)),
    );

    return rows.map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])),
    );
  }

  const tabLines = lines.filter((line) => line.includes("\t"));
  if (tabLines.length >= 2) {
    const [headerLine, ...rowLines] = tabLines;
    const headers = headerLine.split("\t").map((part) => part.trim());

    return rowLines.map((line) => {
      const values = line.split("\t").map((part) => part.trim());
      return Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? null]),
      );
    });
  }

  return lines.map((line) => ({ value: line }));
}

export function parseCoralOutput(output: string) {
  return maybeParseJson(output) ?? parseDelimitedOutput(output);
}

export function runCoralQuery(sql: string) {
  try {
    const result = execFileSync("coral", ["sql", sql], {
      encoding: "utf-8",
      timeout: 30_000,
      maxBuffer: 1024 * 1024 * 4,
    });

    return parseCoralOutput(result);
  } catch (error) {
    console.error("Failed to run Coral query", error);
    return [];
  }
}
