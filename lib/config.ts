/**
 * Whether the local-disk file API (`/api/file/*`) and its path-based
 * connection UI are available.
 *
 * The disk API resolves client-supplied absolute paths — that is the point
 * of a local single-user tool, but it must never be exposed on a shared host
 * (e.g. Vercel), where it is both a security hole and useless (the user's
 * files are not on the server). So it is on in development and off in a
 * production build, unless explicitly re-enabled for a self-hosted local
 * build via NEXT_PUBLIC_UNFOLD_LOCAL_FILES=1.
 *
 * Pure module (no node imports) so both server routes and client components
 * read the same flag. NEXT_PUBLIC_ vars are inlined into the client bundle.
 */
export const LOCAL_FILES_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_UNFOLD_LOCAL_FILES === "1";
