import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("writes a header and rows with CRLF line endings", () => {
    expect(toCsv([{ a: 1, b: "x" }, { a: 2, b: "y" }])).toBe("a,b\r\n1,x\r\n2,y\r\n");
  });
  it("quotes commas, quotes and new lines", () => {
    expect(toCsv([{ n: 'He said "hi", then left\nlater' }])).toBe('n\r\n"He said ""hi"", then left\nlater"\r\n');
  });
  it("keeps numbers as numbers, including negatives", () => {
    expect(toCsv([{ v: -5.25, s: "-5.25" }])).toBe("v,s\r\n-5.25,-5.25\r\n");
  });
  it("neutralises spreadsheet formulas in text", () => {
    expect(toCsv([{ n: "=HYPERLINK(\"x\")" }])).toBe('n\r\n"\'=HYPERLINK(""x"")"\r\n');
    expect(toCsv([{ n: "@cmd" }])).toBe("n\r\n'@cmd\r\n");
    expect(toCsv([{ n: "+61 400 000 000" }])).toBe("n\r\n'+61 400 000 000\r\n");
  });
  it("blanks null, undefined and non-finite numbers; JSON-encodes objects", () => {
    expect(toCsv([{ a: null, b: undefined, c: Number.NaN, d: { x: 1 } }])).toBe('a,b,c,d\r\n,,,"{""x"":1}"\r\n');
  });
  it("uses the union of keys across rows unless columns are given", () => {
    expect(toCsv([{ a: 1 }, { b: 2 }])).toBe("a,b\r\n1,\r\n,2\r\n");
    expect(toCsv([{ a: 1, b: 2 }], ["b"])).toBe("b\r\n2\r\n");
  });
});
