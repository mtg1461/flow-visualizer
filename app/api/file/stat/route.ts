import { stat } from "node:fs/promises";
import {
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
    return jsonNoStore({
      path: filePath,
      mtimeMs: info.mtimeMs,
      size: info.size,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
