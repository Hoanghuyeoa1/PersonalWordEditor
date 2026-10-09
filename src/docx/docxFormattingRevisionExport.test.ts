import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { DocumentModel, TrackChangeItem } from "../document/documentTypes.ts";
import { DocumentSerializer } from "./mapping/documentSerializer.ts";
import { exportDocumentModelToDocx } from "./export/docxExporter.ts";
import { importDocxToDocumentModel } from "./index.ts";
import { parseXmlString, getFirstChildByLocalName, getDirectChildrenByLocalName, getAttrValue } from "./utils/xmlUtils.ts";
import {
  createDefaultStylesMetadata,
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_EMPHASIS_ID,
  STYLE_STRONG_ID,
} from "../styles/services/builtInStyles.ts";

function createEmptyDoc(contentNodes: any[] = [], trackedChanges: TrackChangeItem[] = []): DocumentModel {
  return {
    metadata: {
      title: "Formatting Revision Export Test",
      author: "Test Suite",
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
      marginPreset: "Normal",
    },
    styles: createDefaultStylesMetadata(),
    content: {
      type: "doc",
      content: contentNodes,
    },
    trackedChanges,
  };
}

test("PHASE 12 — 1. Character formatting export (<w:rPrChange> inside <w:rPr>)", () => {
  const charRevId = "rev-char-font-bold";
  const doc = createEmptyDoc(
    [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Đoạn văn có định dạng được theo dõi.",
            marks: [
              { type: "bold" },
              {
                type: "textStyle",
                attrs: { fontFamily: "Times New Roman", fontSize: 16 },
              },
              {
                type: "trackChange",
                attrs: {
                  id: charRevId,
                  changeType: "format",
                  author: "Alice Reviewer",
                  timestamp: "2026-10-08T10:00:00.000Z",
                  status: "pending",
                  formatChanges: [
                    { property: "fontFamily", before: "Arial", after: "Times New Roman" },
                    { property: "fontSize", before: 12, after: 16 },
                    { property: "bold", before: false, after: true },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
    [
      {
        id: charRevId,
        type: "format",
        author: "Alice Reviewer",
        timestamp: "2026-10-08T10:00:00.000Z",
        status: "pending",
        scope: "character",
        formatChange: {
          scope: "character",
          changes: [
            { property: "fontFamily", before: "Arial", after: "Times New Roman" },
            { property: "fontSize", before: 12, after: 16 },
            { property: "bold", before: false, after: true },
          ],
        },
      },
    ]
  );

  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize(doc);
  const xmlDoc = parseXmlString(serialized.documentXml);

  const pEl = getFirstChildByLocalName(xmlDoc.documentElement, "body")!;
  const paraEl = getFirstChildByLocalName(pEl, "p")!;
  const rEl = getFirstChildByLocalName(paraEl, "r")!;
  assert.ok(rEl, "<w:r> phải tồn tại");

  const rPrEl = getFirstChildByLocalName(rEl, "rpr")!;
  assert.ok(rPrEl, "<w:rPr> phải tồn tại trên run");

  // Kiểm tra current formatting (AFTER)
  const rFontsEl = getFirstChildByLocalName(rPrEl, "rfonts")!;
  assert.equal(getAttrValue(rFontsEl, "ascii"), "Times New Roman");
  const bEl = getFirstChildByLocalName(rPrEl, "b")!;
  assert.ok(bEl, "Current formatting phải có <w:b/>");
  const szEl = getFirstChildByLocalName(rPrEl, "sz")!;
  assert.equal(getAttrValue(szEl, "val"), "32"); // 16pt * 2 = 32 half-pts

  // Kiểm tra <w:rPrChange> là phần tử con của <w:rPr>
  const rPrChangeEl = getFirstChildByLocalName(rPrEl, "rprchange")!;
  assert.ok(rPrChangeEl, "<w:rPrChange> phải nằm bên trong <w:rPr>");
  assert.equal(getAttrValue(rPrChangeEl, "author"), "Alice Reviewer");
  assert.equal(getAttrValue(rPrChangeEl, "date"), "2026-10-08T10:00:00.000Z");
  assert.ok(!isNaN(parseInt(getAttrValue(rPrChangeEl, "id")!, 10)), "w:id phải là số nguyên");

  // Kiểm tra previous formatting bên trong <w:rPrChange><w:rPr> (BEFORE)
  const prevRPrEl = getFirstChildByLocalName(rPrChangeEl, "rpr")!;
  assert.ok(prevRPrEl, "Thẻ con <w:rPr> trước đó phải tồn tại bên trong <w:rPrChange>");

  const prevFontsEl = getFirstChildByLocalName(prevRPrEl, "rfonts")!;
  assert.equal(getAttrValue(prevFontsEl, "ascii"), "Arial", "Font trước đó là Arial");

  const prevBEl = getFirstChildByLocalName(prevRPrEl, "b")!;
  assert.equal(getAttrValue(prevBEl, "val"), "0", "Bold trước đó là false (w:val='0')");

  const prevSzEl = getFirstChildByLocalName(prevRPrEl, "sz")!;
  assert.equal(getAttrValue(prevSzEl, "val"), "24", "Size trước đó là 12pt (24 half-pts)");
});

test("PHASE 12 — 2. Paragraph formatting export (<w:pPrChange> inside <w:pPr>)", () => {
  const paraRevId = "rev-para-align-spacing";
  const doc = createEmptyDoc(
    [
      {
        type: "paragraph",
        attrs: {
          nodeId: "p-node-test-1",
          textAlign: "center",
          spacingBefore: 12,
          spacingAfter: 24,
          lineSpacing: 1.5,
          leftIndent: 36,
          formatRevisions: [
            {
              id: paraRevId,
              type: "format",
              author: "Bob Editor",
              timestamp: "2026-10-08T11:00:00.000Z",
              status: "pending",
              scope: "paragraph",
              formatChange: {
                scope: "paragraph",
                changes: [
                  { property: "textAlign", before: "left", after: "center" },
                  { property: "spacingBefore", before: 0, after: 12 },
                  { property: "spacingAfter", before: 6, after: 24 },
                  { property: "lineSpacing", before: 1.0, after: 1.5 },
                  { property: "leftIndent", before: 0, after: 36 },
                ],
              },
            },
          ],
        },
        content: [
          {
            type: "text",
            text: "Đoạn văn được căn giữa và đổi giãn dòng.",
          },
        ],
      },
    ],
    [
      {
        id: paraRevId,
        type: "format",
        author: "Bob Editor",
        timestamp: "2026-10-08T11:00:00.000Z",
        status: "pending",
        scope: "paragraph",
        targetNodeId: "p-node-test-1",
        formatChange: {
          scope: "paragraph",
          changes: [
            { property: "textAlign", before: "left", after: "center" },
            { property: "spacingBefore", before: 0, after: 12 },
            { property: "spacingAfter", before: 6, after: 24 },
            { property: "lineSpacing", before: 1.0, after: 1.5 },
            { property: "leftIndent", before: 0, after: 36 },
          ],
        },
      },
    ]
  );

  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize(doc);
  const xmlDoc = parseXmlString(serialized.documentXml);

  const bodyEl = getFirstChildByLocalName(xmlDoc.documentElement, "body")!;
  const paraEl = getFirstChildByLocalName(bodyEl, "p")!;
  const pPrEl = getFirstChildByLocalName(paraEl, "ppr")!;
  assert.ok(pPrEl, "<w:pPr> phải tồn tại");

  // Kiểm tra current formatting (AFTER)
  const jcEl = getFirstChildByLocalName(pPrEl, "jc")!;
  assert.equal(getAttrValue(jcEl, "val"), "center");
  const spacingEl = getFirstChildByLocalName(pPrEl, "spacing")!;
  assert.equal(getAttrValue(spacingEl, "before"), "240"); // 12pt * 20 = 240 twips
  assert.equal(getAttrValue(spacingEl, "after"), "480"); // 24pt * 20 = 480 twips
  assert.equal(getAttrValue(spacingEl, "line"), "360"); // 1.5 * 240 = 360

  // Kiểm tra <w:pPrChange> là phần tử con của <w:pPr>
  const pPrChangeEl = getFirstChildByLocalName(pPrEl, "pprchange")!;
  assert.ok(pPrChangeEl, "<w:pPrChange> phải nằm bên trong <w:pPr>");
  assert.equal(getAttrValue(pPrChangeEl, "author"), "Bob Editor");
  assert.equal(getAttrValue(pPrChangeEl, "date"), "2026-10-08T11:00:00.000Z");
  assert.ok(!isNaN(parseInt(getAttrValue(pPrChangeEl, "id")!, 10)), "w:id phải là số nguyên");

  // Kiểm tra previous formatting bên trong <w:pPrChange><w:pPr> (BEFORE)
  const prevPPrEl = getFirstChildByLocalName(pPrChangeEl, "ppr")!;
  assert.ok(prevPPrEl, "Thẻ con <w:pPr> trước đó phải tồn tại bên trong <w:pPrChange>");

  const prevJcEl = getFirstChildByLocalName(prevPPrEl, "jc")!;
  assert.equal(getAttrValue(prevJcEl, "val"), "left", "Căn lề trước đó là left");

  const prevSpacingEl = getFirstChildByLocalName(prevPPrEl, "spacing")!;
  assert.equal(getAttrValue(prevSpacingEl, "after"), "120", "Khoảng cách sau trước đó là 6pt (120 twips)");
  assert.equal(getAttrValue(prevSpacingEl, "line"), "240", "Giãn dòng trước đó là 1.0 (240)");
});

test("PHASE 12 — 3. Style assignment export (Character Style and Paragraph Style revisions)", () => {
  const pStyleRevId = "rev-style-para-heading";
  const cStyleRevId = "rev-style-char-emphasis";

  const doc = createEmptyDoc(
    [
      {
        type: "paragraph",
        attrs: {
          nodeId: "p-node-style-test",
          styleId: STYLE_HEADING_1_ID,
          formatRevisions: [
            {
              id: pStyleRevId,
              type: "format",
              author: "Style Reviewer",
              timestamp: "2026-10-08T12:00:00.000Z",
              status: "pending",
              scope: "style",
              formatChange: {
                scope: "style",
                changes: [
                  { property: "paragraphStyleId", before: STYLE_NORMAL_ID, after: STYLE_HEADING_1_ID },
                ],
              },
            },
          ],
        },
        content: [
          {
            type: "text",
            text: "Tiêu đề có từ nhấn mạnh ",
            marks: [
              {
                type: "characterStyle",
                attrs: { styleId: STYLE_EMPHASIS_ID },
              },
              {
                type: "trackChange",
                attrs: {
                  id: cStyleRevId,
                  changeType: "format",
                  author: "Style Reviewer",
                  timestamp: "2026-10-08T12:00:00.000Z",
                  status: "pending",
                  formatChanges: [
                    { property: "characterStyleId", before: STYLE_STRONG_ID, after: STYLE_EMPHASIS_ID },
                  ],
                },
              },
            ],
          },
        ],
      },
    ]
  );

  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize(doc);
  const xmlDoc = parseXmlString(serialized.documentXml);

  const bodyEl = getFirstChildByLocalName(xmlDoc.documentElement, "body")!;
  const paraEl = getFirstChildByLocalName(bodyEl, "p")!;
  const pPrEl = getFirstChildByLocalName(paraEl, "ppr")!;

  // 1. Kiểm tra Paragraph Style: current vs previous
  const pStyleEl = getFirstChildByLocalName(pPrEl, "pstyle")!;
  assert.equal(getAttrValue(pStyleEl, "val"), "Heading1", "Current style là Heading1");

  const pPrChangeEl = getFirstChildByLocalName(pPrEl, "pprchange")!;
  assert.ok(pPrChangeEl, "Phải có <w:pPrChange>");
  const prevPPrEl = getFirstChildByLocalName(pPrChangeEl, "ppr")!;
  const prevPStyleEl = getFirstChildByLocalName(prevPPrEl, "pstyle");
  if (prevPStyleEl) {
    assert.equal(getAttrValue(prevPStyleEl, "val"), "Normal");
  }

  // 2. Kiểm tra Character Style: current vs previous
  const rEl = getFirstChildByLocalName(paraEl, "r")!;
  const rPrEl = getFirstChildByLocalName(rEl, "rpr")!;
  const rStyleEl = getFirstChildByLocalName(rPrEl, "rstyle")!;
  assert.equal(getAttrValue(rStyleEl, "val"), "Emphasis", "Current character style là Emphasis");

  const rPrChangeEl = getFirstChildByLocalName(rPrEl, "rprchange")!;
  assert.ok(rPrChangeEl, "Phải có <w:rPrChange>");
  const prevRPrEl = getFirstChildByLocalName(rPrChangeEl, "rpr")!;
  const prevRStyleEl = getFirstChildByLocalName(prevRPrEl, "rstyle")!;
  assert.equal(getAttrValue(prevRStyleEl, "val"), "Strong", "Previous character style là Strong");
});

test("PHASE 12 — 4. Stable numeric XML ID mapping and centralized allocator", () => {
  const revUuid1 = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
  const revUuid2 = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

  const doc = createEmptyDoc(
    [
      {
        type: "paragraph",
        attrs: {
          nodeId: "p-uuid-node",
          formatRevisions: [
            {
              id: revUuid1,
              type: "format",
              author: "UUID Author",
              timestamp: "2026-10-08T12:00:00.000Z",
              status: "pending",
              formatChange: {
                scope: "paragraph",
                changes: [{ property: "textAlign", before: "left", after: "right" }],
              },
            },
          ],
        },
        content: [
          {
            type: "text",
            text: "Run 1 chia sẻ cùng revision UUID 2. ",
            marks: [
              {
                type: "trackChange",
                attrs: {
                  id: revUuid2,
                  changeType: "format",
                  author: "UUID Author",
                  timestamp: "2026-10-08T12:00:00.000Z",
                  status: "pending",
                  formatChanges: [{ property: "bold", before: false, after: true }],
                },
              },
            ],
          },
          {
            type: "text",
            text: "Run 2 tiếp tục dùng UUID 2.",
            marks: [
              {
                type: "trackChange",
                attrs: {
                  id: revUuid2,
                  changeType: "format",
                  author: "UUID Author",
                  timestamp: "2026-10-08T12:00:00.000Z",
                  status: "pending",
                  formatChanges: [{ property: "bold", before: false, after: true }],
                },
              },
            ],
          },
        ],
      },
    ]
  );

  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize(doc);
  const xmlDoc = parseXmlString(serialized.documentXml);

  const bodyEl = getFirstChildByLocalName(xmlDoc.documentElement, "body")!;
  const paraEl = getFirstChildByLocalName(bodyEl, "p")!;
  const pPrChangeEl = getFirstChildByLocalName(getFirstChildByLocalName(paraEl, "ppr")!, "pprchange")!;
  const pIdStr = getAttrValue(pPrChangeEl, "id")!;

  assert.ok(/^\d+$/.test(pIdStr), "w:id của paragraph revision phải là chuỗi số nguyên hợp lệ, không phải UUID thô");

  const rEls = getDirectChildrenByLocalName(paraEl, "r");
  assert.equal(rEls.length, 2);

  const r1ChangeEl = getFirstChildByLocalName(getFirstChildByLocalName(rEls[0], "rpr")!, "rprchange")!;
  const r2ChangeEl = getFirstChildByLocalName(getFirstChildByLocalName(rEls[1], "rpr")!, "rprchange")!;

  const r1IdStr = getAttrValue(r1ChangeEl, "id")!;
  const r2IdStr = getAttrValue(r2ChangeEl, "id")!;

  assert.ok(/^\d+$/.test(r1IdStr), "w:id của run 1 phải là chuỗi số nguyên hợp lệ");
  assert.ok(/^\d+$/.test(r2IdStr), "w:id của run 2 phải là chuỗi số nguyên hợp lệ");
  assert.equal(r1IdStr, r2IdStr, "Hai run chia sẻ cùng revision UUID phải có XML numeric ID GIỐNG NHAU");
  assert.notEqual(pIdStr, r1IdStr, "Hai revision khác nhau phải có XML numeric ID KHÁC NHAU");
});

test("PHASE 12 — 5. Lifecycle export: Pending vs Accepted vs Rejected", () => {
  const doc = createEmptyDoc([
    // 1. Pending Character Format: Phải xuất <w:rPrChange>
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Text pending",
          marks: [
            { type: "bold" },
            {
              type: "trackChange",
              attrs: {
                id: "rev-pending-c",
                changeType: "format",
                author: "Tester",
                status: "pending",
                formatChanges: [{ property: "bold", before: false, after: true }],
              },
            },
          ],
        },
      ],
    },
    // 2. Accepted Character Format: Chỉ xuất current formatting, KHÔNG xuất <w:rPrChange>
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Text accepted",
          marks: [
            { type: "bold" },
            {
              type: "trackChange",
              attrs: {
                id: "rev-accepted-c",
                changeType: "format",
                author: "Tester",
                status: "accepted",
                formatChanges: [{ property: "bold", before: false, after: true }],
              },
            },
          ],
        },
      ],
    },
    // 3. Rejected Character Format: Không xuất <w:rPrChange>
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Text rejected",
          marks: [
            {
              type: "trackChange",
              attrs: {
                id: "rev-rejected-c",
                changeType: "format",
                author: "Tester",
                status: "rejected",
                formatChanges: [{ property: "bold", before: false, after: true }],
              },
            },
          ],
        },
      ],
    },
    // 4. Pending Paragraph Format: Phải xuất <w:pPrChange>
    {
      type: "paragraph",
      attrs: {
        textAlign: "center",
        formatRevisions: [
          {
            id: "rev-pending-p",
            type: "format",
            author: "Tester",
            status: "pending",
            formatChange: {
              scope: "paragraph",
              changes: [{ property: "textAlign", before: "left", after: "center" }],
            },
          },
        ],
      },
      content: [{ type: "text", text: "Para pending" }],
    },
    // 5. Accepted Paragraph Format: Chỉ current formatting, KHÔNG xuất <w:pPrChange>
    {
      type: "paragraph",
      attrs: {
        textAlign: "center",
        formatRevisions: [
          {
            id: "rev-accepted-p",
            type: "format",
            author: "Tester",
            status: "accepted",
            formatChange: {
              scope: "paragraph",
              changes: [{ property: "textAlign", before: "left", after: "center" }],
            },
          },
        ],
      },
      content: [{ type: "text", text: "Para accepted" }],
    },
    // 6. Rejected Paragraph Format: Không xuất <w:pPrChange>
    {
      type: "paragraph",
      attrs: {
        textAlign: "left",
        formatRevisions: [
          {
            id: "rev-rejected-p",
            type: "format",
            author: "Tester",
            status: "rejected",
            formatChange: {
              scope: "paragraph",
              changes: [{ property: "textAlign", before: "left", after: "center" }],
            },
          },
        ],
      },
      content: [{ type: "text", text: "Para rejected" }],
    },
  ]);

  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize(doc);
  const xmlDoc = parseXmlString(serialized.documentXml);

  const bodyEl = getFirstChildByLocalName(xmlDoc.documentElement, "body")!;
  const pEls = getDirectChildrenByLocalName(bodyEl, "p");

  // P1: Pending character -> Phải có rPrChange
  const r1Pr = getFirstChildByLocalName(getFirstChildByLocalName(pEls[0], "r")!, "rpr")!;
  assert.ok(getFirstChildByLocalName(r1Pr, "rprchange"), "P1 phải có <w:rPrChange>");

  // P2: Accepted character -> Có bold, KHÔNG có rPrChange
  const r2Pr = getFirstChildByLocalName(getFirstChildByLocalName(pEls[1], "r")!, "rpr")!;
  assert.ok(getFirstChildByLocalName(r2Pr, "b"), "P2 phải giữ <w:b/>");
  assert.equal(getFirstChildByLocalName(r2Pr, "rprchange"), null, "P2 KHÔNG được có <w:rPrChange>");

  // P3: Rejected character -> KHÔNG có rPrChange
  const r3Pr = getFirstChildByLocalName(getFirstChildByLocalName(pEls[2], "r")!, "rpr");
  if (r3Pr) {
    assert.equal(getFirstChildByLocalName(r3Pr, "rprchange"), null, "P3 KHÔNG được có <w:rPrChange>");
  }

  // P4: Pending paragraph -> Phải có pPrChange
  const p4Pr = getFirstChildByLocalName(pEls[3], "ppr")!;
  assert.ok(getFirstChildByLocalName(p4Pr, "pprchange"), "P4 phải có <w:pPrChange>");

  // P5: Accepted paragraph -> Có jc=center, KHÔNG có pPrChange
  const p5Pr = getFirstChildByLocalName(pEls[4], "ppr")!;
  assert.equal(getAttrValue(getFirstChildByLocalName(p5Pr, "jc")!, "val"), "center");
  assert.equal(getFirstChildByLocalName(p5Pr, "pprchange"), null, "P5 KHÔNG được có <w:pPrChange>");

  // P6: Rejected paragraph -> KHÔNG có pPrChange
  const p6Pr = getFirstChildByLocalName(pEls[5], "ppr")!;
  assert.equal(getFirstChildByLocalName(p6Pr, "pprchange"), null, "P6 KHÔNG được có <w:pPrChange>");
});

