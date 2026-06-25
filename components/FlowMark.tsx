/**
 * Brand mark — the same glyph as the favicon (app/icon.svg): a decision tile
 * fanning into two child tiles, in the app's step-kind palette. Kept in sync
 * with the favicon by hand (two small files). Decorative.
 */
export function FlowMark({
  size = 48,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect width="32" height="32" rx="7" fill="var(--app-panel)" />
      <g
        fill="none"
        stroke="var(--app-accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      >
        <path d="M16 12 V16 H8 V19" />
        <path d="M16 16 H24 V19" />
      </g>
      <rect x="11" y="5" width="10" height="7" rx="2.2" fill="var(--app-accent)" />
      <rect x="3" y="19" width="10" height="7" rx="2.2" fill="var(--app-teal)" />
      <rect x="19" y="19" width="10" height="7" rx="2.2" fill="var(--app-amber)" />
    </svg>
  );
}
