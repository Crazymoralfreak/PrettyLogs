import { Common } from "@k8slens/extensions";
import { action, makeObservable, observable } from "mobx";
import type { FilterPreset, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { sanitizeFilterState } from "../core/filter-engine";

export interface PrettyLogsStoreModel {
  presets: FilterPreset[];
  settings: Settings;
}

function sanitizeSettings(input: Partial<Settings> | undefined): Settings {
  const number = (value: unknown, fallback: number, min: number, max: number): number =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

  return {
    pollIntervalMs: number(input?.pollIntervalMs, DEFAULT_SETTINGS.pollIntervalMs, 500, 60000),
    defaultTailLines: number(input?.defaultTailLines, DEFAULT_SETTINGS.defaultTailLines, 0, 1000000),
    maxBufferLines: number(input?.maxBufferLines, DEFAULT_SETTINGS.maxBufferLines, 1000, 1000000),
    mergeMultiline: input?.mergeMultiline !== false,
  };
}

function sanitizePresets(input: unknown): FilterPreset[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((preset): preset is FilterPreset => typeof preset === "object" && preset !== null && typeof preset.name === "string")
    .map(preset => ({
      id: typeof preset.id === "string" ? preset.id : `preset-${Math.random().toString(36).slice(2, 9)}`,
      name: preset.name,
      filter: sanitizeFilterState(preset.filter),
      updatedAt: typeof preset.updatedAt === "number" ? preset.updatedAt : Date.now(),
    }));
}

/** Persistent storage for saved filter presets and user settings (lives in main and renderer). */
export class PrettyLogsStore extends Common.Store.ExtensionStore<PrettyLogsStoreModel> {
  presets: FilterPreset[] = [];
  settings: Settings = { ...DEFAULT_SETTINGS };

  constructor() {
    super({
      configName: "prettylogs-store",
      defaults: { presets: [], settings: { ...DEFAULT_SETTINGS } },
    });

    makeObservable(this, {
      presets: observable.ref,
      settings: observable.ref,
      setPresets: action,
      updateSettings: action,
    });
  }

  setPresets(presets: FilterPreset[]): void {
    this.presets = sanitizePresets(presets);
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = sanitizeSettings({ ...this.settings, ...patch });
  }

  fromStore(data: Partial<PrettyLogsStoreModel>): void {
    this.presets = sanitizePresets(data.presets);
    this.settings = sanitizeSettings(data.settings);
  }

  toJSON(): PrettyLogsStoreModel {
    return {
      presets: this.presets.map(preset => ({ ...preset })),
      settings: { ...this.settings },
    };
  }
}
