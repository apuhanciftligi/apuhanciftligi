/**
 * Minimal XML helpers for the hand-built SOAP integrations (Aras Kargo, QNB
 * eSolutions). Those services take fixed envelopes and we read a handful of
 * leaf tags back, so a full XML/SOAP library would add a dependency for no
 * gain. Anything read here is still Zod-parsed by the caller before use.
 */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function tagPattern(tag: string, flags: string): RegExp {
  // Namespace prefixes and attributes on the opening tag are ignored.
  return new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, flags);
}

/** Unescaped text of the first `<tag>` in `xml`, or undefined. */
export function readTag(xml: string, tag: string): string | undefined {
  const match = tagPattern(tag, "").exec(xml);
  return match?.[1] === undefined ? undefined : unescapeXml(match[1]);
}

/** Raw (still escaped) inner XML of every `<tag>` in `xml`, in order. */
export function readAllTags(xml: string, tag: string): string[] {
  return [...xml.matchAll(tagPattern(tag, "g"))].map((m) => m[1] ?? "");
}
