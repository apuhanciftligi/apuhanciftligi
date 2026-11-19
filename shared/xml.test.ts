import { describe, expect, it } from "vitest";

import { escapeXml, readAllTags, readTag, unescapeXml } from "@/shared/xml";

describe("xml helpers", () => {
  it("escapes and unescapes the five XML entities", () => {
    const raw = `a & b < c > "d" 'e'`;
    expect(escapeXml(raw)).toBe("a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;");
    expect(unescapeXml(escapeXml(raw))).toBe(raw);
  });

  it("reads a tag regardless of namespace prefix and attributes", () => {
    const xml = '<S:Body><ns2:x><key xsi:type="xs:string">faturaNo</key><value>A&amp;B</value></ns2:x></S:Body>';
    expect(readTag(xml, "key")).toBe("faturaNo");
    expect(readTag(xml, "value")).toBe("A&B");
    expect(readTag(xml, "missing")).toBeUndefined();
  });

  it("does not match a longer tag name with the same prefix", () => {
    expect(readTag("<belgeOid>1</belgeOid>", "belge")).toBeUndefined();
  });

  it("reads every occurrence in order", () => {
    const xml = "<return><a>1</a></return><return><a>2</a></return>";
    expect(readAllTags(xml, "return").map((r) => readTag(r, "a"))).toEqual(["1", "2"]);
  });
});