test("PHASE 12 — 6. Mixed revisions: w:ins, w:del, w:rPrChange, w:pPrChange co-exist", () => {
  const doc = createEmptyDoc([
    {
      type: "paragraph",
      attrs: {
        textAlign: "justify",
        formatRevisions: [
          {
            id: "rev-p-mixed",
            type: "format",
            author: "Mixed Author",
            status: "pending",
            formatChange: {
              scope: "paragraph",
              changes: [{ property: "textAlign", before: "left", after: "justify" }],
            },
          },
        ],
      },
      content: [
        // Run 1: Text bình thường có Format Revision
        {
          type: "text",
          text: "Đoạn thường có format. ",
          marks: [
            { type: "bold" },
            {
              type: "trackChange",
              attrs: {
                id: "rev-c-fmt",
                changeType: "format",
                author: "Mixed Author",
                status: "pending",
                formatChanges: [{ property: "bold", before: false, after: true }],
              },
            },
          ],
        },
        // Run 2: Tracked Insert CÓ Format Revision
        {
          type: "text",
          text: "Chèn thêm và in nghiêng. ",
          marks: [
            { type: "italic" },
            {
              type: "trackChange",
              attrs: {
                id: "rev-ins-1",
                changeType: "insert",
                author: "Insert Author",
                status: "pending",
              },
            },
            {
              type: "trackChange",
              attrs: {
                id: "rev-fmt-on-ins",
                changeType: "format",
                author: "Mixed Author",
                status: "pending",
                formatChanges: [{ property: "italic", before: false, after: true }],
              },
            },
          ],
        },
        // Run 3: Tracked Delete CÓ Format Revision
        {
          type: "text",
          text: "Đã xóa có gạch ngang.",
          marks: [
            { type: "strike" },
            {
              type: "trackChange",
              attrs: {
                id: "rev-del-1",
                changeType: "delete",
                author: "Delete Author",
                status: "pending",
              },
            },
            {
              type: "trackChange",
              attrs: {
                id: "rev-fmt-on-del",
                changeType: "format",
                author: "Mixed Author",
                status: "pending",
                formatChanges: [{ property: "strike", before: false, after: true }],
              },
            },
          ],
        },
      ],
    },
  ]);

  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize(doc);
  const xmlDoc = parseXmlString(serialized.documentXml);

  const bodyEl = getFirstChildByLocalName(xmlDoc.documentElement, "body")!;
  const paraEl = getFirstChildByLocalName(bodyEl, "p")!;

  // 1. Paragraph có <w:pPrChange>
  const pPr = getFirstChildByLocalName(paraEl, "ppr")!;
  assert.ok(getFirstChildByLocalName(pPr, "pprchange"), "Paragraph phải có <w:pPrChange>");

  // 2. Run 1: Là <w:r> trực tiếp, chứa <w:rPrChange>
  const r1 = getFirstChildByLocalName(paraEl, "r")!;
  assert.ok(r1, "Run 1 phải là <w:r>");
  const r1Pr = getFirstChildByLocalName(r1, "rpr")!;
  assert.ok(getFirstChildByLocalName(r1Pr, "rprchange"), "Run 1 phải có <w:rPrChange>");

  // 3. Run 2: Được bọc trong <w:ins>, bên trong chứa <w:r><w:rPr><w:rPrChange/></w:rPr></w:r>
  const insEl = getFirstChildByLocalName(paraEl, "ins")!;
  assert.ok(insEl, "Run 2 phải được bọc trong <w:ins>");
  const insR = getFirstChildByLocalName(insEl, "r")!;
  const insRPr = getFirstChildByLocalName(insR, "rpr")!;
  assert.ok(getFirstChildByLocalName(insRPr, "rprchange"), "Run bên trong <w:ins> phải chứa <w:rPrChange>");

  // 4. Run 3: Được bọc trong <w:del>, bên trong chứa <w:r><w:rPr><w:rPrChange/></w:rPr><w:delText/></w:r>
  const delEl = getFirstChildByLocalName(paraEl, "del")!;
  assert.ok(delEl, "Run 3 phải được bọc trong <w:del>");
  const delR = getFirstChildByLocalName(delEl, "r")!;
  const delRPr = getFirstChildByLocalName(delR, "rpr")!;
  assert.ok(getFirstChildByLocalName(delRPr, "rprchange"), "Run bên trong <w:del> phải chứa <w:rPrChange>");
  assert.ok(getFirstChildByLocalName(delR, "deltext"), "Run bên trong <w:del> phải chứa <w:delText>");
});

