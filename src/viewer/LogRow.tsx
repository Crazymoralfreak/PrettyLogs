import React, { useMemo } from "react";
import type { LogLine } from "../common/types";
import { LEVEL_LABELS } from "../common/types";
import type { CompiledFilter } from "../core/filter-engine";
import { applyRanges, tokenizeLogLine } from "../core/highlight";
import { detectPayloads } from "../core/pretty-format";
import type { DisplayOptions, SourceLabel } from "./display";
import { formatDateTime, formatTime, withAlpha } from "./display";
import { Icon } from "./icons";
import { PrettyPanel } from "./PrettyPanel";

const MAX_COLLAPSED_LENGTH = 4000;

interface LogRowProps {
  line: LogLine;
  display: DisplayOptions;
  filter: CompiledFilter;
  label: SourceLabel | null;
  expanded: boolean;
  isCurrent: boolean;
  onToggle: (id: number) => void;
  onCopy: (line: LogLine) => void;
}

function LogRowView({ line, display, filter, label, expanded, isCurrent, onToggle, onCopy }: LogRowProps): React.ReactElement {
  const payloads = useMemo(() => detectPayloads(line.text), [line.text]);
  const truncated = !expanded && line.text.length > MAX_COLLAPSED_LENGTH;
  const text = truncated ? line.text.slice(0, MAX_COLLAPSED_LENGTH) : line.text;
  const expandable = payloads.length > 0 || line.text.length > MAX_COLLAPSED_LENGTH;
  const showPretty = (expanded || display.prettyAll) && payloads.length > 0;

  const segments = useMemo(
    () => applyRanges(tokenizeLogLine(text), filter.ranges(text, isCurrent)),
    [text, filter, isCurrent],
  );

  return (
    <div className="pl-item">
      <div className={`pl-row pl-level-${line.level}${isCurrent ? " pl-row-current" : ""}${display.wrap ? " pl-wrap" : ""}`}>
        <button
          type="button"
          className={`pl-row-toggle${expandable ? "" : " pl-row-toggle-empty"}`}
          tabIndex={-1}
          title={expandable ? (expanded ? "Свернуть" : "Развернуть и показать pretty-вид") : undefined}
          onClick={expandable ? () => onToggle(line.id) : undefined}
        >
          {expandable ? <Icon name={expanded || showPretty ? "chevronDown" : "chevronRight"} size={12} /> : null}
        </button>
        {display.showTime ? (
          <span className="pl-time" title={formatDateTime(line.ts, display.utc)}>
            {formatTime(line.ts, display.utc)}
          </span>
        ) : null}
        <span className={`pl-level-tag pl-level-tag-${line.level}`}>{LEVEL_LABELS[line.level]}</span>
        {label ? (
          <span className={`pl-src pl-src-${label.colorIdx}`} title={label.title}>
            {label.text}
          </span>
        ) : null}
        <span className="pl-msg">
          {segments.map((segment, i) => {
            const mark = segment.mark;
            const style = mark?.color ? { backgroundColor: withAlpha(mark.color, 0.4) } : undefined;
            const markClass = mark ? (mark.kind === "search" ? (mark.current ? " pl-mark-current" : " pl-mark") : " pl-mark-rule") : "";

            return (
              <span key={i} className={`${segment.cls ?? ""}${markClass}`} style={style}>
                {segment.text}
              </span>
            );
          })}
          {truncated ? (
            <button type="button" className="pl-link" onClick={() => onToggle(line.id)}>
              … показать полностью ({line.text.length.toLocaleString()} симв.)
            </button>
          ) : null}
        </span>
        <span className="pl-row-tail">
          {payloads.map(payload => (
            <span key={`${payload.kind}-${payload.start}`} className="pl-badge">
              {payload.label}
            </span>
          ))}
          <button type="button" className="pl-icon-btn pl-row-copy" tabIndex={-1} title="Копировать строку" onClick={() => onCopy(line)}>
            <Icon name="copy" size={12} />
          </button>
        </span>
      </div>
      {showPretty ? <PrettyPanel payloads={payloads} /> : null}
    </div>
  );
}

export const LogRow = React.memo(LogRowView);
