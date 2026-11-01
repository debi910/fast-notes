// What a judge reads first: plain English, no charged topics, no raw tracking URLs.

const CHARGED =
  /epstein|trump|biden|harris|election|israel|gaza|hamas|idf|palestin|ukrain|russia|putin|abortion|vaccin|covid|muslim|jewish|islam|nazi|genocide|terror|riot|iran|persian|boebert|senator|starmer|sunak/i;

export function isPlainEnglish(t: string): boolean {
  if (!t || CHARGED.test(t)) return false;
  const ascii = [...t].filter((c) => c.charCodeAt(0) < 128).length / t.length;
  return ascii > 0.95 && /\b(the|is|was|not|this|and)\b/i.test(t);
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" };

/** Decode HTML entities and show links as their domain ("theguardian.com"), not the full URL. */
export function tidyNoteText(t: string): string {
  return t
    .replace(/&(amp|quot|#39|lt|gt);/g, (m) => ENTITIES[m] ?? m)
    .replace(/https?:\/\/[^\s)]+/g, (u) => {
      try {
        return `(${new URL(u).hostname.replace(/^www\./, "")})`;
      } catch {
        return u;
      }
    })
    .replace(/\s+/g, " ")
    .trim();
}
