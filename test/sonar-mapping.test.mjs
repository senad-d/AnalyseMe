import assert from "node:assert/strict";
import test from "node:test";

import {
  mapSecurityHotspotDetail,
  mapHotspotSearchResponse,
  mapHotspotSearchResponseWithDiagnostics,
  mapSecurityHotspotSummary,
} from "../src/sonar/hotspot-mapping.ts";
import {
  mapIssueDetail,
  mapIssueSearchResponse,
  mapIssueSearchResponseWithDiagnostics,
  mapIssueSummary,
} from "../src/sonar/issue-mapping.ts";
import { mapProjectSummaryResponse } from "../src/sonar/project-mapping.ts";
import { truncateAnalyseMeText } from "../src/utils/truncation.ts";

test("maps project summary responses and missing optional fields defensively", () => {
  const mapped = mapProjectSummaryResponse(
    "demo",
    { projectStatus: { status: "OK" } },
    {
      component: {
        analysisDate: "2026-01-01T00:00:00+0000",
        measures: [
          { metric: "bugs", value: "0", bestValue: true },
          { metric: "coverage", value: "87.5" },
        ],
      },
    },
  );
  const missing = mapProjectSummaryResponse("demo", {}, {});

  assert.equal(mapped.projectKey, "demo");
  assert.equal(mapped.qualityGateStatus, "OK");
  assert.equal(mapped.metrics[0].key, "bugs");
  assert.equal(mapped.metrics[0].bestValue, true);
  assert.match(missing.warnings.join("\n"), /Quality gate status/);
  assert.match(missing.warnings.join("\n"), /Project measures/);
});

test("maps issue list and issue detail with locations, flows, source snippets, and rule metadata", () => {
  const issue = {
    key: "ISSUE-1",
    message: "Avoid this pattern",
    severity: "MAJOR",
    type: "CODE_SMELL",
    status: "OPEN",
    rule: "typescript:S123",
    component: "demo:src/index.ts",
    line: 12,
    textRange: { startLine: 12, endLine: 12, startOffset: 4, endOffset: 12 },
    tags: ["bug"],
    secondaryLocations: [{ component: "demo:src/helper.ts", line: 4 }],
    flows: [{ locations: [{ component: "demo:src/flow.ts", textRange: { startLine: 9, endLine: 9 } }] }],
  };
  const rule = {
    key: "typescript:S123",
    name: "Rule name",
    severity: "MAJOR",
    type: "CODE_SMELL",
    cleanCodeAttribute: "CLEAR",
    tags: ["readability"],
    descriptionSections: [{ key: "how_to_fix", content: "Sonar-provided fix guidance." }],
  };
  const source = {
    issueSnippets: [
      {
        component: "demo:src/index.ts",
        sources: [
          { line: 11, code: "const value = 1;" },
          { line: 12, code: "doThing(value);" },
        ],
      },
    ],
  };

  const list = mapIssueSearchResponse({ issues: [issue] });
  const detail = mapIssueDetail(issue, rule, source);

  assert.equal(list[0].location.file, "src/index.ts");
  assert.equal(detail.ruleName, "Rule name");
  assert.match(detail.guidance ?? "", /Sonar-provided fix guidance/);
  assert.equal(detail.ruleMetadata?.cleanCodeAttribute, "CLEAR");
  assert.equal(detail.location.textRange?.startOffset, 4);
  assert.equal(detail.secondaryLocations[0].file, "src/helper.ts");
  assert.equal(detail.flows[0][0].file, "src/flow.ts");
  assert.equal(detail.sourceSnippets[1].text, "doThing(value);");
});

test("sanitizes and bounds Sonar-derived strings in mapped details", () => {
  const unsafeLongText = `\u001b[31m${"x".repeat(12_000)}\u0007`;
  const issueDetail = mapIssueDetail(
    {
      key: "ISSUE-ANSI",
      message: `Unsafe \u001b[32mmessage`,
      component: "demo:src/index.ts",
      line: 1,
    },
    { key: "typescript:S123", htmlDesc: unsafeLongText },
    { issueSnippets: [{ component: "demo:src/index.ts", sources: [{ line: 1, code: unsafeLongText }] }] },
  );
  const hotspotDetail = mapSecurityHotspotDetail({
    key: "HOTSPOT-ANSI",
    message: `Unsafe \u001b[33mhotspot`,
    component: "demo:src/db.ts",
    line: 2,
    rule: { riskDescription: unsafeLongText },
  });
  const projectSummary = mapProjectSummaryResponse(
    "demo\u001b[34m",
    { projectStatus: { status: "OK\u001b[35m" } },
    { component: { measures: [{ metric: "bugs\u001b[36m", value: unsafeLongText }] } },
  );
  const serialized = JSON.stringify({ issueDetail, hotspotDetail, projectSummary });

  assert.equal(serialized.includes("\\u001b"), false);
  assert.equal(serialized.includes("\\u0007"), false);
  assert.equal(serialized.includes(String.fromCharCode(27)), false);
  assert.equal(serialized.includes(String.fromCharCode(7)), false);
  assert.match(issueDetail.guidance ?? "", /AnalyseMe field truncated/);
  assert.match(issueDetail.sourceSnippets[0].text, /AnalyseMe field truncated/);
  assert.match(hotspotDetail.guidance.riskDescription ?? "", /AnalyseMe field truncated/);
  assert.match(projectSummary.metrics[0].value ?? "", /AnalyseMe field truncated/);
  assert.ok((issueDetail.guidance ?? "").length <= 8_000);
  assert.ok(issueDetail.sourceSnippets[0].text.length <= 2_000);
});

