interface IconProps {
  className?: string;
}

const base = "h-5 w-5";

/** Single stroke-based icon set so nothing has to be fetched at runtime. */
function Svg({ children, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? base}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const PlayIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? base} aria-hidden="true">
    <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11.14-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" />
  </svg>
);

export const PauseIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? base} aria-hidden="true">
    <rect x="6" y="4" width="4" height="16" rx="1.5" />
    <rect x="14" y="4" width="4" height="16" rx="1.5" />
  </svg>
);

export const StarIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? base} aria-hidden="true">
    <path d="m12 2.6 2.9 5.88 6.5.95-4.7 4.58 1.11 6.47L12 17.43l-5.81 3.05 1.11-6.47-4.7-4.58 6.5-.95Z" />
  </svg>
);

export const HeartIcon = ({ className, filled }: IconProps & { filled?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth={1.8}
    className={className ?? base}
    aria-hidden="true"
  >
    <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13Z" />
  </svg>
);

export const BookmarkIcon = ({ className, filled }: IconProps & { filled?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinejoin="round"
    className={className ?? base}
    aria-hidden="true"
  >
    <path d="M6 3.8h12a1 1 0 0 1 1 1v15.4l-7-4-7 4V4.8a1 1 0 0 1 1-1Z" />
  </svg>
);

export const SearchIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);

export const CloseIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const ChevronLeftIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="m14.5 5-7 7 7 7" />
  </Svg>
);

export const ChevronRightIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="m9.5 5 7 7-7 7" />
  </Svg>
);

export const ChevronDownIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="m5 9 7 7 7-7" />
  </Svg>
);

export const DownloadIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 3v12" />
    <path d="m7.5 11 4.5 4.5 4.5-4.5" />
    <path d="M4.5 20.5h15" />
  </Svg>
);

export const GridIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </Svg>
);

export const ListIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 6.5h16M4 12h16M4 17.5h16" />
  </Svg>
);

export const FilterIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Svg>
);

export const VolumeIcon = ({ className, level }: IconProps & { level: "muted" | "low" | "high" }) => (
  <Svg className={className}>
    <path d="M5 9.5h3l4-3.5v12l-4-3.5H5Z" />
    {level === "muted" ? (
      <path d="m16.5 9.5 4 5m0-5-4 5" />
    ) : (
      <>
        <path d="M16 9.8a3.2 3.2 0 0 1 0 4.4" />
        {level === "high" && <path d="M18.6 7.4a6.6 6.6 0 0 1 0 9.2" />}
      </>
    )}
  </Svg>
);

export const FullscreenIcon = ({ className, active }: IconProps & { active?: boolean }) => (
  <Svg className={className}>
    {active ? (
      <>
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      </>
    ) : (
      <>
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      </>
    )}
  </Svg>
);

export const PipIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <rect x="12" y="11" width="7" height="6" rx="1" />
  </Svg>
);

export const SubtitlesIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 14h4M13 14h4" />
  </Svg>
);

export const SettingsIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6" />
  </Svg>
);

export const SkipIcon = ({ className, back }: IconProps & { back?: boolean }) => (
  <Svg className={className}>
    {back ? (
      <>
        <path d="M11 8 5 12l6 4V8Z" />
        <path d="M19 8v8" />
      </>
    ) : (
      <>
        <path d="m13 8 6 4-6 4V8Z" />
        <path d="M5 8v8" />
      </>
    )}
  </Svg>
);

export const RefreshIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M20 12a8 8 0 1 1-2.5-5.8" />
    <path d="M20 4v5h-5" />
  </Svg>
);

export const FilmIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 4v16M17 4v16M3 12h18M3 8h4M3 16h4M17 8h4M17 16h4" />
  </Svg>
);

export const LogoutIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M10 8 6 12l4 4M6 12h10" />
  </Svg>
);