test("PHASE 12 — 7. Coexistence: Comments, Hyperlinks, and Tables", () => {
  const commentId = "c-101";
  const doc: DocumentModel = {
    ...createEmptyDoc(),
    comments: [
      {
        id: commentId,
        author: "Commenter",
        date: "2026-10-08T12:00:00.000Z",
        content: "Đây là bình luận trên text có format revision",
        resolved: false,
      },
    ],
    content: {
      type: "doc",
      content: [
        // Paragraph 1: Hyperlink chứa run có format revision
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Liên kết Google",
              marks: [
                { type: "link", attrs: { href: "https://google.com" } },
                { type: "bold" },
                {
                  type: "trackChange",
                  attrs: {
                    id: "rev-link-fmt",
                    changeType: "format",
                    author: "Alice",
                    status: "pending",
                    formatChanges: [{ property: "bold", before: false, after: true }],
                  },
                },
              ],
            },
          ],
        },
        // Paragraph 2: Comment bọc quanh text có format revision
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Văn bản vừa có comment vừa có format change.",
              marks: [
                { type: "comment", attrs: { commentId } },
                { type: "italic" },
                {
                  type: "trackChange",
                  attrs: {
                    id: "rev-com-fmt",
                    changeType: "format",
                    author: "Bob",
                    status: "pending",
                    formatChanges: [{ property: "italic", before: false, after: true }],
                  },
                },
              ],
            },
          ],
        },
        // Paragraph 3: Bảng có paragraph cell chứa format revision
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      attrs: {
                        textAlign: "center",
                        formatRevisions: [
                          {
                            id: "rev-cell-p-fmt",
                            type: "format",
                            author: "Carol",
                            status: "pending",
                            formatChange: {
                              scope: "paragraph",
                              changes: [{ property: "textAlign", before: "left", after: "center" }],
                            },
                          },
                        ],
                      },
                      content: [{ type: "text", text: "Ô bảng có format revision" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize(doc);
  const xmlDoc = parseXmlString(serialized.documentXml);

  const bodyEl = getFirstChildByLocalName(xmlDoc.documentElement, "body")!;
  const pEls = getDirectChildrenByLocalName(bodyEl, "p");

  // 1. Kiểm tra hyperlink trong paragraph 1
  const hyperlinkEl = getFirstChildByLocalName(pEls[0], "hyperlink");
  assert.ok(hyperlinkEl, "<w:hyperlink> phải được tạo ra");
  const linkR = getFirstChildByLocalName(hyperlinkEl, "r")!;
  const linkRPr = getFirstChildByLocalName(linkR, "rpr")!;
  assert.ok(getFirstChildByLocalName(linkRPr, "rprchange"), "Run bên trong hyperlink phải chứa <w:rPrChange>");

  // 2. Kiểm tra comments trong paragraph 2
  assert.ok(serialized.commentsXml, "comments.xml phải được tạo ra");
  const commentStart = getFirstChildByLocalName(pEls[1], "commentrangestart");
  assert.ok(commentStart, "<w:commentRangeStart> phải tồn tại");

  // 3. Kiểm tra table cell paragraph
  const tblEl = getFirstChildByLocalName(bodyEl, "tbl");
  assert.ok(tblEl, "<w:tbl> phải tồn tại");
  const tcEl = getFirstChildByLocalName(getFirstChildByLocalName(tblEl, "tr")!, "tc")!;
  const cellPEl = getFirstChildByLocalName(tcEl, "p")!;
  const cellPPr = getFirstChildByLocalName(cellPEl, "ppr")!;
  assert.ok(getFirstChildByLocalName(cellPPr, "pprchange"), "Paragraph trong ô bảng phải có <w:pPrChange>");
});

