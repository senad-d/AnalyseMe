export interface GetIssueToolInput {
  issueKey: string;
  projectKey?: string;
  organization?: string;
  branch?: string;
  pullRequest?: string;
}

export interface GetIssueDetails {
  issueKey: string;
  projectKey?: string;
  organization?: string;
  truncated?: boolean;
}
