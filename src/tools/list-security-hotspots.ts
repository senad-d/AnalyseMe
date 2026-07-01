export interface ListSecurityHotspotsToolInput {
  projectKey?: string;
  organization?: string;
  branch?: string;
  pullRequest?: string;
  limit?: number;
  page?: number;
}

export interface ListSecurityHotspotsDetails {
  projectKey: string;
  projectKeySource: string;
  shown: number;
  total?: number;
  truncated?: boolean;
}
