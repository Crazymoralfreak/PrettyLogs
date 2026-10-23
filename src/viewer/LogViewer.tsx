import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import { Virtuoso } from "react-virtuoso";
import type { FilterPreset, FilterState, LogLevel, LogLine, SourceInfo } from "../common/types";
import { LOG_LEVELS } from "../common/types";
import { compileFilter, defaultFilterState, isDefaultFilter, sanitizeFilterState } from "../core/filter-engine";
import type { DisplayOptions } from "./display";
import { buildSourceLabels, copyText, DEFAULT_DISPLAY, downloadText, isLightColor, lineToPlainText } from "./display";
import type { LogFeed } from "./feed";
import { FilterRulesPanel } from "./FilterRulesPanel";
import { Icon } from "./icons";
import { LevelChips } from "./LevelChips";
import { LogRow } from "./LogRow";
import { PresetsMenu } from "./PresetsMenu";
import { SearchBar } from "./SearchBar";
import { Toolbar } from "./Toolbar";
import { useFeed } from "./use-feed";

const NO_SOURCES: SourceInfo[] = [];
const STALE_CHECK_MS = 2000;

interface LogViewerProps {
  feed: LogFeed;
}

function emptyCounts(): Record<LogLevel, number> {
  return Object.fromEntries(LOG_LEVELS.map(level => [level, 0])) as Record<LogLevel, number>;
}