test("PHASE 12 — 8. Malformed revision fallback and missing metadata resilience", () => {
  const doc = createEmptyDoc([
    {
      type: "paragraph",
      attrs: {
        // Thiếu author, date, diffs rỗng
        formatRevisions: [
          {
            id: "", // Rỗng ID
            type: "format",
            author: "",
            timestamp: "",
            status: "pending",
            formatChange: {
              scope: "paragraph",
              changes: [],
            },
          },
        ],
      },
      content: [
        {
          type: "text",
          text: "Fallback test run",
          marks: [
            {
              type: "trackChange",
              attrs: {
                id: "",
                changeType: "format",
                author: "",
                timestamp: "",
                status: "pending",
                formatChanges: [],
              },
            },
          ],
        },
      ],
    },
  ]);

  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize(doc);

  // Không được throw lỗi và XML phải parseable
  assert.doesNotThrow(() => {
    const xmlDoc = parseXmlString(serialized.documentXml);
    const bodyEl = getFirstChildByLocalName(xmlDoc.documentElement, "body")!;
    const pEl = getFirstChildByLocalName(bodyEl, "p")!;

    const pPr = getFirstChildByLocalName(pEl, "ppr")!;
    const pPrChange = getFirstChildByLocalName(pPr, "pprchange")!;
    assert.ok(pPrChange, "<w:pPrChange> vẫn phải được tạo ra fallback");
    assert.ok(getAttrValue(pPrChange, "author"), "Phải có tác giả fallback");
    assert.ok(getAttrValue(pPrChange, "date"), "Phải có ngày fallback");

    const rEl = getFirstChildByLocalName(pEl, "r")!;
    const rPr = getFirstChildByLocalName(rEl, "rpr")!;
    const rPrChange = getFirstChildByLocalName(rPr, "rprchange")!;
    assert.ok(rPrChange, "<w:rPrChange> vẫn phải được tạo ra fallback");
  });
});

