import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from "@earendil-works/pi-coding-agent";
import type { TruncationResult } from "@earendil-works/pi-coding-agent";

export interface AnalyseMeTruncationMetadata {
  truncated: boolean;
  outputLines: number;
  totalLines: number;
  outputBytes: number;
  totalBytes: number;
}

export interface AnalyseMeTruncatedText {
  text: string;
  metadata: AnalyseMeTruncationMetadata;
}

export function truncateAnalyseMeText(
  text: string,
  maxLines: number = DEFAULT_MAX_LINES,
  maxBytes: number = DEFAULT_MAX_BYTES,
): AnalyseMeTruncatedText {
  const result = truncateHead(text, { maxLines, maxBytes });
  return {
    text: formatTruncatedText(result),
    metadata: {
      truncated: result.truncated,
      outputLines: result.outputLines,
      totalLines: result.totalLines,
      outputBytes: result.outputBytes,
      totalBytes: result.totalBytes,
    },
  };
}

function formatTruncatedText(result: TruncationResult): string {
  if (!result.truncated) return result.content;

  const outputSize = formatSize(result.outputBytes);
  const totalSize = formatSize(result.totalBytes);
  return `${result.content}\n\n[AnalyseMe output truncated: ${result.outputLines} of ${result.totalLines} lines (${outputSize} of ${totalSize}).]`;
}
