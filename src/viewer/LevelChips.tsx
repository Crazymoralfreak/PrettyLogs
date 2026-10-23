import React from "react";
import type { LogLevel } from "../common/types";
import { LEVEL_LABELS, LOG_LEVELS } from "../common/types";
import { defaultLevels } from "../core/filter-engine";

interface LevelChipsProps {
  levels: Record<LogLevel, boolean>;
  counts: Record<LogLevel, number>;
  onChange: (levels: Record<LogLevel, boolean>) => void;
}

const WARN_AND_ABOVE: LogLevel[] = ["warn", "error", "fatal"];

function onlyLevels(enabled: LogLevel[]): Record<LogLevel, boolean> {
  const next = defaultLevels();

  for (const level of LOG_LEVELS) {
    next[level] = enabled.includes(level);
  }

  return next;
}

/** Per-level toggles with counters. Double click selects a single level. */
export function LevelChips({ levels, counts, onChange }: LevelChipsProps): React.ReactElement {
  return (
    <div className="pl-chips">
      {LOG_LEVELS.map(level => (
        <button
          key={level}
          type="button"
          className={`pl-chip pl-chip-${level}${levels[level] ? " pl-chip-on" : ""}`}
          title="Клик — включить/выключить, двойной клик — только этот уровень"
          onClick={() => onChange({ ...levels, [level]: !levels[level] })}
          onDoubleClick={() => onChange(onlyLevels([level]))}
        >
          <span className="pl-chip-name">{LEVEL_LABELS[level]}</span>
          <span className="pl-chip-count">{counts[level].toLocaleString()}</span>
        </button>
      ))}
      <button type="button" className="pl-link" onClick={() => onChange(defaultLevels())}>
        Все
      </button>
      <button type="button" className="pl-link" title="Только WARN, ERROR и FATAL" onClick={() => onChange(onlyLevels(WARN_AND_ABOVE))}>
        ≥ WARN
      </button>
    </div>
  );
}