test("PHASE 12 — 9. Package validity: ZIP, XML well-formedness, Content_Types, Relationships", async () => {
  const doc = createEmptyDoc([
    {
      type: "paragraph",
      attrs: {
        textAlign: "center",
        formatRevisions: [
          {
            id: "pkg-rev-para",
            type: "format",
            author: "Pkg Tester",
            status: "pending",
            formatChange: {
              scope: "paragraph",
              changes: [{ property: "textAlign", before: "left", after: "center" }],
            },
          },
        ],
      },
      content: [
        {
          type: "text",
          text: "Text in package test.",
          marks: [
            { type: "bold" },
            {
              type: "trackChange",
              attrs: {
                id: "pkg-rev-char",
                changeType: "format",
                author: "Pkg Tester",
                status: "pending",
                formatChanges: [{ property: "bold", before: false, after: true }],
              },
            },
          ],
        },
      ],
    },
  ]);

  // Xuất ra tệp binary ZIP .docx chuẩn
  const docxBytes = await exportDocumentModelToDocx(doc);
  assert.ok(docxBytes.length > 0, "Mảng byte DOCX không được rỗng");

  // Nạp lại ZIP bằng JSZip
  const zip = await JSZip.loadAsync(docxBytes);
  assert.ok(zip.file("word/document.xml"), "word/document.xml phải có trong ZIP");
  assert.ok(zip.file("[Content_Types].xml"), "[Content_Types].xml phải có trong ZIP");
  assert.ok(zip.file("word/_rels/document.xml.rels"), "word/_rels/document.xml.rels phải có trong ZIP");

  const docXmlStr = await zip.file("word/document.xml")!.async("string");
  const xmlDoc = parseXmlString(docXmlStr);
  assert.equal(xmlDoc.documentElement.nodeName.toLowerCase(), "w:document");

  // Kiểm tra element placement và namespaces
  const bodyEl = getFirstChildByLocalName(xmlDoc.documentElement, "body")!;
  const pEl = getFirstChildByLocalName(bodyEl, "p")!;
  const pPr = getFirstChildByLocalName(pEl, "ppr")!;
  assert.ok(getFirstChildByLocalName(pPr, "pprchange"), "<w:pPrChange> phải có trong gói ZIP");

  const rEl = getFirstChildByLocalName(pEl, "r")!;
  const rPr = getFirstChildByLocalName(rEl, "rpr")!;
  assert.ok(getFirstChildByLocalName(rPr, "rprchange"), "<w:rPrChange> phải có trong gói ZIP");
});

