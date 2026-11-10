import JSZip from "jszip";

/**
 * Minimal .xlsx reader/writer built on jszip (already a dependency).
 * Reads the first worksheet into a grid of strings; numbers stay as their raw
 * text so callers can treat date serials themselves. Writes a single sheet with
 * inline strings and a bold header style.
 */

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}
function encodeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Concatenate every <t> inside a fragment (handles rich text runs). */
function textOf(fragment: string): string {
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment))) out += m[1] ? decodeXml(m[1]) : "";
  return out;
}

/** "B12" → { col: 1, row: 11 } (zero-based). */
export function cellRef(ref: string): { col: number; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase());
  if (!m) return { col: 0, row: 0 };
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) - 1 };
}
export function colName(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const zip = await JSZip.loadAsync(data);
  const read = async (p: string) => (await zip.file(p)?.async("string")) ?? null;

  // locate first sheet via workbook rels (fallback sheet1.xml)
  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = await read("xl/workbook.xml");
  const rels = await read("xl/_rels/workbook.xml.rels");
  if (wb && rels) {
    const first = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb) ?? /<sheet\b[^>]*\bid="([^"]+)"/.exec(wb);
    if (first) {
      const rel = new RegExp(`<Relationship\\b[^>]*\\bId="${first[1]}"[^>]*>`).exec(rels)?.[0];
      const target = rel ? /Target="([^"]+)"/.exec(rel)?.[1] : null;
      if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    }
  }
  const sheet = await read(sheetPath);
  if (!sheet) throw new Error("No worksheet found in this file.");

  const shared: string[] = [];
  const ss = await read("xl/sharedStrings.xml");
  if (ss) {
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ss))) shared.push(textOf(m[1]));
  }

  const grid: string[][] = [];
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(sheet))) {
    const attrs = m[1];
    const body = m[2] ?? "";
    const r = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
    if (!r) continue;
    const t = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";
    let val = "";
    if (t === "inlineStr") val = textOf(body);
    else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      if (v == null) continue;
      val = t === "s" ? shared[Number(v)] ?? "" : t === "b" ? (v === "1" ? "TRUE" : "FALSE") : decodeXml(v);
    }
    const { col, row } = cellRef(r);
    (grid[row] ??= []);
    grid[row][col] = val;
  }
  // fill holes
  let width = 0;
  for (let i = 0; i < grid.length; i++) width = Math.max(width, grid[i]?.length ?? 0);
  return Array.from({ length: grid.length }, (_, i) => Array.from({ length: width }, (_, j) => (grid[i]?.[j] ?? "").trim()));
}

type WriteOpts = { sheetName?: string; headerRow?: number; titleRow?: number; colWidths?: number[] };

/** Build an .xlsx (browser Blob) with one sheet. `headerRow` (0-based) gets the header style. */
export async function writeXlsx(rows: (string | number | null)[][], opts: WriteOpts = {}): Promise<Blob> {
  const bytes = await writeXlsxBytes(rows, opts);
  return new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function writeXlsxBytes(rows: (string | number | null)[][], opts: WriteOpts = {}): Promise<Uint8Array> {
  const sheetName = encodeXml((opts.sheetName ?? "Sheet1").slice(0, 31));
  const rowXml = rows
    .map((r, ri) => {
      const style = ri === opts.headerRow ? ' s="1"' : ri === opts.titleRow ? ' s="2"' : "";
      const cells = r
        .map((v, ci) => {
          if (v == null || v === "") return "";
          const ref = `${colName(ci)}${ri + 1}`;
          return typeof v === "number"
            ? `<c r="${ref}"${style}><v>${v}</v></c>`
            : `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${encodeXml(String(v))}</t></is></c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  const cols = opts.colWidths?.length
    ? `<cols>${opts.colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  );
  zip.file(
    "xl/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><u/><sz val="16"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2E5C8A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rowXml}</sheetData></worksheet>`
  );
  return zip.generateAsync({ type: "uint8array" });
}
