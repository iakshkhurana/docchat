export interface Chunk {
  text: string;
  page: number;
}

const CHUNK_SIZE = 800;
const OVERLAP = 100;

/**
 * Slide an ~800-char window (with ~100-char overlap) over each page's text.
 * Pure: same input → same output. Page number is carried onto every chunk
 * so retrieval can cite the source page.
 */
export function chunk(
  pages: { text: string; page: number }[],
  size = CHUNK_SIZE,
  overlap = OVERLAP,
): Chunk[] {
  const step = size - overlap;
  const chunks: Chunk[] = [];

  for (const { text, page } of pages) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) continue;

    for (let i = 0; i < clean.length; i += step) {
      const slice = clean.slice(i, i + size).trim();
      if (slice) chunks.push({ text: slice, page });
      if (i + size >= clean.length) break;
    }
  }

  return chunks;
}
