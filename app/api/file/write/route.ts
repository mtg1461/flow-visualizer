import path from "node:path";
import { mkdir, stat, writeFile } from "node:fs/promises";
import {
  MAX_FILE_BYTES,
  errorResponse,
  jsonNoStore,
  resolveLocalPath,
} from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const filePath = resolveLocalPath(body.path);
    if (typeof body.contents !== "string")
      return errorResponse("Missing file contents.", 400);
    if (Buffer.byteLength(body.contents, "utf8") > MAX_FILE_BYTES)
      return errorResponse("File is too large to save.", 413);
    JSON.parse(body.contents);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      body.contents.endsWith("\n") ? body.contents : `${body.contents}\n`,
      "utf8"
    );
    const info = await stat(filePath);
    return jsonNoStore({
      path: filePath,
      mtimeMs: info.mtimeMs,
      size: info.size,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
