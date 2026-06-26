// Snapshot framing. The JSON_TAIL markers let any consumer reuse the same
// reader code to extract the canonical payload from a snapshot file.

export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_VERSION_LINE = `<!-- gradtrack-snapshot-version: ${SNAPSHOT_VERSION} -->`;

export const FRONTMATTER_DELIM = '---';
export const JSON_TAIL_OPEN = '## Raw payload\n```json\n';
export const JSON_TAIL_CLOSE = '\n```\n';
