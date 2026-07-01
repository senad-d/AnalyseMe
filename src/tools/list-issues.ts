export interface ListIssuesToolInput {
  projectKey?: string;
  organization?: string;
  branch?: string;
  pullRequest?: string;
  limit?: number;
  page?: number;
}

export interface ListIssuesDetails {
  projectKey: string;
  projectKeySource: string;
  shown: number;
  total?: number;
  truncated?: boolean;
}
