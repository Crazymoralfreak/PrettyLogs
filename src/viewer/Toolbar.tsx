import React from "react";
import type { SessionControl, SessionMeta, SourceInfo } from "../common/types";
import type { DisplayOptions } from "./display";
import type { IconName } from "./icons";
import { Icon } from "./icons";
import { Popover } from "./Popover";

interface RangeOption {
  value: string;
  label: string;
  tailLines: number | null;
  sinceSeconds: number | null;
}

const RANGE_OPTIONS: RangeOption[] = [
  { value: "tail:100", label: "Последние 100", tailLines: 100, sinceSeconds: null },
  { value: "tail:500", label: "Последние 500", tailLines: 500, sinceSeconds: null },
  { value: "tail:1000", label: "Последние 1000", tailLines: 1000, sinceSeconds: null },
  { value: "tail:5000", label: "Последние 5000", tailLines: 5000, sinceSeconds: null },
  { value: "tail:all", label: "Все строки", tailLines: null, sinceSeconds: null },
  { value: "since:300", label: "За 5 минут", tailLines: null, sinceSeconds: 300 },
  { value: "since:900", label: "За 15 минут", tailLines: null, sinceSeconds: 900 },
  { value: "since:3600", label: "За 1 час", tailLines: null, sinceSeconds: 3600 },
  { value: "since:21600", label: "За 6 часов", tailLines: null, sinceSeconds: 21600 },
  { value: "since:86400", label: "За 24 часа", tailLines: null, sinceSeconds: 86400 },
];

const CUSTOM_RANGE = "custom";

function rangeValue(meta: SessionMeta): string {
  const found = RANGE_OPTIONS.find(option => option.tailLines === meta.tailLines && option.sinceSeconds === meta.sinceSeconds);

  return found?.value ?? CUSTOM_RANGE;
}

interface IconButtonProps {
  icon: IconName;
  title: string;
  active?: boolean;
  disabled?: boolean;
  label?: string;
  onClick: () => void;
}

function IconButton({ icon, title, active = false, disabled = false, label, onClick }: IconButtonProps): React.ReactElement {
  return (
    <button type="button" className={`pl-btn${active ? " pl-btn-on" : ""}`} title={title} disabled={disabled} onClick={onClick}>
      <Icon name={icon} size={14} />
      {label ? <span>{label}</span> : null}
    </button>
  );
}

interface SourcePickerProps {
  sources: SourceInfo[];
  onControl: (control: SessionControl) => void;
}

function groupByPod(sources: SourceInfo[]): Array<[string, SourceInfo[]]> {
  const groups = new Map<string, SourceInfo[]>();

  for (const source of sources) {
    groups.set(source.pod, [...(groups.get(source.pod) ?? []), source]);
  }

  return [...groups.entries()];
}

