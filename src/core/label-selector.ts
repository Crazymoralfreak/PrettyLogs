export interface LabelSelectorRequirement {
  key: string;
  operator: string;
  values?: string[];
}

export interface LabelSelectorSpec {
  matchLabels?: Record<string, string>;
  matchExpressions?: LabelSelectorRequirement[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Extracts `spec.selector` from a workload spec of unknown shape. */
export function readSelector(spec: unknown): LabelSelectorSpec | null {
  if (!isRecord(spec) || !isRecord(spec.selector)) {
    return null;
  }

  return spec.selector as LabelSelectorSpec;
}

function expressionToString({ key, operator, values = [] }: LabelSelectorRequirement): string | null {
  switch (operator) {
    case "In":
      return `${key} in (${values.join(",")})`;
    case "NotIn":
      return `${key} notin (${values.join(",")})`;
    case "Exists":
      return key;
    case "DoesNotExist":
      return `!${key}`;
    default:
      return null;
  }
}

/** Converts a Kubernetes label selector to the query string understood by the API server. */
export function buildLabelSelector(selector: LabelSelectorSpec | null): string | null {
  if (!selector) {
    return null;
  }

  const parts: string[] = Object.entries(selector.matchLabels ?? {}).map(([key, value]) => `${key}=${value}`);

  for (const expression of selector.matchExpressions ?? []) {
    const part = expressionToString(expression);

    if (part) {
      parts.push(part);
    }
  }

  return parts.length > 0 ? parts.join(",") : null;
}
