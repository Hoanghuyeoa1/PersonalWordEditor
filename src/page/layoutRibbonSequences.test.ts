import test from "node:test";
import assert from "node:assert/strict";
import {
  PAPER_DIMENSIONS,
  MARGIN_PRESETS,
  SUPPORTED_PAPER_SIZES,
  DEFAULT_PAGE_SETTINGS,
} from "./services/pageConstants.ts";
import {
  getPageDimensions,
  getPageCssVariables,
  detectMarginPreset,
  validateAndNormalizePageSettings,
} from "./services/pageSettingsService.ts";
import {
  createInitialDocument,
  updateDocumentContent,
  updateDocumentPageSettings,
} from "../document/documentModel.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import { useDocumentStore } from "../stores/documentStore.ts";

test("Phase 2.3 Paper Size Sequence: A4 -> A3 -> Letter -> Legal transitions correctly", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  // Khởi đầu: A4 Portrait mặc định, clean state
  assert.strictEqual(useDocumentStore.getState().pageSettings.paperSize, "A4");
  assert.strictEqual(useDocumentStore.getState().pageSettings.orientation, "portrait");
  assert.strictEqual(useDocumentStore.getState().isDirty, false);
  let dims = getPageDimensions("A4", "portrait");
  assert.deepStrictEqual(dims, { width: 210, height: 297 });

  // 1. Chuyển sang A3
  useDocumentStore.getState().updatePageSettings({ paperSize: "A3" });
  assert.strictEqual(useDocumentStore.getState().pageSettings.paperSize, "A3");
  dims = getPageDimensions("A3", "portrait");
  assert.deepStrictEqual(dims, { width: 297, height: 420 });
  assert.strictEqual(useDocumentStore.getState().isDirty, true);

  // 2. Chuyển sang Letter
  useDocumentStore.getState().updatePageSettings({ paperSize: "Letter" });
  assert.strictEqual(useDocumentStore.getState().pageSettings.paperSize, "Letter");
  dims = getPageDimensions("Letter", "portrait");
  assert.deepStrictEqual(dims, { width: 215.9, height: 279.4 });
  assert.strictEqual(useDocumentStore.getState().isDirty, true);

  // 3. Chuyển sang Legal
  useDocumentStore.getState().updatePageSettings({ paperSize: "Legal" });
  assert.strictEqual(useDocumentStore.getState().pageSettings.paperSize, "Legal");
  dims = getPageDimensions("Legal", "portrait");
  assert.deepStrictEqual(dims, { width: 215.9, height: 355.6 });
  assert.strictEqual(useDocumentStore.getState().isDirty, true);

  // 4. Quay về A4 (khớp lại snapshot ban đầu)
  useDocumentStore.getState().updatePageSettings({ paperSize: "A4" });
  assert.strictEqual(useDocumentStore.getState().pageSettings.paperSize, "A4");
  dims = getPageDimensions("A4", "portrait");
  assert.deepStrictEqual(dims, { width: 210, height: 297 });
  assert.strictEqual(useDocumentStore.getState().isDirty, false);
});

test("Phase 2.3 Orientation Sequence: Portrait <-> Landscape toggles and updates dirty state", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  // 1. Khởi đầu Portrait
  assert.strictEqual(useDocumentStore.getState().pageSettings.orientation, "portrait");
  assert.strictEqual(useDocumentStore.getState().isDirty, false);
  let dims = getPageDimensions("A4", "portrait");
  assert.ok(dims.width < dims.height);

  // 2. Chuyển sang Landscape
  useDocumentStore.getState().updatePageSettings({ orientation: "landscape" });
  assert.strictEqual(useDocumentStore.getState().pageSettings.orientation, "landscape");
  assert.strictEqual(useDocumentStore.getState().isDirty, true);
  dims = getPageDimensions("A4", "landscape");
  assert.ok(dims.width > dims.height);
  assert.deepStrictEqual(dims, { width: 297, height: 210 });

  // 3. Đổi lại Portrait -> khôi phục snapshot ban đầu
  useDocumentStore.getState().updatePageSettings({ orientation: "portrait" });
  assert.strictEqual(useDocumentStore.getState().pageSettings.orientation, "portrait");
  assert.strictEqual(useDocumentStore.getState().isDirty, false);
  dims = getPageDimensions("A4", "portrait");
  assert.deepStrictEqual(dims, { width: 210, height: 297 });

  // 4. Thử Landscape với khổ A3
  useDocumentStore.getState().updatePageSettings({ paperSize: "A3", orientation: "landscape" });
  assert.strictEqual(useDocumentStore.getState().pageSettings.paperSize, "A3");
  assert.strictEqual(useDocumentStore.getState().pageSettings.orientation, "landscape");
  assert.strictEqual(useDocumentStore.getState().isDirty, true);
  dims = getPageDimensions("A3", "landscape");
  assert.deepStrictEqual(dims, { width: 420, height: 297 });
});