function SourcePicker({ sources, onControl }: SourcePickerProps): React.ReactElement {
  const enabled = sources.filter(source => source.enabled).length;

  return (
    <Popover
      panelClassName="pl-sources"
      trigger={({ open, toggle }) => (
        <button type="button" className={`pl-btn${open ? " pl-btn-on" : ""}`} title="Выбор подов и контейнеров" onClick={toggle}>
          <Icon name="layers" size={14} />
          <span>
            Источники {enabled}/{sources.length}
          </span>
          <Icon name="chevronDown" size={12} />
        </button>
      )}
    >
      {() => (
        <>
          <div className="pl-panel-title">
            Поды и контейнеры
            <span className="pl-spacer" />
            <button type="button" className="pl-link" onClick={() => onControl({ type: "setAllSources", enabled: true })}>
              Все
            </button>
            <button type="button" className="pl-link" onClick={() => onControl({ type: "setAllSources", enabled: false })}>
              Ничего
            </button>
          </div>
          <div className="pl-source-list">
            {sources.length === 0 ? <div className="pl-muted">Поды ещё не найдены</div> : null}
            {groupByPod(sources).map(([pod, items]) => (
              <div key={pod} className="pl-source-group">
                <div className="pl-source-pod" title={pod}>
                  {pod}
                  {items[0].podPhase ? <span className="pl-badge">{items[0].podPhase}</span> : null}
                </div>
                {items.map(source => (
                  <label key={source.key} className="pl-source-item">
                    <input type="checkbox" checked={source.enabled} onChange={event => onControl({ type: "toggleSource", key: source.key, enabled: event.target.checked })} />
                    <span className={`pl-src-dot pl-src-bg-${source.colorIdx % 10}`} />
                    <span>{source.container}</span>
                    {source.isInit ? <span className="pl-badge">init</span> : null}
                    {source.error ? (
                      <span className="pl-error-text" title={source.error}>
                        {source.error}
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </Popover>
  );
}

interface ToolbarProps {
  meta: SessionMeta;
  display: DisplayOptions;
  canPopout: boolean;
  pinned: boolean | null;
  hasLines: boolean;
  onControl: (control: SessionControl) => void;
  onDisplay: (patch: Partial<DisplayOptions>) => void;
  onDownload: () => void;
  onPin: () => void;
}

export function Toolbar({ meta, display, canPopout, pinned, hasLines, onControl, onDisplay, onDownload, onPin }: ToolbarProps): React.ReactElement {
  const range = rangeValue(meta);

  return (
    <div className="pl-toolbar">
      <SourcePicker sources={meta.sources} onControl={onControl} />
      <IconButton
        icon="history"
        title="Показать логи предыдущего (упавшего) контейнера"
        active={meta.previous}
        label="Предыдущий"
        onClick={() => onControl({ type: "setPrevious", previous: !meta.previous })}
      />
      <select
        className="pl-select"
        value={range}
        title="Сколько логов загружать"
        onChange={event => {
          const option = RANGE_OPTIONS.find(item => item.value === event.target.value);

          if (option) {
            onControl({ type: "setRange", tailLines: option.tailLines, sinceSeconds: option.sinceSeconds });
          }
        }}
      >
        {range === CUSTOM_RANGE ? <option value={CUSTOM_RANGE}>Свой диапазон</option> : null}
        {RANGE_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pl-sep" />
      <IconButton
        icon={meta.paused ? "play" : "pause"}
        title={meta.paused ? "Продолжить получение логов" : "Приостановить получение логов"}
        active={meta.paused}
        label={meta.paused ? "Продолжить" : "Пауза"}
        onClick={() => onControl({ type: "setPaused", paused: !meta.paused })}
      />
      <IconButton icon="refresh" title="Загрузить логи заново" onClick={() => onControl({ type: "reload" })} />
      <IconButton icon="trash" title="Очистить окно (новые строки продолжат поступать)" onClick={() => onControl({ type: "clear" })} />
      <IconButton icon="download" title="Скачать отфильтрованные логи" disabled={!hasLines} onClick={onDownload} />
      <span className="pl-spacer" />
      <IconButton icon="toEnd" title="Автопрокрутка к новым строкам" active={display.follow} onClick={() => onDisplay({ follow: !display.follow })} />
      <IconButton icon="wrap" title="Перенос длинных строк" active={display.wrap} onClick={() => onDisplay({ wrap: !display.wrap })} />
      <IconButton icon="clock" title="Показывать время" active={display.showTime} onClick={() => onDisplay({ showTime: !display.showTime })} />
      <button
        type="button"
        className={`pl-btn${display.utc ? " pl-btn-on" : ""}`}
        title="Время в UTC или локальное"
        disabled={!display.showTime}
        onClick={() => onDisplay({ utc: !display.utc })}
      >
        {display.utc ? "UTC" : "Local"}
      </button>
      <IconButton icon="code" title="Pretty-вид JSON / XML / YAML для всех строк" active={display.prettyAll} label="Pretty" onClick={() => onDisplay({ prettyAll: !display.prettyAll })} />
      {pinned !== null ? <IconButton icon="pin" title="Поверх всех окон" active={pinned} onClick={onPin} /> : null}
      {canPopout ? <IconButton icon="external" title="Вынести в отдельное окно (обновляется в реальном времени)" label="В окно" onClick={() => onControl({ type: "openPopout" })} /> : null}
    </div>
  );
}
