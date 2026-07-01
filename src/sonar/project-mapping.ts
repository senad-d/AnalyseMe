export interface AgentProjectMetric {
  key: string;
  value?: string;
  bestValue?: boolean;
}

export interface AgentProjectSummary {
  projectKey: string;
  qualityGateStatus?: string;
  analysisDate?: string;
  metrics: AgentProjectMetric[];
  warnings: string[];
}

export function mapProjectSummaryResponse(
  projectKey: string,
  qualityGateResponse: unknown,
  measuresResponse: unknown,
): AgentProjectSummary {
  const qualityGatePayload = asRecord(qualityGateResponse);
  const measuresPayload = asRecord(measuresResponse);
  const projectStatus = asRecord(qualityGatePayload.projectStatus);
  const component = asRecord(measuresPayload.component);

  return {
    projectKey,
    qualityGateStatus: stringField(projectStatus, "status"),
    analysisDate: stringField(component, "analysisDate") ?? stringField(component, "date"),
    metrics: mapMeasures(component.measures),
    warnings: buildProjectSummaryWarnings(projectStatus, component),
  };
}

export function mapMeasures(value: unknown): AgentProjectMetric[] {
  const measures = Array.isArray(value) ? value : [];
  return measures.map(mapMeasure);
}

function mapMeasure(value: unknown): AgentProjectMetric {
  const payload = asRecord(value);

  return {
    key: stringField(payload, "metric") ?? "unknown_metric",
    value: stringField(payload, "value"),
    bestValue: booleanField(payload, "bestValue"),
  };
}

function buildProjectSummaryWarnings(
  projectStatus: Record<string, unknown>,
  component: Record<string, unknown>,
): string[] {
  const warnings: string[] = [];

  if (Object.keys(projectStatus).length === 0) warnings.push("Quality gate status was not returned by Sonar.");
  if (!Array.isArray(component.measures)) warnings.push("Project measures were not returned by Sonar.");

  return warnings;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>;

  return {};
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}
