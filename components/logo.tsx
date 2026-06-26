// Self-contained badge logo (dark disc + light mark) so it looks consistent on
// any background — an "eye / orbit / spark" mark inspired by the brand art.
export function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="49" fill="#18181b" />
      {/* eye / lens outline */}
      <path
        d="M16 50C28 33 72 33 84 50C72 67 28 67 16 50Z"
        stroke="#ededed"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      {/* orbit ring */}
      <ellipse
        cx="50"
        cy="50"
        rx="33"
        ry="15"
        transform="rotate(-20 50 50)"
        stroke="#ededed"
        strokeWidth="5"
      />
      {/* center spark */}
      <path
        d="M50 37C51.5 46 54 48.5 63 50C54 51.5 51.5 54 50 63C48.5 54 46 51.5 37 50C46 48.5 48.5 46 50 37Z"
        fill="#ededed"
      />
    </svg>
  );
}

export function LogoWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 font-semibold ${className}`}>
      <Logo size={28} />
      <span>DocChat</span>
    </span>
  );
}
