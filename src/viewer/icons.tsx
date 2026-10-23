import React from "react";

export type IconName =
  | "chevronRight"
  | "chevronDown"
  | "arrowUp"
  | "arrowDown"
  | "x"
  | "search"
  | "pause"
  | "play"
  | "refresh"
  | "trash"
  | "download"
  | "external"
  | "copy"
  | "save"
  | "bookmark"
  | "filter"
  | "wrap"
  | "clock"
  | "code"
  | "layers"
  | "toEnd"
  | "plus"
  | "upload"
  | "pin"
  | "history";

const PATHS: Record<IconName, string> = {
  chevronRight: "M9 18l6-6-6-6",
  chevronDown: "M6 9l6 6 6-6",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  arrowDown: "M12 5v14M19 12l-7 7-7-7",
  x: "M18 6L6 18M6 6l12 12",
  search: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.35-4.35",
  pause: "M6 4h4v16H6zM14 4h4v16h-4z",
  play: "M5 3l14 9-14 9z",
  refresh: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  trash: "M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  external: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3",
  copy: "M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8",
  bookmark: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
  filter: "M22 3H2l8 9.46V19l4 2v-8.54z",
  wrap: "M3 6h18M3 12h15a3 3 0 1 1 0 6h-4M3 18h7M16 16l-2 2 2 2",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2",
  code: "M16 18l6-6-6-6M8 6l-6 6 6 6",
  layers: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  toEnd: "M7 13l5 5 5-5M7 6l5 5 5-5",
  plus: "M12 5v14M5 12h14",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  pin: "M12 17v5M9 3h6l-1 7 4 4H6l4-4z",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
};

interface IconProps {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 14 }: IconProps): React.ReactElement {
  return (
    <svg
      className="pl-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
