export interface GetSecurityHotspotToolInput {
  hotspotKey: string;
  projectKey?: string;
  organization?: string;
  branch?: string;
  pullRequest?: string;
}

export interface GetSecurityHotspotDetails {
  hotspotKey: string;
  projectKey?: string;
  organization?: string;
  truncated?: boolean;
}
