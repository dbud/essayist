/** A single grep match with context. */
export interface GrepMatch {
  path: string;
  line_number: number;
  line: string;
  before: string[];
  after: string[];
}

/** Options for grep search. */
export interface GrepOptions {
  path?: string;
  caseSensitive?: boolean;
  maxResults?: number;
}

/** Result of a grep operation. */
export interface GrepResult {
  matches: GrepMatch[];
}
