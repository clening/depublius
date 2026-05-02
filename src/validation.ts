export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function countWords(passage: string): number {
  const trimmed = passage.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

export function validatePassage(passage: string): ValidationResult {
  const count = countWords(passage);
  if (count < 150 || count > 500) {
    return {
      ok: false,
      error: `Passage must be between 150 and 500 words (got ${count}).`,
    };
  }
  return { ok: true };
}
