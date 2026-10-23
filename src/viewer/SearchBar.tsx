import React, { useEffect, useState } from "react";
import type { SearchState } from "../common/types";
import { Icon } from "./icons";

const DEBOUNCE_MS = 150;

interface SearchBarProps {
  search: SearchState;
  error: string | null;
  matchCount: number;
  /** Zero based index of the current match or -1. */
  currentMatch: number;
  inputRef: React.RefObject<HTMLInputElement>;
  onChange: (search: SearchState) => void;
  onNext: () => void;
  onPrevious: () => void;
}

interface ToggleProps {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}

function Toggle({ active, title, onClick, children }: ToggleProps): React.ReactElement {
  return (
    <button type="button" className={`pl-toggle${active ? " pl-toggle-on" : ""}`} title={title} onClick={onClick}>
      {children}
    </button>
  );
}

/** Text / regex search with highlight or filter mode and next/previous navigation. */
export function SearchBar({ search, error, matchCount, currentMatch, inputRef, onChange, onNext, onPrevious }: SearchBarProps): React.ReactElement {
  const [text, setText] = useState(search.query);

  useEffect(() => {
    setText(search.query);
  }, [search.query]);

  useEffect(() => {
    if (text === search.query) {
      return undefined;
    }

    const timer = setTimeout(() => onChange({ ...search, query: text }), DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [text]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      if (text !== search.query) {
        onChange({ ...search, query: text });
      }

      if (event.shiftKey) {
        onPrevious();
      } else {
        onNext();
      }
    } else if (event.key === "Escape") {
      setText("");
      onChange({ ...search, query: "" });
    }
  };

  return (
    <div className="pl-search">
      <div className={`pl-search-box${error ? " pl-search-error" : ""}`}>
        <Icon name="search" size={13} />
        <input
          ref={inputRef}
          className="pl-search-input"
          value={text}
          placeholder={search.isRegex ? "Regex, например: user-\\d+|timeout" : "Поиск по логам (Ctrl+F)"}
          spellCheck={false}
          onChange={event => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {text ? (
          <button
            type="button"
            className="pl-icon-btn"
            title="Очистить"
            onClick={() => {
              setText("");
              onChange({ ...search, query: "" });
            }}
          >
            <Icon name="x" size={12} />
          </button>
        ) : null}
        <Toggle active={search.isRegex} title="Регулярное выражение" onClick={() => onChange({ ...search, isRegex: !search.isRegex })}>
          .*
        </Toggle>
        <Toggle active={search.caseSensitive} title="Учитывать регистр" onClick={() => onChange({ ...search, caseSensitive: !search.caseSensitive })}>
          Aa
        </Toggle>
        <Toggle active={search.invert} title="Инвертировать: скрыть совпавшие строки" onClick={() => onChange({ ...search, invert: !search.invert })}>
          !
        </Toggle>
      </div>
      <select
        className="pl-select"
        value={search.mode}
        title="Режим поиска"
        onChange={event => onChange({ ...search, mode: event.target.value === "highlight" ? "highlight" : "filter" })}
      >
        <option value="filter">Только совпадения</option>
        <option value="highlight">Подсвечивать все</option>
      </select>
      <div className="pl-search-nav">
        <button type="button" className="pl-icon-btn" title="Предыдущее совпадение (Shift+Enter)" disabled={matchCount === 0} onClick={onPrevious}>
          <Icon name="arrowUp" />
        </button>
        <button type="button" className="pl-icon-btn" title="Следующее совпадение (Enter)" disabled={matchCount === 0} onClick={onNext}>
          <Icon name="arrowDown" />
        </button>
        <span className="pl-search-count">
          {error ? "ошибка regex" : search.query ? `${currentMatch >= 0 ? currentMatch + 1 : 0} / ${matchCount}` : ""}
        </span>
      </div>
      {error ? <span className="pl-error-text" title={error}>{error}</span> : null}
    </div>
  );
}
