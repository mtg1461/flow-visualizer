import path from "node:path";
import { NextResponse } from "next/server";

export function resolveLocalPath(input: unknown) {
  if (typeof input !== "string" || !input.trim())
    throw new Error("Enter a local JSON file path.");
  const trimmed = input.trim();
  return path.normalize(
    path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed)
  );
}

export function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function errorResponse(error: unknown, status = 400) {
  return jsonNoStore(
    {
      error:
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "File operation failed.",
    },
    status
  );
}
