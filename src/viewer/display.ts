import type { LogLine, SourceInfo } from "../common/types";

export interface DisplayOptions {
  wrap: boolean;
  utc: boolean;
  showTime: boolean;
  prettyAll: boolean;
  follow: boolean;
}

export const DEFAULT_DISPLAY: DisplayOptions = {
  wrap: true,
  utc: false,
  showTime: true,
  prettyAll: false,
  follow: true,
};

export const SOURCE_COLOR_COUNT = 10;

export interface SourceLabel {
  text: string;
  colorIdx: number;
  title: string;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

export function formatTime(ts: number | null, utc: boolean): string {
  if (ts === null) {
    return "";
  }

  const date = new Date(ts);
  const hours = utc ? date.getUTCHours() : date.getHours();
  const minutes = utc ? date.getUTCMinutes() : date.getMinutes();
  const seconds = utc ? date.getUTCSeconds() : date.getSeconds();
  const millis = utc ? date.getUTCMilliseconds() : date.getMilliseconds();

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

export function formatDateTime(ts: number | null, utc: boolean): string {
  if (ts === null) {
    return "";
  }

  const date = new Date(ts);

  return utc
    ? `${date.toISOString().replace("T", " ").replace("Z", "")} UTC`
    : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${formatTime(ts, false)}`;
}

function commonPrefixLength(names: string[]): number {
  if (names.length < 2) {
    return 0;
  }

  let prefix = names[0];

  for (const name of names) {
    while (!name.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }

  const boundary = prefix.lastIndexOf("-");

  return boundary === -1 ? 0 : boundary + 1;
}

/** Short labels for log sources: common pod name prefix is trimmed, container is added when needed. */
export function buildSourceLabels(sources: SourceInfo[]): Map<string, SourceLabel> {
  const pods = [...new Set(sources.map(source => source.pod))];
  const trim = commonPrefixLength(pods);
  const containersByPod = new Map<string, number>();

  for (const source of sources) {
    containersByPod.set(source.pod, (containersByPod.get(source.pod) ?? 0) + 1);
  }

  const labels = new Map<string, SourceLabel>();

  for (const source of sources) {
    const podText = source.pod.slice(trim) || source.pod;
    const multiContainer = (containersByPod.get(source.pod) ?? 0) > 1;

    labels.set(source.key, {
      text: multiContainer ? `${podText}/${source.container}` : podText,
      colorIdx: source.colorIdx % SOURCE_COLOR_COUNT,
      title: `${source.pod} / ${source.container}`,
    });
  }

  return labels;
}

export function lineToPlainText(line: LogLine, labels: Map<string, SourceLabel>): string {
  const time = line.ts === null ? "" : `${new Date(line.ts).toISOString()} `;
  const source = labels.get(line.source)?.title;

  return `${time}${source ? `[${source}] ` : ""}${line.text}`;
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");

    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    document.body.removeChild(area);
  }
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Converts `#rrggbb` to `rgba(...)`; other color formats are returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);

  if (!match) {
    return color;
  }

  const value = parseInt(match[1], 16);

  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** True when a CSS color string (`rgb(...)`/`rgba(...)`) is bright. */
export function isLightColor(color: string): boolean {
  const match = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(color);

  if (!match) {
    return false;
  }

  const luminance = 0.2126 * Number(match[1]) + 0.7152 * Number(match[2]) + 0.0722 * Number(match[3]);

  return luminance > 150;
}
