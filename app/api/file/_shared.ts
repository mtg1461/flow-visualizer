import path from "node:path";
import { NextResponse } from "next/server";
import { LOCAL_FILES_ENABLED } from "@/lib/config";

/** Upper bound on any flow file the disk API will read or write (8 MB).
 *  A flow document is a few KB; this only exists to stop the endpoint from
 *  being used to slurp or clobber arbitrarily large files. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/**
 * Resolve a client-supplied path to an absolute one. The disk API is a
 * convenience for a LOCAL, single-user tool — it intentionally allows
 * absolute paths so a user can open a flow file anywhere on their machine.
 * It is NOT safe to expose to a network: callers must keep the server bound
 * to localhost (see the `dev` script) or gate these routes behind auth and a
 * root-confinement check before hosting them for multiple users.
 *
 * As defense in depth the API only ever touches `.json` files, so even a
 * reachable endpoint cannot overwrite executables, configs, or dotfiles.
 */
export function resolveLocalPath(input: unknown) {
  if (typeof input !== "string" || !input.trim())
    throw new Error("Enter a local JSON file path.");
  const trimmed = input.trim();
  const resolved = path.normalize(
    path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed)
  );
  if (path.extname(resolved).toLowerCase() !== ".json")
    throw new Error("Only .json files can be opened or saved.");
  return resolved;
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

/**
 * Guard for the disk routes. On a hosted/production build the disk API is
 * off by default (see lib/config.ts) — it is meaningless and unsafe there.
 * Returns a ready 403 response when disabled, or null to proceed.
 */
export function localFilesDisabledResponse() {
  if (LOCAL_FILES_ENABLED) return null;
  return errorResponse(
    "Local file access is disabled on this deployment. Drag in a JSON file or use Browse instead.",
    403
  );
}
