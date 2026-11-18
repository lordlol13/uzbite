export function Wordmark({
  withIcon = false,
  subtitle,
}: {
  withIcon?: boolean;
  subtitle?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      {withIcon && (
        <svg width="34" height="34" viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <rect width="36" height="36" rx="10" fill="#f8781d" />
          <path
            d="M10 18.5h16M11 18.5a7 7 0 0 0 14 0M11.5 16.5a6.5 6.5 0 0 1 13 0M16 9.5h4M13.5 27h9"
            stroke="#fff"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span className="flex flex-col leading-none">
        <span className="text-lg font-extrabold tracking-tight text-[var(--text)]">
          Uz<span className="text-[#f8781d]">Bite</span>
        </span>
        {subtitle && (
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
