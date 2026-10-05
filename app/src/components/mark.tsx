export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 56"
      fill="none"
      role="img"
      aria-hidden="true"
      className={className}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <path d="M9 1.5 C 11.5 12, 15.5 19, 19.5 25.5" stroke="currentColor" strokeWidth="5.2" strokeLinecap="round" />
      <path d="M31.5 1 C 27 11, 23 19.5, 19.8 25.3" stroke="currentColor" strokeWidth="5.2" strokeLinecap="round" />
      <path d="M19.5 25.5 C 18 36, 15.5 45, 12.5 54.5" stroke="currentColor" strokeWidth="5.2" strokeLinecap="round" />
    </svg>
  );
}
