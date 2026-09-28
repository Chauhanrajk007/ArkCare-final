"use client";

/**
 * A small inline capsule glyph (the "CAP" participation token). Rendered as SVG
 * so it stays crisp and themeable without shipping a raster asset, and inherits
 * the current text colour.
 */
export default function CapsuleIcon({ size = 16, className = "", title = "Capsule" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      {/* capsule body split diagonally into two halves */}
      <g transform="rotate(-45 16 16)">
        <rect
          x="6"
          y="11"
          width="20"
          height="10"
          rx="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <path
          d="M6 16h20"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
