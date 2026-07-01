export type ConfigTuiValueKind = "text" | "empty" | "boolean" | "path" | "warning";

export interface ConfigTuiSetting {
  label: string;
  description: string;
  value: string;
  valueKind: ConfigTuiValueKind;
}

export interface ConfigTuiCategory {
  label: string;
  description: string;
  settings: ConfigTuiSetting[];
}

export interface ConfigTuiModel {
  title: string;
  scope: string;
  sourceLine: string;
  categories: ConfigTuiCategory[];
}
