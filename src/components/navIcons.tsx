type IconProps = {
  className?: string;
  title?: string;
};

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export function JournalIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </svg>
  );
}

export function LibraryIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M4 19V5a1 1 0 0 1 1-1h3v16H5a1 1 0 0 1-1-1Z" />
      <path d="M10 4h4v16h-4z" />
      <path d="M16 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3V4Z" />
    </svg>
  );
}

export function TagsIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M20.6 13.4 12 22l-8.6-8.6a2 2 0 0 1 0-2.8L10.6 3.4a2 2 0 0 1 1.4-.6H19a2 2 0 0 1 2 2v6.6a2 2 0 0 1-.4 1.4Z" />
      <circle cx="16.5" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MapIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <circle cx="6" cy="12" r="2.25" />
      <circle cx="18" cy="7" r="2.25" />
      <circle cx="18" cy="17" r="2.25" />
      <path d="M8.2 11.2 15.8 8M8.2 12.8 15.8 16" />
    </svg>
  );
}

export function NoteIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M7 3.5h7.5L19 8v12.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
      <path d="M14.5 3.5V8H19M9 12h6M9 15.5h4" />
    </svg>
  );
}

export function FolderIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4.2l1.8 2H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5A1.5 1.5 0 0 1 3.5 17.5v-10Z" />
    </svg>
  );
}

export function CollapseIcon({ className, title }: IconProps) {
  return (
    <svg {...base} className={className} width={16} height={16}>
      {title ? <title>{title}</title> : null}
      <path d="M14 6 10 12l4 6M8 6 4 12l4 6" />
    </svg>
  );
}