test("Phase 2.3 Margin Presets Sequence: Normal -> Narrow -> Wide transitions accurately", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  // 1. Khởi đầu Normal (25.4 mm)
  assert.strictEqual(useDocumentStore.getState().pageSettings.marginPreset, "Normal");
  assert.deepStrictEqual(
    useDocumentStore.getState().pageSettings.margins,
    MARGIN_PRESETS.Normal
  );
  assert.strictEqual(useDocumentStore.getState().isDirty, false);

  // 2. Chuyển sang Narrow (12.7 mm)
  useDocumentStore.getState().updatePageSettings({
    margins: { ...MARGIN_PRESETS.Narrow },
    marginPreset: "Narrow",
  });
  assert.strictEqual(useDocumentStore.getState().pageSettings.marginPreset, "Narrow");
  assert.deepStrictEqual(
    useDocumentStore.getState().pageSettings.margins,
    MARGIN_PRESETS.Narrow
  );
  assert.strictEqual(useDocumentStore.getState().isDirty, true);

  // 3. Chuyển sang Wide (25.4 mm trên/dưới, 50.8 mm hai bên)
  useDocumentStore.getState().updatePageSettings({
    margins: { ...MARGIN_PRESETS.Wide },
    marginPreset: "Wide",
  });
  assert.strictEqual(useDocumentStore.getState().pageSettings.marginPreset, "Wide");
  assert.deepStrictEqual(
    useDocumentStore.getState().pageSettings.margins,
    MARGIN_PRESETS.Wide
  );
  assert.strictEqual(useDocumentStore.getState().isDirty, true);

  // 4. Quay lại Normal -> khôi phục snapshot ban đầu
  useDocumentStore.getState().updatePageSettings({
    margins: { ...MARGIN_PRESETS.Normal },
    marginPreset: "Normal",
  });
  assert.strictEqual(useDocumentStore.getState().pageSettings.marginPreset, "Normal");
  assert.strictEqual(useDocumentStore.getState().isDirty, false);
});

test("Phase 2.3 Save/Open Round-Trip with Combined Layout Sequences", () => {
  const testConfigurations = [
    {
      name: "A3 Landscape Narrow",
      paperSize: "A3" as const,
      orientation: "landscape" as const,
      marginPreset: "Narrow" as const,
      margins: MARGIN_PRESETS.Narrow,
      expectedWidth: 420,
      expectedHeight: 297,
    },
    {
      name: "Legal Portrait Wide",
      paperSize: "Legal" as const,
      orientation: "portrait" as const,
      marginPreset: "Wide" as const,
      margins: MARGIN_PRESETS.Wide,
      expectedWidth: 215.9,
      expectedHeight: 355.6,
    },
    {
      name: "Letter Landscape Normal",
      paperSize: "Letter" as const,
      orientation: "landscape" as const,
      marginPreset: "Normal" as const,
      margins: MARGIN_PRESETS.Normal,
      expectedWidth: 279.4,
      expectedHeight: 215.9,
    },
    {
      name: "A4 Portrait Normal",
      paperSize: "A4" as const,
      orientation: "portrait" as const,
      marginPreset: "Normal" as const,
      margins: MARGIN_PRESETS.Normal,
      expectedWidth: 210,
      expectedHeight: 297,
    },
  ];

  for (const config of testConfigurations) {
    const store = useDocumentStore.getState();
    store.resetDocument();

    // 1. Áp dụng cấu hình từ Ribbon
    store.updatePageSettings({
      paperSize: config.paperSize,
      orientation: config.orientation,
      margins: { ...config.margins },
      marginPreset: config.marginPreset,
    });

    assert.strictEqual(
      useDocumentStore.getState().isDirty,
      config.paperSize !== "A4" || config.orientation !== "portrait" || config.marginPreset !== "Normal"
    );

    // 2. Lưu tệp (Serialize và markSaved)
    const currentDoc = useDocumentStore.getState().document;
    const mwdString = serializeDocumentToMwd(currentDoc);
    useDocumentStore.getState().markSaved("C:\\TestPath\\doc.mwd");

    // Sau khi lưu: isDirty phải trở về false
    assert.strictEqual(useDocumentStore.getState().isDirty, false);

    // 3. Mở lại tệp (Deserialize và setDocument)
    const deserializeResult = deserializeMwdToDocument(mwdString);
    assert.strictEqual(deserializeResult.success, true);
    if (deserializeResult.success) {
      useDocumentStore.getState().setDocument(deserializeResult.document, "C:\\TestPath\\doc.mwd");

      // Sau khi mở: isDirty phải là false
      assert.strictEqual(useDocumentStore.getState().isDirty, false);

      // Kiểm tra toàn vẹn cấu hình
      const restored = useDocumentStore.getState().pageSettings;
      assert.strictEqual(restored.paperSize, config.paperSize);
      assert.strictEqual(restored.orientation, config.orientation);
      assert.strictEqual(restored.marginPreset, config.marginPreset);
      assert.deepStrictEqual(restored.margins, config.margins);

      // Kích thước vật lý render
      const restoredDims = getPageDimensions(restored.paperSize, restored.orientation);
      assert.strictEqual(restoredDims.width, config.expectedWidth);
      assert.strictEqual(restoredDims.height, config.expectedHeight);
    }
  }
});

