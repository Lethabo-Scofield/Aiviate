export default function PdfIcon({ size = 24, className = "" }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 1.18)}
      viewBox="0 0 32 38"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 1.5h17l7.5 7.5v26.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-33a1 1 0 0 1 1-1Z" fill="#fff" stroke="#C93434" strokeWidth="1.5" />
      <path d="M21 1.5V9h7.5" fill="#FDE8E8" stroke="#C93434" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M2 18h28v14H2a1 1 0 0 1-1-1V19a1 1 0 0 1 1-1Z" fill="#C93434" />
      <text x="16" y="27.5" textAnchor="middle" fill="white" fontFamily="Arial, sans-serif" fontSize="9.5" fontWeight="800" letterSpacing=".6">PDF</text>
    </svg>
  );
}