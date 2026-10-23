import { observer } from "mobx-react";
import React from "react";
import type { Settings } from "../../common/types";
import { getRuntime } from "../runtime";

interface NumberFieldProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function NumberField({ label, hint, value, min, max, step, onChange }: NumberFieldProps): React.ReactElement {
  return (
    <>
      <label title={hint}>{label}</label>
      <div>
        <input
          type="number"
          className="pl-input"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={event => {
            const next = Number(event.target.value);

            if (Number.isFinite(next)) {
              onChange(next);
            }
          }}
        />
        <div className="pl-muted">{hint}</div>
      </div>
    </>
  );
}

export function PrettyLogsHint(): React.ReactElement {
  return <span>Настройки просмотрщика логов Pretty Logs. Применяются к новым запросам логов сразу.</span>;
}

export const PrettyLogsSettings = observer(function PrettyLogsSettings(): React.ReactElement {
  const { store } = getRuntime();
  const { settings } = store;
  const update = (patch: Partial<Settings>): void => store.updateSettings(patch);

  return (
    <div className="pl-prefs">
      <NumberField
        label="Интервал обновления, мс"
        hint="Как часто опрашивать Kubernetes API (500 — 60000)"
        value={settings.pollIntervalMs}
        min={500}
        max={60000}
        step={100}
        onChange={value => update({ pollIntervalMs: value })}
      />
      <NumberField
        label="Строк при открытии"
        hint="Сколько последних строк загружать по умолчанию, 0 — все"
        value={settings.defaultTailLines}
        min={0}
        max={1000000}
        step={100}
        onChange={value => update({ defaultTailLines: value })}
      />
      <NumberField
        label="Размер буфера, строк"
        hint="Максимум строк в окне просмотра, старые вытесняются"
        value={settings.maxBufferLines}
        min={1000}
        max={1000000}
        step={1000}
        onChange={value => update({ maxBufferLines: value })}
      />
      <label>Склеивать стектрейсы</label>
      <div>
        <input type="checkbox" checked={settings.mergeMultiline} onChange={event => update({ mergeMultiline: event.target.checked })} />
        <span className="pl-muted"> Многострочные записи (stack trace, pretty-printed JSON) показываются одной строкой лога</span>
      </div>
    </div>
  );
});