/** The complete log viewer. It only depends on a {@link LogFeed}, so it works in Lens and in a pop-out window. */
export function LogViewer({ feed }: LogViewerProps): React.ReactElement {
  const { meta, lines, presets, lastEventAt } = useFeed(feed);
  const [filter, setFilter] = useState<FilterState>(defaultFilterState);
  const [display, setDisplay] = useState<DisplayOptions>(DEFAULT_DISPLAY);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [showRules, setShowRules] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [currentMatch, setCurrentMatch] = useState(-1);
  const [atBottom, setAtBottom] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [stale, setStale] = useState(false);
  const [light, setLight] = useState(false);
  const virtuoso = useRef<VirtuosoHandle>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastEventRef = useRef(lastEventAt);
  const pollIntervalRef = useRef(0);

  lastEventRef.current = lastEventAt;
  pollIntervalRef.current = meta?.pollIntervalMs ?? 0;

  const sources = meta?.sources ?? NO_SOURCES;
  const disabledKeys = useMemo(() => new Set(sources.filter(source => !source.enabled).map(source => source.key)), [sources]);
  const enabledCount = sources.length - disabledKeys.size;
  const labels = useMemo(() => buildSourceLabels(sources), [sources]);
  const sourceLines = useMemo(
    () => (disabledKeys.size === 0 ? lines : lines.filter(line => !disabledKeys.has(line.source))),
    [lines, disabledKeys],
  );
  const counts = useMemo(() => {
    const result = emptyCounts();

    for (const line of sourceLines) {
      result[line.level]++;
    }

    return result;
  }, [sourceLines]);
  const compiled = useMemo(() => compileFilter(filter), [filter]);
  const visible = useMemo(() => sourceLines.filter(compiled.accepts), [sourceLines, compiled]);
  const matchIndices = useMemo(() => {
    const result: number[] = [];

    if (!compiled.hasSearch || filter.search.invert) {
      return result;
    }

    visible.forEach((line, index) => {
      if (compiled.matchesSearch(line.text)) {
        result.push(index);
      }
    });

    return result;
  }, [visible, compiled, filter.search.invert]);
  const currentVisibleIndex = currentMatch >= 0 && currentMatch < matchIndices.length ? matchIndices[currentMatch] : -1;
  const activePreset = presets.find(preset => preset.id === activePresetId) ?? null;
  const activeRules = filter.rules.filter(rule => rule.enabled && rule.pattern).length;

  useEffect(() => {
    if (rootRef.current) {
      setLight(isLightColor(getComputedStyle(rootRef.current).backgroundColor));
    }
  }, []);

  useEffect(() => {
    setCurrentMatch(-1);
  }, [filter.search.query, filter.search.isRegex, filter.search.caseSensitive, filter.search.invert, filter.search.mode]);

  useEffect(() => {
    if (display.follow) {
      virtuoso.current?.scrollToIndex({ index: "LAST", align: "end", behavior: "auto" });
    }
  }, [display.follow]);

  useEffect(() => {
    const limit = feed.staleAfterMs;

    if (limit === undefined) {
      return undefined;
    }

    const timer = setInterval(() => setStale(Date.now() - lastEventRef.current > Math.max(limit, pollIntervalRef.current * 3)), STALE_CHECK_MS);

    return () => clearInterval(timer);
  }, [feed]);

  const patchDisplay = useCallback((patch: Partial<DisplayOptions>) => setDisplay(previous => ({ ...previous, ...patch })), []);

  const toggleExpanded = useCallback((id: number) => {
    setExpanded(previous => {
      const next = new Set(previous);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  const copyLine = useCallback((line: LogLine) => void copyText(lineToPlainText(line, labels)), [labels]);

  const goToMatch = (target: number): void => {
    const total = matchIndices.length;

    if (total === 0) {
      return;
    }

    const index = ((target % total) + total) % total;

    setCurrentMatch(index);
    patchDisplay({ follow: false });
    virtuoso.current?.scrollToIndex({ index: matchIndices[index], align: "center", behavior: "auto" });
  };

  const applyPreset = (preset: FilterPreset): void => {
    setFilter(sanitizeFilterState(preset.filter));
    setActivePresetId(preset.id);
  };

  const persistPresets = (next: FilterPreset[]): void => feed.send({ type: "savePresets", presets: next });

  const download = (): void => {
    const name = (meta?.title ?? "logs").replace(/[^\w.-]+/g, "_");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    downloadText(`${name}-${stamp}.log`, visible.map(line => lineToPlainText(line, labels)).join("\n"));
  };

  const scrollToEnd = (): void => {
    patchDisplay({ follow: true });
    virtuoso.current?.scrollToIndex({ index: "LAST", align: "end", behavior: "auto" });
  };

  const togglePin = (): void => {
    const next = !pinned;

    setPinned(next);
    feed.setWindowPinned?.(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      searchInput.current?.focus();
      searchInput.current?.select();
    } else if (event.key === "F3") {
      event.preventDefault();
      goToMatch(event.shiftKey ? currentMatch - 1 : currentMatch + 1);
    }
  };

  const renderRow = useCallback(
    (index: number, line: LogLine) => (
      <LogRow
        line={line}
        display={display}
        filter={compiled}
        label={enabledCount > 1 ? labels.get(line.source) ?? null : null}
        expanded={expanded.has(line.id)}
        isCurrent={index === currentVisibleIndex}
        onToggle={toggleExpanded}
        onCopy={copyLine}
      />
    ),
    [display, compiled, enabledCount, labels, expanded, currentVisibleIndex, toggleExpanded, copyLine],
  );

  const emptyMessage = !meta || meta.loading ? "Загрузка логов…" : lines.length === 0 ? "Логов пока нет" : "Нет строк, подходящих под фильтры";

  return (
    <div className={`pl-root${light ? " pl-light" : ""}`} ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown}>
      {meta ? (
        <Toolbar
          meta={meta}
          display={display}
          canPopout={feed.canPopout}
          pinned={feed.setWindowPinned ? pinned : null}
          hasLines={visible.length > 0}
          onControl={control => feed.send(control)}
          onDisplay={patchDisplay}
          onDownload={download}
          onPin={togglePin}
        />
      ) : null}
      <div className="pl-filters">
        <LevelChips levels={filter.levels} counts={counts} onChange={levels => setFilter({ ...filter, levels })} />
        <div className="pl-filters-row">
          <SearchBar
            search={filter.search}
            error={compiled.searchError}
            matchCount={matchIndices.length}
            currentMatch={currentMatch}
            inputRef={searchInput}
            onChange={search => setFilter(previous => ({ ...previous, search }))}
            onNext={() => goToMatch(currentMatch + 1)}
            onPrevious={() => goToMatch(currentMatch < 0 ? -1 : currentMatch - 1)}
          />
          <button type="button" className={`pl-btn${showRules || activeRules > 0 ? " pl-btn-on" : ""}`} title="Несколько правил фильтрации" onClick={() => setShowRules(value => !value)}>
            <Icon name="filter" size={13} />
            Правила{filter.rules.length > 0 ? ` (${activeRules}/${filter.rules.length})` : ""}
          </button>
          <PresetsMenu
            presets={presets}
            current={filter}
            activeId={activePreset?.id ?? null}
            onApply={applyPreset}
            onActiveChange={setActivePresetId}
            onPersist={persistPresets}
          />
          {!isDefaultFilter(filter) || filter.rules.length > 0 ? (
            <button
              type="button"
              className="pl-link"
              onClick={() => {
                setFilter(defaultFilterState());
                setActivePresetId(null);
              }}
            >
              Сбросить
            </button>
          ) : null}
        </div>
        {showRules ? <FilterRulesPanel rules={filter.rules} errors={compiled.ruleErrors} onChange={rules => setFilter(previous => ({ ...previous, rules }))} /> : null}
      </div>
      {stale ? <div className="pl-banner pl-banner-warn">Нет связи с кластером: окно с логами не получает обновлений. Откройте кластер в Lens и переподключитесь.</div> : null}
      {meta?.error ? <div className="pl-banner pl-banner-error">{meta.error}</div> : null}
      <div className="pl-list">
        <Virtuoso
          ref={virtuoso}
          className="pl-virtuoso"
          style={{ height: "100%" }}
          data={visible}
          computeItemKey={(_, line) => line.id}
          itemContent={renderRow}
          followOutput={isAtBottom => (display.follow && isAtBottom ? "auto" : false)}
          atBottomStateChange={setAtBottom}
          atBottomThreshold={40}
          initialTopMostItemIndex={{ index: "LAST", align: "end" }}
          increaseViewportBy={{ top: 400, bottom: 400 }}
        />
        {visible.length === 0 ? <div className="pl-empty">{emptyMessage}</div> : null}
        {!atBottom && visible.length > 0 ? (
          <button type="button" className="pl-to-end" onClick={scrollToEnd}>
            <Icon name="arrowDown" size={13} /> К концу
          </button>
        ) : null}
      </div>
      <div className="pl-status">
        <span>
          {visible.length.toLocaleString()} из {sourceLines.length.toLocaleString()} строк
        </span>
        {meta ? (
          <>
            <span>
              {enabledCount} из {sources.length} источн.
            </span>
            <span className={`pl-live${meta.paused ? " pl-live-paused" : meta.previous ? " pl-live-off" : ""}`}>
              {meta.paused ? "Пауза" : meta.previous ? "Предыдущий контейнер" : meta.loading ? "Загрузка…" : "Live"}
            </span>
            {meta.previous || meta.paused ? null : <span className="pl-muted">обновление раз в {(meta.pollIntervalMs / 1000).toFixed(1)} с</span>}
          </>
        ) : null}
        <span className="pl-spacer" />
        <span className="pl-muted">{meta ? `${meta.title} · ${meta.namespace}` : ""}</span>
      </div>
    </div>
  );
}