test("issue detail does not invent guidance when Sonar rule metadata is missing", () => {
  const detail = mapIssueDetail({ key: "ISSUE-2", component: "demo:src/index.ts" });

  assert.equal(detail.guidance, undefined);
  assert.equal(detail.ruleMetadata, undefined);
  assert.deepEqual(detail.sourceSnippets, []);
  assert.deepEqual(detail.secondaryLocations, []);
  assert.deepEqual(detail.flows, []);
});

test("reports malformed issue search payloads without placeholder issue keys", () => {
  const nonArray = mapIssueSearchResponseWithDiagnostics({ issues: { key: "ISSUE-1" } });
  const partial = mapIssueSearchResponseWithDiagnostics({
    issues: [
      { message: "Missing key" },
      { key: "   ", message: "Blank key" },
      { key: "ISSUE-OK", message: "Valid issue" },
    ],
  });

  assert.equal(nonArray.missingIssuesArray, true);
  assert.match(nonArray.warnings.join("\n"), /issues array/);
  assert.equal(partial.issues.length, 1);
  assert.equal(partial.issues[0].key, "ISSUE-OK");
  assert.equal(partial.invalidRows.length, 2);
  assert.deepEqual(partial.invalidRows.map((row) => row.index), [0, 1]);
  assert.match(partial.warnings.join("\n"), /Skipped 2 malformed Sonar issue row/);
  assert.deepEqual(mapIssueSearchResponse({ issues: [{ message: "Missing key" }] }), []);
  assert.throws(() => mapIssueSummary({ message: "Missing key" }), /missing non-empty issue key/);
});

test("maps security hotspot list and detail with Sonar-provided security guidance", () => {
  const hotspot = {
    key: "HOTSPOT-1",
    message: "Review this security-sensitive use",
    status: "TO_REVIEW",
    vulnerabilityProbability: "HIGH",
    securityCategory: "sql-injection",
    component: "demo:src/db.ts",
    line: 33,
    textRange: { startLine: 33, endLine: 33, startOffset: 2, endOffset: 18 },
    rule: {
      riskDescription: "Risk from Sonar.",
      vulnerabilityDescription: "Vulnerability details from Sonar.",
      fixRecommendation: "Fix recommendation from Sonar.",
    },
    secondaryLocations: [{ component: "demo:src/query.ts", line: 8 }],
  };

  const list = mapHotspotSearchResponse({ hotspots: [hotspot] });
  const detail = mapSecurityHotspotDetail(hotspot);

  assert.equal(list[0].location.file, "src/db.ts");
  assert.equal(detail.guidance.riskDescription, "Risk from Sonar.");
  assert.equal(detail.guidance.vulnerabilityDescription, "Vulnerability details from Sonar.");
  assert.equal(detail.guidance.fixRecommendation, "Fix recommendation from Sonar.");
  assert.equal(detail.location.textRange?.endOffset, 18);
  assert.equal(detail.secondaryLocations[0].file, "src/query.ts");
});

test("reports malformed hotspot search payloads without placeholder hotspot keys", () => {
  const nonArray = mapHotspotSearchResponseWithDiagnostics({ hotspots: { key: "HOTSPOT-1" } });
  const partial = mapHotspotSearchResponseWithDiagnostics({
    hotspots: [
      { message: "Missing key" },
      { key: "   ", message: "Blank key" },
      { key: "HOTSPOT-OK", message: "Valid hotspot" },
    ],
  });

  assert.equal(nonArray.missingHotspotsArray, true);
  assert.match(nonArray.warnings.join("\n"), /hotspots array/);
  assert.equal(partial.hotspots.length, 1);
  assert.equal(partial.hotspots[0].key, "HOTSPOT-OK");
  assert.equal(partial.invalidRows.length, 2);
  assert.deepEqual(partial.invalidRows.map((row) => row.index), [0, 1]);
  assert.match(partial.warnings.join("\n"), /Skipped 2 malformed Sonar hotspot row/);
  assert.deepEqual(mapHotspotSearchResponse({ hotspots: [{ message: "Missing key" }] }), []);
  assert.throws(() => mapSecurityHotspotSummary({ message: "Missing key" }), /missing non-empty hotspot key/);
});

test("truncates long AnalyseMe text with visible notice and metadata", () => {
  const result = truncateAnalyseMeText("line 1\nline 2\nline 3\nline 4", 2, 1000);

  assert.equal(result.metadata.truncated, true);
  assert.equal(result.metadata.outputLines, 2);
  assert.equal(result.metadata.totalLines, 4);
  assert.match(result.text, /AnalyseMe output truncated/);
});