test("Phase 2.3 Constants Integrity: Ribbon uses centralized constants without duplication", () => {
  // Kiểm tra 4 khổ giấy được hỗ trợ
  assert.deepStrictEqual(SUPPORTED_PAPER_SIZES, ["A4", "A3", "Letter", "Legal"]);

  // Kiểm tra kích thước chính xác
  assert.deepStrictEqual(PAPER_DIMENSIONS.A4, { width: 210, height: 297 });
  assert.deepStrictEqual(PAPER_DIMENSIONS.A3, { width: 297, height: 420 });
  assert.deepStrictEqual(PAPER_DIMENSIONS.Letter, { width: 215.9, height: 279.4 });
  assert.deepStrictEqual(PAPER_DIMENSIONS.Legal, { width: 215.9, height: 355.6 });

  // Kiểm tra 3 presets lề
  assert.deepStrictEqual(MARGIN_PRESETS.Normal, {
    top: 25.4,
    right: 25.4,
    bottom: 25.4,
    left: 25.4,
  });
  assert.deepStrictEqual(MARGIN_PRESETS.Narrow, {
    top: 12.7,
    right: 12.7,
    bottom: 12.7,
    left: 12.7,
  });
  assert.deepStrictEqual(MARGIN_PRESETS.Wide, {
    top: 25.4,
    right: 50.8,
    bottom: 25.4,
    left: 50.8,
  });

  // Tự động nhận diện preset
  assert.strictEqual(detectMarginPreset(MARGIN_PRESETS.Normal), "Normal");
  assert.strictEqual(detectMarginPreset(MARGIN_PRESETS.Narrow), "Narrow");
  assert.strictEqual(detectMarginPreset(MARGIN_PRESETS.Wide), "Wide");
});

test("Phase 2.3 Regression: Layout changes do not modify document content AST", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const sampleAst = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Kiểm tra Tính toàn vẹn của Đoạn văn" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Văn bản mẫu với " },
          { type: "text", marks: [{ type: "italic" }], text: "chữ nghiêng" },
          { type: "text", text: " và " },
          { type: "text", marks: [{ type: "bold" }], text: "chữ đậm" },
          { type: "text", text: "." },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Mục 1" }] }],
          },
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Mục 2" }] }],
          },
        ],
      },
    ],
  };

  store.updateContent(sampleAst);

  // Đổi liên tiếp Size, Orientation, Margins
  store.updatePageSettings({ paperSize: "A3" });
  store.updatePageSettings({ orientation: "landscape" });
  store.updatePageSettings({ margins: MARGIN_PRESETS.Narrow, marginPreset: "Narrow" });

  // Nội dung AST của document phải giữ nguyên vẹn 100%
  assert.deepStrictEqual(useDocumentStore.getState().document.content, sampleAst);
  assert.strictEqual(useDocumentStore.getState().pageSettings.paperSize, "A3");
  assert.strictEqual(useDocumentStore.getState().pageSettings.orientation, "landscape");
  assert.strictEqual(useDocumentStore.getState().pageSettings.marginPreset, "Narrow");
});
