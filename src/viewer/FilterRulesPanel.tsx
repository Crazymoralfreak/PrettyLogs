import React from "react";
import type { FilterRule, FilterRuleMode } from "../common/types";
import { createRule } from "../core/filter-engine";
import { Icon } from "./icons";

interface FilterRulesPanelProps {
  rules: FilterRule[];
  errors: Record<string, string>;
  onChange: (rules: FilterRule[]) => void;
}

const MODE_LABELS: Record<FilterRuleMode, string> = {
  include: "Показать",
  exclude: "Скрыть",
  highlight: "Подсветить",
};

const MODES: FilterRuleMode[] = ["include", "exclude", "highlight"];

function parseMode(value: string): FilterRuleMode {
  return MODES.find(mode => mode === value) ?? "include";
}

/**
 * Editor of multiple combinable rules. "Показать" rules are OR-ed (a line must match one of them),
 * "Скрыть" rules remove lines, "Подсветить" rules only color the matches.
 */
export function FilterRulesPanel({ rules, errors, onChange }: FilterRulesPanelProps): React.ReactElement {
  const update = (id: string, patch: Partial<FilterRule>): void => {
    onChange(rules.map(rule => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  return (
    <div className="pl-rules">
      {rules.length === 0 ? <div className="pl-muted">Правил нет. Добавьте правило, чтобы комбинировать несколько условий.</div> : null}
      {rules.map(rule => (
        <div key={rule.id} className={`pl-rule${rule.enabled ? "" : " pl-rule-off"}`}>
          <input type="checkbox" checked={rule.enabled} title="Включено" onChange={event => update(rule.id, { enabled: event.target.checked })} />
          <input className="pl-input pl-rule-name" value={rule.name} title="Название" onChange={event => update(rule.id, { name: event.target.value })} />
          <input
            className={`pl-input pl-rule-pattern${errors[rule.id] ? " pl-input-error" : ""}`}
            value={rule.pattern}
            placeholder={rule.isRegex ? "regex" : "текст"}
            spellCheck={false}
            title={errors[rule.id] ?? "Шаблон"}
            onChange={event => update(rule.id, { pattern: event.target.value })}
          />
          <button type="button" className={`pl-toggle${rule.isRegex ? " pl-toggle-on" : ""}`} title="Регулярное выражение" onClick={() => update(rule.id, { isRegex: !rule.isRegex })}>
            .*
          </button>
          <button
            type="button"
            className={`pl-toggle${rule.caseSensitive ? " pl-toggle-on" : ""}`}
            title="Учитывать регистр"
            onClick={() => update(rule.id, { caseSensitive: !rule.caseSensitive })}
          >
            Aa
          </button>
          <select className="pl-select" value={rule.mode} onChange={event => update(rule.id, { mode: parseMode(event.target.value) })}>
            {MODES.map(mode => (
              <option key={mode} value={mode}>
                {MODE_LABELS[mode]}
              </option>
            ))}
          </select>
          <input type="color" className="pl-color" value={rule.color} title="Цвет подсветки" onChange={event => update(rule.id, { color: event.target.value })} />
          <button type="button" className="pl-icon-btn" title="Удалить правило" onClick={() => onChange(rules.filter(item => item.id !== rule.id))}>
            <Icon name="trash" size={13} />
          </button>
          {errors[rule.id] ? <span className="pl-error-text">{errors[rule.id]}</span> : null}
        </div>
      ))}
      <button type="button" className="pl-btn" onClick={() => onChange([...rules, createRule(rules.length)])}>
        <Icon name="plus" size={13} />
        Добавить правило
      </button>
    </div>
  );
}
