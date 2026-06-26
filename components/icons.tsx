// AXYS-style mark — two curved blades crossing with a center spark, on a dark disc.
// Used as the AI assistant avatar in the chat.
export function BotMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="49" fill="#0e0e10" />
      <g stroke="#ffffff" strokeWidth="7.5" strokeLinecap="round">
        <path d="M34 24C60 42 60 58 34 76" />
        <path d="M66 24C40 42 40 58 66 76" />
      </g>
      <path d="M50 41L58 50L50 59L42 50Z" fill="#ffffff" />
    </svg>
  );
}

// ionicons "book-outline", inlined as SVG so it inherits currentColor and needs no CDN.
export function BookIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M256 160c16-63.16 76.43-95.41 208-96a15.94 15.94 0 0116 16v288a16 16 0 01-16 16c-128 0-177.45 25.81-208 64-30.37-38-80-64-208-64-9.88 0-16-8.05-16-16V80a15.94 15.94 0 0116-16c131.57.59 192 32.84 208 96zM256 160v288"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="32"
      />
    </svg>
  );
}
