#!/usr/bin/env node
// Generate the deterministic binary fixtures used by the upload-document E2E
// spec (e2e/tests/expert/upload-document.spec.ts) into e2e/fixtures/upload/.
//
// The backend only validates MIME type + extension (PDF/DOC/DOCX, <=20MB), so
// the fixtures must be byte-identical across runs but do not need to be fully
// spec-valid. They are still shaped like the real formats (PDF header, OLE2
// compound-file magic, a real ZIP-based minimal .docx) so the test doubles as
// a realistic client upload. Every byte is deterministic.
//
// Usage:
//   node scripts/generate-upload-fixtures.mjs   (from e2e/)
import { deflateRawSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "upload",
);

// ─────────────────────────── minimal .docx builder ───────────────────────────
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function localFileHeader(name, data) {
  const nameBuf = Buffer.from(name, "utf8");
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); // local file header signature
  head.writeUInt16LE(20, 4); // version needed
  head.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
  head.writeUInt16LE(0x0008, 8); // method: deflate
  head.writeUInt32LE(crc32(data), 14);
  head.writeUInt32LE(data.length, 18); // compressed size
  head.writeUInt32LE(data.length, 22); // uncompressed size
  head.writeUInt16LE(nameBuf.length, 26);
  head.writeUInt16LE(0, 28); // extra length
  return Buffer.concat([head, nameBuf, data]);
}

function centralDirEntry(name, data, offset) {
  const nameBuf = Buffer.from(name, "utf8");
  const head = Buffer.alloc(46);
  head.writeUInt32LE(0x02014b50, 0); // central directory signature
  head.writeUInt16LE(20, 4); // version made by
  head.writeUInt16LE(20, 6); // version needed
  head.writeUInt16LE(0x0800, 8); // flags
  head.writeUInt16LE(0x0008, 10); // method
  head.writeUInt32LE(crc32(data), 16);
  head.writeUInt32LE(data.length, 20);
  head.writeUInt32LE(data.length, 24);
  head.writeUInt16LE(nameBuf.length, 28);
  head.writeUInt16LE(0, 30); // extra length
  head.writeUInt16LE(0, 32); // comment length
  head.writeUInt16LE(0, 34); // disk number
  head.writeUInt16LE(0, 36); // internal attrs
  head.writeUInt32LE(0, 38); // external attrs
  head.writeUInt32LE(offset, 42);
  return Buffer.concat([head, nameBuf]);
}

function endOfCentralDir(entries, centralSize, centralOffset) {
  const head = Buffer.alloc(22);
  head.writeUInt32LE(0x06054b50, 0); // end-of-central-dir signature
  head.writeUInt16LE(entries, 8);
  head.writeUInt16LE(entries, 10);
  head.writeUInt32LE(centralSize, 12);
  head.writeUInt32LE(centralOffset, 16);
  head.writeUInt16LE(0, 20); // comment length
  return head;
}

function buildDocx() {
  const files = {
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      "</Types>",
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      "</Relationships>",
    "word/document.xml":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      "<w:body><w:p><w:r><w:t>E2E upload fixture</w:t></w:r></w:p></w:body>" +
      "</w:document>",
  };

  const parts = [];
  let offset = 0;
  const central = [];
  for (const [name, raw] of Object.entries(files)) {
    const compressed = deflateRawSync(Buffer.from(raw, "utf8"));
    parts.push(localFileHeader(name, compressed));
    central.push(centralDirEntry(name, compressed, offset));
    offset += parts[parts.length - 1].length;
  }
  const centralDir = Buffer.concat(central);
  const eocd = endOfCentralDir(central.length, centralDir.length, offset);
  return Buffer.concat([...parts, centralDir, eocd]);
}

// ─────────────────────────────── fixtures ───────────────────────────────────
const fixtures = {
  "sample.pdf": Buffer.concat([
    Buffer.from(
      "%PDF-1.4\n" +
        "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n" +
        "4 0 obj<</Length 24>>stream\n",
      "utf8",
    ),
    Buffer.from("BT /F1 12 Tf 72 720 Td (E2E) Tj ET\n", "utf8"),
    Buffer.from("endstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF\n", "utf8"),
  ]),

  "sample.doc": Buffer.concat([
    // OLE2 (compound file) magic — real .doc files start with this signature.
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.from(
      "E2E upload fixture (Word 97-2003 document).\n".repeat(20),
      "utf8",
    ),
  ]),

  "sample.docx": buildDocx(),

  "sample.txt": Buffer.from(
    "This is an unsupported file type for document upload.\n",
    "utf8",
  ),

  // 20 MB + 1 byte — exceeds the 20 MB client/server limit (20 * 1024 * 1024).
  "oversized.pdf": Buffer.concat([
    Buffer.from("%PDF-1.4\n", "utf8"),
    Buffer.alloc(20 * 1024 * 1024 - 9, 0x41), // 'A' padding
    Buffer.from("\n%%EOF\n", "utf8"),
  ]),
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, buf] of Object.entries(fixtures)) {
  const path = resolve(OUT_DIR, name);
  writeFileSync(path, buf);
  console.log(`  wrote ${name} (${buf.length} bytes) -> ${path}`);
}
console.log("[generate-upload-fixtures] done.");
