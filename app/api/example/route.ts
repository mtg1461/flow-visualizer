import { NextResponse } from "next/server";
import { SAMPLE } from "@/lib/sample";

/**
 * Serves the built-in example flow. Unlike the disk API this is plain mock
 * data with no filesystem access, so it stays available on a hosted build —
 * it backs the "See an example flow" entry on the connection screen.
 */
export async function GET() {
  return NextResponse.json(SAMPLE, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
