import { stat, readFile } from "node:fs/promises";
import { errorResponse, jsonNoStore, resolveLocalPath } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const filePath = resolveLocalPath(body.path);
    const info = await stat(filePath);
    if (!info.isFile()) return errorResponse("Path is not a file.", 400);
    const contents = await readFile(filePath, "utf8");
    return jsonNoStore({
      path: filePath,
      contents,
      mtimeMs: info.mtimeMs,
      size: info.size,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
