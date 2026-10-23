import type { FilterRule, FilterState, LogLevel, LogLine, SearchState } from "../common/types";
import { LOG_LEVELS } from "../common/types";
import type { HighlightRange } from "./highlight";

const MAX_RANGES_PER_LINE = 200;

export const RULE_COLORS = ["#f5c542", "#4cc38a", "#4dabf7", "#f06595", "#ff922b", "#b197fc"];

export function defaultSearchState(): SearchState {
  return { query: "", isRegex: false, caseSensitive: false, invert: false, mode: "filter" };
}

export function defaultLevels(): Record<LogLevel, boolean> {
  return Object.fromEntries(LOG_LEVELS.map(level => [level, true])) as Record<LogLevel, boolean>;
}

export function defaultFilterState(): FilterState {
  return { levels: defaultLevels(), search: defaultSearchState(), rules: [] };
}

export function createRule(index: number): FilterRule {
  return {
    id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: `Правило ${index + 1}`,
    pattern: "",
    isRegex: false,
    caseSensitive: false,
    mode: "include",
    color: RULE_COLORS[index % RULE_COLORS.length],
    enabled: true,
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Matcher {
  test(text: string): boolean;
  ranges(text: string): Array<[number, number]>;
}

/** Builds a matcher from a plain string or regex; throws on invalid regular expressions. */
export function createMatcher(pattern: string, isRegex: boolean, caseSensitive: boolean): Matcher {
  const source = isRegex ? pattern : escapeRegExp(pattern);
  const flags = caseSensitive ? "" : "i";
  const single = new RegExp(source, flags);
  const global = new RegExp(source, `${flags}g`);

  return {
    test: text => single.test(text),
    ranges: text => {
      const found: Array<[number, number]> = [];

      global.lastIndex = 0;

      let match = global.exec(text);

      while (match && found.length < MAX_RANGES_PER_LINE) {
        if (match[0].length === 0) {
          global.lastIndex++;
        } else {
          found.push([match.index, match.index + match[0].length]);
        }

        match = global.exec(text);
      }

      return found;
    },
  };
}

interface CompiledRule {
  rule: FilterRule;
  matcher: Matcher;
}

export interface CompiledFilter {
  /** Error of the search expression (for example an invalid regex), or null. */
  searchError: string | null;
  /** Errors of rule expressions by rule id. */
  ruleErrors: Record<string, string>;
  /** True when the search expression filters or marks lines. */
  hasSearch: boolean;
  /** Level, search and rule filtering for a line. */
  accepts(line: LogLine): boolean;
  /** True when the line text matches the search expression (ignoring `invert` and mode). */
  matchesSearch(text: string): boolean;
  /** Ranges to highlight in a line: rules first, search last. */
  ranges(text: string, currentSearch?: boolean): HighlightRange[];
}

function tryCreate(pattern: string, isRegex: boolean, caseSensitive: boolean): { matcher: Matcher | null; error: string | null } {
  if (pattern.length === 0) {
    return { matcher: null, error: null };
  }

  try {
    return { matcher: createMatcher(pattern, isRegex, caseSensitive), error: null };
  } catch (error) {
    return { matcher: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export function compileFilter(state: FilterState): CompiledFilter {
  const { levels, search, rules } = state;
  const searchResult = tryCreate(search.query, search.isRegex, search.caseSensitive);
  const ruleErrors: Record<string, string> = {};
  const compiledRules: CompiledRule[] = [];

  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }

    const result = tryCreate(rule.pattern, rule.isRegex, rule.caseSensitive);

    if (result.error) {
      ruleErrors[rule.id] = result.error;
    } else if (result.matcher) {
      compiledRules.push({ rule, matcher: result.matcher });
    }
  }

  const includeRules = compiledRules.filter(({ rule }) => rule.mode === "include");
  const excludeRules = compiledRules.filter(({ rule }) => rule.mode === "exclude");
  const markRules = compiledRules.filter(({ rule }) => rule.mode !== "exclude");
  const searchMatcher = searchResult.matcher;

  return {
    searchError: searchResult.error,
    ruleErrors,
    hasSearch: searchMatcher !== null,
    accepts: line => {
      if (!levels[line.level]) {
        return false;
      }

      if (searchMatcher && search.mode === "filter" && searchMatcher.test(line.text) === search.invert) {
        return false;
      }

      if (excludeRules.some(({ matcher }) => matcher.test(line.text))) {
        return false;
      }

      return includeRules.length === 0 || includeRules.some(({ matcher }) => matcher.test(line.text));
    },
    matchesSearch: text => (searchMatcher ? searchMatcher.test(text) : false),
    ranges: (text, currentSearch = false) => {
      const result: HighlightRange[] = [];

      for (const { rule, matcher } of markRules) {
        for (const [start, end] of matcher.ranges(text)) {
          result.push({ start, end, color: rule.color, kind: "rule" });
        }
      }

      if (searchMatcher && !search.invert) {
        for (const [start, end] of searchMatcher.ranges(text)) {
          result.push({ start, end, kind: "search", current: currentSearch });
        }
      }

      return result;
    },
  };
}

/** True when the filter would not hide or mark anything. */
export function isDefaultFilter(state: FilterState): boolean {
  return (
    LOG_LEVELS.every(level => state.levels[level]) &&
    state.search.query.length === 0 &&
    state.rules.every(rule => !rule.enabled || rule.pattern.length === 0)
  );
}

/** Makes a filter state loaded from untrusted JSON (preset import, store) safe to use. */
export function sanitizeFilterState(input: unknown): FilterState {
  const base = defaultFilterState();

  if (typeof input !== "object" || input === null) {
    return base;
  }

  const source = input as Partial<FilterState>;
  const levels = defaultLevels();

  for (const level of LOG_LEVELS) {
    if (typeof source.levels?.[level] === "boolean") {
      levels[level] = source.levels[level];
    }
  }

  const search: SearchState = { ...base.search };

  if (source.search && typeof source.search === "object") {
    const incoming = source.search;

    search.query = typeof incoming.query === "string" ? incoming.query : "";
    search.isRegex = incoming.isRegex === true;
    search.caseSensitive = incoming.caseSensitive === true;
    search.invert = incoming.invert === true;
    search.mode = incoming.mode === "highlight" ? "highlight" : "filter";
  }

  const rules: FilterRule[] = Array.isArray(source.rules)
    ? source.rules
        .filter((rule): rule is FilterRule => typeof rule === "object" && rule !== null && typeof rule.pattern === "string")
        .map((rule, index) => ({
          id: typeof rule.id === "string" ? rule.id : createRule(index).id,
          name: typeof rule.name === "string" ? rule.name : `Правило ${index + 1}`,
          pattern: rule.pattern,
          isRegex: rule.isRegex === true,
          caseSensitive: rule.caseSensitive === true,
          mode: rule.mode === "exclude" || rule.mode === "highlight" ? rule.mode : "include",
          color: typeof rule.color === "string" ? rule.color : RULE_COLORS[index % RULE_COLORS.length],
          enabled: rule.enabled !== false,
        }))
    : [];

  return { levels, search, rules };
}
