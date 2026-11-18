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
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-transform duration-200 hover:scale-[1.03]"
          style={{
            background: 'var(--chrome-badge)',
            color: 'var(--chrome-badge-text)',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.14)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4.5 7.2C4.5 6.09543 5.39543 5.2 6.5 5.2H11.6C12.35 5.2 13.03 5.62 13.36 6.29L15.4 10.4L19.5 16.8C19.5 17.9 18.6 18.8 17.5 18.8H12.4C11.65 18.8 10.97 18.38 10.64 17.71L8.6 13.6L4.5 7.2Z"
              fill="currentColor"
            />
            <path
              d="M14.2 5.2H17.8C18.9 5.2 19.6 6.38 19.04 7.33L16.3 11.95L13.1 6.7C12.82 6.05 13.48 5.2 14.2 5.2Z"
              fill="currentColor"
              fillOpacity="0.68"
            />
          </svg>
        </span>
      )}
      <span className="flex flex-col leading-none">
        <span className="text-[16px] font-semibold tracking-tight text-[var(--text)]">
          Uz<span className="text-[var(--accent)]">Bite</span>
        </span>
        {subtitle && (
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
