import { stat, readFile } from "node:fs/promises";
import {
  MAX_FILE_BYTES,
  errorResponse,
  jsonNoStore,
  localFilesDisabledResponse,
  resolveLocalPath,
} from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const disabled = localFilesDisabledResponse();
  if (disabled) return disabled;
  try {
    const body = await request.json();
    const filePath = resolveLocalPath(body.path);
    const info = await stat(filePath);
    if (!info.isFile()) return errorResponse("Path is not a file.", 400);
    if (info.size > MAX_FILE_BYTES)
      return errorResponse("File is too large to open.", 413);
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
