type IconProps = {
  className?: string;
  title?: string;
};

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export function UndoIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
  );
}

export function RedoIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </svg>
  );
}

export function HistoryIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

export function SiblingIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <circle cx="7.5" cy="12" r="3.5" />
      <path d="M17.5 8.5v7M14 12h7" />
    </svg>
  );
}

export function ChildIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="6" r="3" />
      <path d="M12 9v3" />
      <path d="M12 14v6.5M8.75 17.25h6.5" />
    </svg>
  );
}

export function FloatIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="12" r="7.5" strokeDasharray="3.5 3" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  );
}

export function LinkIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function CollapseAllIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M3 12h6m0 0L6.5 9.5M9 12l-2.5 2.5" />
      <path d="M21 12h-6m0 0 2.5-2.5M15 12l2.5 2.5" />
    </svg>
  );
}

export function ExpandAllIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M9 12H3m0 0 2.5-2.5M3 12l2.5 2.5" />
      <path d="M15 12h6m0 0-2.5-2.5M21 12l-2.5 2.5" />
    </svg>
  );
}

export function FocusIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </svg>
  );
}

export function SnapIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M5 4h4v7a3 3 0 0 0 6 0V4h4v7a7 7 0 0 1-14 0V4Z" />
      <path d="M5 8h4M15 8h4" />
    </svg>
  );
}

export function GridIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 10h17M3.5 14.5h17M12 5v14" />
    </svg>
  );
}

export function OverviewIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <rect x="13.5" y="12.5" width="5" height="4.5" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ZoomInIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16.5 16.5 4 4" />
      <path d="M11 8.5v5M8.5 11h5" />
    </svg>
  );
}

export function ZoomOutIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16.5 16.5 4 4" />
      <path d="M8.5 11h5" />
    </svg>
  );
}

export function MoreIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
