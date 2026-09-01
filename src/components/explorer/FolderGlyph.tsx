export function FolderGlyph({
  size = 16,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      <path
        className="xp-folder-fill"
        d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.2c.4 0 .8.16 1.1.44L11.7 6.8c.2.2.5.3.8.3H18a2.5 2.5 0 0 1 2.5 2.5V17A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V7.5Z"
      />
      <path
        fill="none"
        stroke="#d4a24a"
        strokeWidth="0.8"
        d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.2c.4 0 .8.16 1.1.44L11.7 6.8c.2.2.5.3.8.3H18a2.5 2.5 0 0 1 2.5 2.5V17A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V7.5Z"
      />
    </svg>
  );
}
