/**
 * Strip "a) ", "1. " style prefixes when the UI already shows its own letter/number badge.
 */
export function quizOptionBody(label: string): string {
  const trimmed = label.trim()
  const stripped = trimmed.replace(/^\s*(?:[a-zA-Z]|\d+)(?:\)|\.|:)\s*/i, '').trim()
  return stripped.length > 0 ? stripped : trimmed
}