test("PHASE 12 — 10. Full Semantic Round-trip: Import -> Partial Review (Accept/Reject) -> Export -> Re-import", async () => {
  // 1. Tạo document XML ban đầu với cả Character Formatting Revision và Paragraph Formatting Revision
  const sourceDoc = createEmptyDoc([
    // Paragraph 1: Sẽ giữ pending character revision
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Văn bản giữ pending font: ",
        },
        {
          type: "text",
          text: "Chữ giữ pending.",
          marks: [
            {
              type: "textStyle",
              attrs: { fontFamily: "Consolas", fontSize: 18 },
            },
            {
              type: "trackChange",
              attrs: {
                id: "roundtrip-keep-char",
                changeType: "format",
                author: "Author A",
                timestamp: "2026-10-08T09:00:00.000Z",
                status: "pending",
                formatChanges: [
                  { property: "fontFamily", before: "Calibri", after: "Consolas" },
                  { property: "fontSize", before: 11, after: 18 },
                ],
              },
            },
          ],
        },
      ],
    },
    // Paragraph 2: Sẽ ACCEPT character revision
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Chữ sẽ được Accept bold.",
          marks: [
            { type: "bold" },
            {
              type: "trackChange",
              attrs: {
                id: "roundtrip-accept-char",
                changeType: "format",
                author: "Author B",
                timestamp: "2026-10-08T09:05:00.000Z",
                status: "pending",
                formatChanges: [{ property: "bold", before: false, after: true }],
              },
            },
          ],
        },
      ],
    },
    // Paragraph 3: Sẽ giữ PENDING paragraph revision
    {
      type: "paragraph",
      attrs: {
        nodeId: "p-node-keep-para",
        textAlign: "center",
        formatRevisions: [
          {
            id: "roundtrip-keep-para",
            type: "format",
            author: "Author C",
            timestamp: "2026-10-08T09:10:00.000Z",
            status: "pending",
            scope: "paragraph",
            formatChange: {
              scope: "paragraph",
              changes: [{ property: "textAlign", before: "left", after: "center" }],
            },
          },
        ],
      },
      content: [{ type: "text", text: "Đoạn giữ pending căn giữa." }],
    },
    // Paragraph 4: Sẽ REJECT paragraph revision
    {
      type: "paragraph",
      attrs: {
        nodeId: "p-node-reject-para",
        textAlign: "right",
        formatRevisions: [
          {
            id: "roundtrip-reject-para",
            type: "format",
            author: "Author D",
            timestamp: "2026-10-08T09:15:00.000Z",
            status: "pending",
            scope: "paragraph",
            formatChange: {
              scope: "paragraph",
              changes: [{ property: "textAlign", before: "left", after: "right" }],
            },
          },
        ],
      },
      content: [{ type: "text", text: "Đoạn sẽ reject căn phải." }],
    },
  ]);

  // Xuất sang DOCX lần đầu
  const initialDocxBytes = await exportDocumentModelToDocx(sourceDoc);

  // Nhập vào (Import)
  const importedDocResult = await importDocxToDocumentModel(initialDocxBytes);
  assert.equal(importedDocResult.success, true);
  const importedModel = importedDocResult.document!;

  // Thực hiện duyệt một số:
  // 1. Accept revision trên paragraph 2
  const p2 = importedModel.content.content?.[1];
  assert.ok(p2, "Paragraph 2 phải tồn tại");
  const p2Run = p2.content?.[0];
  const p2TcMark = p2Run?.marks?.find((m: any) => m.type === "trackChange");
  assert.ok(p2TcMark, "Mark trackChange trên paragraph 2 phải tồn tại");
  p2TcMark.attrs = { ...p2TcMark.attrs, status: "accepted" };

  // 2. Reject revision trên paragraph 4 (khôi phục căn lề trước đó là left và đổi status thành rejected)
  const p4 = importedModel.content.content?.[3];
  assert.ok(p4, "Paragraph 4 phải tồn tại");
  p4.attrs = { ...p4.attrs, textAlign: "left" };
  const p4Rev = p4.attrs.formatRevisions?.[0];
  assert.ok(p4Rev, "Paragraph revision trên paragraph 4 phải tồn tại");
  p4Rev.status = "rejected";

  // Cập nhật lại trackedChanges map trên document model
  importedModel.trackedChanges = importedModel.trackedChanges?.map((tc) => {
    if (tc.id === p2TcMark.attrs.id) return { ...tc, status: "accepted" };
    if (tc.id === p4Rev.id) return { ...tc, status: "rejected" };
    return tc;
  });

  // Xuất sang DOCX lần hai (Re-export sau khi duyệt một phần)
  const reExportedDocxBytes = await exportDocumentModelToDocx(importedModel);

  // Nhập lại lần hai (Re-import) để xác minh tính toàn vẹn
  const reImportedResult = await importDocxToDocumentModel(reExportedDocxBytes);
  assert.equal(reImportedResult.success, true);
  const reImportedModel = reImportedResult.document!;

  // XÁC MINH CÁC REVISION CÒN LẠI VÀ ĐÃ DUYỆT:
  // 1. Paragraph 1: Revision giữ pending vẫn phải CÒN NGUYÊN và pending
  const reP1 = reImportedModel.content.content?.[0];
  const reP1Run = reP1?.content?.find((c: any) => c.text === "Chữ giữ pending.");
  assert.ok(reP1Run, "Run 1 giữ pending phải tồn tại");
  const reP1Mark = reP1Run.marks?.find((m: any) => m.type === "trackChange" && m.attrs?.changeType === "format");
  assert.ok(reP1Mark, "Pending character format revision trên P1 phải được bảo toàn");
  assert.equal(reP1Mark.attrs?.author, "Author A");
  const fontDiff = reP1Mark.attrs?.formatChanges?.find((d: any) => d.property === "fontFamily");
  assert.ok(fontDiff, "Diff fontFamily phải còn nguyên");
  assert.equal(fontDiff.before, "Calibri");
  assert.equal(fontDiff.after, "Consolas");

  // 2. Paragraph 2: Revision đã Accept KHÔNG còn xuất hiện như revision nữa, nhưng giữ bold
  const reP2 = reImportedModel.content.content?.[1];
  const reP2Run = reP2?.content?.[0];
  const reP2FormatMark = reP2Run?.marks?.find((m: any) => m.type === "trackChange" && m.attrs?.changeType === "format");
  assert.equal(reP2FormatMark, undefined, "Accepted revision KHÔNG được tái xuất hiện dưới dạng revision");
  assert.ok(reP2Run?.marks?.some((m: any) => m.type === "bold"), "Định dạng bold của accepted revision phải được giữ nguyên");

  // 3. Paragraph 3: Revision paragraph giữ pending vẫn phải CÒN NGUYÊN
  const reP3 = reImportedModel.content.content?.[2];
  assert.ok(reP3?.attrs?.formatRevisions && reP3.attrs.formatRevisions.length > 0, "Paragraph 3 phải còn formatRevisions");
  const reP3Rev = reP3.attrs.formatRevisions[0];
  assert.equal(reP3Rev.author, "Author C");
  const alignDiff = reP3Rev.formatChange?.changes?.find((d: any) => d.property === "textAlign");
  assert.ok(alignDiff, "Diff textAlign trên P3 phải còn nguyên");
  assert.equal(alignDiff.before, "left");
  assert.equal(alignDiff.after, "center");

  // 4. Paragraph 4: Revision paragraph đã Reject KHÔNG còn revision nữa, giữ alignment là left
  const reP4 = reImportedModel.content.content?.[3];
  assert.equal(reP4?.attrs?.formatRevisions?.length || 0, 0, "Rejected paragraph revision KHÔNG được tái xuất hiện");
  assert.equal(reP4?.attrs?.textAlign || "left", "left", "Căn lề của đoạn bị reject phải là left");
});
