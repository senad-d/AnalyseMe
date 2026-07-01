import assert from "node:assert/strict";
import test from "node:test";

import { AnalyseMeConfigError } from "../src/config/types.ts";
import { filterSecurityHotspotsRequiringReview } from "../src/sonar/hotspot-mapping.ts";
import { filterActiveSonarIssues } from "../src/sonar/issue-mapping.ts";
import {
  buildComponentMeasuresEndpoint,
  buildHotspotDetailEndpoint,
  buildHotspotSearchEndpoint,
  buildIssueDetailEndpoint,
  buildIssueSearchEndpoint,
  buildProjectStatusEndpoint,
  buildRuleDetailEndpoint,
  buildSourceIssueSnippetsEndpoint,
  buildSourceShowEndpoint,
} from "../src/sonar/endpoints.ts";

test("builds project summary endpoints with SonarCloud organization and branch scope", () => {
  const options = { projectKey: "demo", organization: "my-org", branch: "main" };

  assert.deepEqual(buildProjectStatusEndpoint(options), {
    path: "/api/qualitygates/project_status",
    query: { projectKey: "demo", organization: "my-org", branch: "main", pullRequest: undefined },
  });
  assert.deepEqual(buildComponentMeasuresEndpoint(options, ["bugs", "coverage"]), {
    path: "/api/measures/component",
    query: { component: "demo", metricKeys: "bugs,coverage", organization: "my-org", branch: "main", pullRequest: undefined },
  });
});

test("builds issue, rule, and source detail endpoints", () => {
  assert.deepEqual(buildIssueSearchEndpoint({ projectKey: "demo", pullRequest: "17", page: 2, pageSize: 50 }), {
    path: "/api/issues/search",
    query: { componentKeys: "demo", resolved: false, p: 2, ps: 50, organization: undefined, branch: undefined, pullRequest: "17" },
  });
  assert.deepEqual(buildIssueDetailEndpoint({ issueKey: "ISSUE-1", organization: "org" }), {
    path: "/api/issues/search",
    query: { issues: "ISSUE-1", additionalFields: "_all", organization: "org", branch: undefined, pullRequest: undefined },
  });
  assert.deepEqual(buildRuleDetailEndpoint({ ruleKey: "typescript:S123", organization: "org" }), {
    path: "/api/rules/show",
    query: { key: "typescript:S123", organization: "org" },
  });
  assert.deepEqual(buildSourceIssueSnippetsEndpoint({ issueKey: "ISSUE-1" }), {
    path: "/api/sources/issue_snippets",
    query: { issueKey: "ISSUE-1", organization: undefined },
  });
  assert.deepEqual(buildSourceShowEndpoint({ componentKey: "demo:src/index.ts", from: 10, to: 20, branch: "main" }), {
    path: "/api/sources/show",
    query: { key: "demo:src/index.ts", from: 10, to: 20, organization: undefined, branch: "main", pullRequest: undefined },
  });
});

test("builds security hotspot list and detail endpoints separately from issues", () => {
  assert.deepEqual(buildHotspotSearchEndpoint({ projectKey: "demo", organization: "org" }), {
    path: "/api/hotspots/search",
    query: { projectKey: "demo", status: "TO_REVIEW", p: 1, ps: 100, organization: "org", branch: undefined, pullRequest: undefined },
  });
  assert.deepEqual(buildHotspotDetailEndpoint({ hotspotKey: "HOTSPOT-1", organization: "org" }), {
    path: "/api/hotspots/show",
    query: { hotspot: "HOTSPOT-1", organization: "org", branch: undefined, pullRequest: undefined },
  });
});

test("endpoint builders reject mutually exclusive branch and pull request", () => {
  assert.throws(
    () => buildIssueSearchEndpoint({ projectKey: "demo", branch: "main", pullRequest: "1" }),
    AnalyseMeConfigError,
  );
});

test("filters active Sonar issues defensively across status variants", () => {
  const issues = [
    { key: "open", status: "OPEN" },
    { key: "confirmed", issueStatus: "CONFIRMED" },
    { key: "false-positive", resolution: "FALSE-POSITIVE" },
    { key: "accepted", issueStatus: "ACCEPTED" },
    { key: "ignored", ignored: true },
    { key: "resolved", resolved: true },
    { key: "closed", status: "CLOSED" },
    { key: "missing-fields" },
  ];

  assert.deepEqual(
    filterActiveSonarIssues(issues).map((issue) => issue.key),
    ["open", "confirmed", "missing-fields"],
  );
});

test("filters security hotspots requiring review", () => {
  const hotspots = [
    { key: "review", status: "TO_REVIEW" },
    { key: "unknown" },
    { key: "reviewed", status: "REVIEWED" },
    { key: "safe", resolution: "SAFE" },
    { key: "fixed", resolution: "FIXED" },
  ];

  assert.deepEqual(
    filterSecurityHotspotsRequiringReview(hotspots).map((hotspot) => hotspot.key),
    ["review", "unknown"],
  );
});
