import React, { useState } from "react";
import type { FilterPreset, FilterState } from "../common/types";
import { sanitizeFilterState } from "../core/filter-engine";
import { copyText } from "./display";
import { Icon } from "./icons";
import { Popover } from "./Popover";

interface PresetsMenuProps {
  presets: FilterPreset[];
  current: FilterState;
  activeId: string | null;
  onApply: (preset: FilterPreset) => void;
  onActiveChange: (id: string | null) => void;
  /** Persists the new list of presets. */
  onPersist: (presets: FilterPreset[]) => void;
}

type Mode = "list" | "import" | "export";

function newId(): string {
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Accepts a preset list, `{ presets: [...] }`, a single preset or a bare filter state. */
export function parseImportedPresets(text: string): FilterPreset[] {
  const data: unknown = JSON.parse(text);
  const container = typeof data === "object" && data !== null && "presets" in data ? (data as { presets: unknown }).presets : data;
  const items: unknown[] = Array.isArray(container) ? container : [container];

  return items.flatMap((item, index) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const raw = item as Partial<FilterPreset>;
    const filter = sanitizeFilterState("filter" in raw ? raw.filter : item);

    return [
      {
        id: typeof raw.id === "string" ? raw.id : newId(),
        name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : `Импорт ${index + 1}`,
        filter,
        updatedAt: Date.now(),
      },
    ];
  });
}

/** Merges imported presets into the existing list; presets with the same id or name are replaced. */
export function mergePresets(existing: FilterPreset[], incoming: FilterPreset[]): FilterPreset[] {
  const result = existing.filter(item => !incoming.some(next => next.id === item.id || next.name === item.name));

  return [...result, ...incoming];
}

export function PresetsMenu({ presets, current, activeId, onApply, onActiveChange, onPersist }: PresetsMenuProps): React.ReactElement {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("list");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const active = presets.find(preset => preset.id === activeId) ?? null;

  const saveAs = (): void => {
    const trimmed = name.trim();

    if (!trimmed) {
      return;
    }

    const existing = presets.find(preset => preset.name === trimmed);
    const preset: FilterPreset = { id: existing?.id ?? newId(), name: trimmed, filter: current, updatedAt: Date.now() };

    onPersist(existing ? presets.map(item => (item.id === existing.id ? preset : item)) : [...presets, preset]);
    onActiveChange(preset.id);
    setName("");
  };

  const overwrite = (preset: FilterPreset): void => {
    onPersist(presets.map(item => (item.id === preset.id ? { ...item, filter: current, updatedAt: Date.now() } : item)));
    onActiveChange(preset.id);
  };

  const remove = (preset: FilterPreset): void => {
    onPersist(presets.filter(item => item.id !== preset.id));

    if (activeId === preset.id) {
      onActiveChange(null);
    }
  };

  const runImport = (): void => {
    try {
      const imported = parseImportedPresets(importText);

      if (imported.length === 0) {
        setImportError("В тексте не найдено ни одного набора фильтров");

        return;
      }

      onPersist(mergePresets(presets, imported));
      setImportText("");
      setImportError(null);
      setMode("list");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Popover
      align="right"
      panelClassName="pl-presets"
      trigger={({ open, toggle }) => (
        <button type="button" className={`pl-btn${open ? " pl-btn-on" : ""}`} title="Сохранённые наборы фильтров" onClick={toggle}>
          <Icon name="bookmark" size={13} />
          {active ? active.name : "Наборы фильтров"}
          <Icon name="chevronDown" size={12} />
        </button>
      )}
    >
      {close =>
        mode === "list" ? (
          <>
            <div className="pl-panel-title">Наборы фильтров ({presets.length})</div>
            <div className="pl-preset-list">
              {presets.length === 0 ? <div className="pl-muted">Пока пусто. Настройте уровни, поиск и правила, затем сохраните набор.</div> : null}
              {presets.map(preset => (
                <div key={preset.id} className={`pl-preset${preset.id === activeId ? " pl-preset-active" : ""}`}>
                  <button
                    type="button"
                    className="pl-preset-name"
                    title="Применить набор"
                    onClick={() => {
                      onApply(preset);
                      close();
                    }}
                  >
                    {preset.name}
                  </button>
                  <button type="button" className="pl-icon-btn" title="Перезаписать текущими фильтрами" onClick={() => overwrite(preset)}>
                    <Icon name="save" size={13} />
                  </button>
                  <button type="button" className="pl-icon-btn" title="Удалить" onClick={() => remove(preset)}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="pl-preset-save">
              <input
                className="pl-input"
                value={name}
                placeholder="Название нового набора"
                onChange={event => setName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    saveAs();
                  }
                }}
              />
              <button type="button" className="pl-btn pl-btn-primary" disabled={!name.trim()} onClick={saveAs}>
                Сохранить текущие
              </button>
            </div>
            <div className="pl-preset-footer">
              <button type="button" className="pl-link" onClick={() => setMode("import")}>
                <Icon name="upload" size={12} /> Импорт JSON
              </button>
              <button type="button" className="pl-link" disabled={presets.length === 0} onClick={() => setMode("export")}>
                <Icon name="download" size={12} /> Экспорт JSON
              </button>
            </div>
          </>
        ) : mode === "import" ? (
          <>
            <div className="pl-panel-title">Импорт наборов</div>
            <textarea
              className="pl-textarea"
              value={importText}
              placeholder="Вставьте JSON с наборами фильтров"
              spellCheck={false}
              onChange={event => setImportText(event.target.value)}
            />
            {importError ? <div className="pl-error-text">{importError}</div> : null}
            <div className="pl-preset-footer">
              <button type="button" className="pl-btn pl-btn-primary" disabled={!importText.trim()} onClick={runImport}>
                Импортировать
              </button>
              <button type="button" className="pl-btn" onClick={() => setMode("list")}>
                Назад
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="pl-panel-title">Экспорт наборов</div>
            <textarea className="pl-textarea" readOnly value={JSON.stringify(presets, null, 2)} />
            <div className="pl-preset-footer">
              <button type="button" className="pl-btn pl-btn-primary" onClick={() => void copyText(JSON.stringify(presets, null, 2))}>
                <Icon name="copy" size={13} /> Копировать
              </button>
              <button type="button" className="pl-btn" onClick={() => setMode("list")}>
                Назад
              </button>
            </div>
          </>
        )
      }
    </Popover>
  );
}
