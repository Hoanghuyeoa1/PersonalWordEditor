import test from "node:test";
import assert from "node:assert/strict";
import {
  PAPER_DIMENSIONS,
  SUPPORTED_PAPER_SIZES,
} from "./services/pageConstants.ts";
import {
  getPageDimensions,
  getPageCssVariables,
} from "./services/pageSettingsService.ts";
import type { PaperSizeName } from "./types/pageTypes.ts";
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
import { useZoomStore } from "../stores/zoomStore.ts";

test("Phase 2.2 Paper Size: Portrait orientation satisfies width < height for all presets", () => {
  for (const size of SUPPORTED_PAPER_SIZES) {
    const dim = getPageDimensions(size, "portrait");
    assert.ok(
      dim.width < dim.height,
      `Portrait ${size} must have width (${dim.width}) < height (${dim.height})`
    );
    // Kiểm tra kích thước chính xác theo mm chuẩn
    const base = PAPER_DIMENSIONS[size];
    assert.strictEqual(dim.width, Math.min(base.width, base.height));
    assert.strictEqual(dim.height, Math.max(base.width, base.height));
  }
});

test("Phase 2.2 Paper Size: Landscape orientation satisfies width > height for all presets", () => {
  for (const size of SUPPORTED_PAPER_SIZES) {
    const dim = getPageDimensions(size, "landscape");
    assert.ok(
      dim.width > dim.height,
      `Landscape ${size} must have width (${dim.width}) > height (${dim.height})`
    );
    const base = PAPER_DIMENSIONS[size];
    assert.strictEqual(dim.width, Math.max(base.width, base.height));
    assert.strictEqual(dim.height, Math.min(base.width, base.height));
  }
});

test("Phase 2.2 Paper Size: Specific dimensions for A4, A3, Letter, Legal", () => {
  // A4: 210 x 297 mm
  const a4Portrait = getPageDimensions("A4", "portrait");
  assert.deepStrictEqual(a4Portrait, { width: 210, height: 297 });
  const a4Landscape = getPageDimensions("A4", "landscape");
  assert.deepStrictEqual(a4Landscape, { width: 297, height: 210 });

  // A3: 297 x 420 mm
  const a3Portrait = getPageDimensions("A3", "portrait");
  assert.deepStrictEqual(a3Portrait, { width: 297, height: 420 });
  const a3Landscape = getPageDimensions("A3", "landscape");
  assert.deepStrictEqual(a3Landscape, { width: 420, height: 297 });

  // Letter: 215.9 x 279.4 mm
  const letterPortrait = getPageDimensions("Letter", "portrait");
  assert.deepStrictEqual(letterPortrait, { width: 215.9, height: 279.4 });
  const letterLandscape = getPageDimensions("Letter", "landscape");
  assert.deepStrictEqual(letterLandscape, { width: 279.4, height: 215.9 });

  // Legal: 215.9 x 355.6 mm
  const legalPortrait = getPageDimensions("Legal", "portrait");
  assert.deepStrictEqual(legalPortrait, { width: 215.9, height: 355.6 });
  const legalLandscape = getPageDimensions("Legal", "landscape");
  assert.deepStrictEqual(legalLandscape, { width: 355.6, height: 215.9 });
});

test("Phase 2.2 Renderer Logic: CSS variables reflect orientation and paper size accurately", () => {
  // A3 Landscape
  const a3LandscapeVars = getPageCssVariables({
    paperSize: "A3",
    orientation: "landscape",
    margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
    marginPreset: "Normal",
  });
  assert.strictEqual(a3LandscapeVars["--page-width"], "420mm");
  assert.strictEqual(a3LandscapeVars["--page-height"], "297mm");
  assert.strictEqual(a3LandscapeVars["--page-margin-top"], "25.4mm");

  // Legal Portrait
  const legalPortraitVars = getPageCssVariables({
    paperSize: "Legal",
    orientation: "portrait",
    margins: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
    marginPreset: "Narrow",
  });
  assert.strictEqual(legalPortraitVars["--page-width"], "215.9mm");
  assert.strictEqual(legalPortraitVars["--page-height"], "355.6mm");
  assert.strictEqual(legalPortraitVars["--page-margin-left"], "12.7mm");
});

test("Phase 2.2 State & Dirty: Changing orientation triggers isDirty state in documentStore", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  // Ban đầu sau reset: isDirty = false
  assert.strictEqual(useDocumentStore.getState().isDirty, false);
  assert.strictEqual(useDocumentStore.getState().pageSettings.orientation, "portrait");

  // Đổi sang landscape
  useDocumentStore.getState().updatePageSettings({ orientation: "landscape" });

  assert.strictEqual(useDocumentStore.getState().isDirty, true);
  assert.strictEqual(useDocumentStore.getState().pageSettings.orientation, "landscape");
  assert.strictEqual(
    useDocumentStore.getState().document.pageSettings?.orientation,
    "landscape"
  );

  // Đổi lại portrait (quay về snapshot ban đầu)
  useDocumentStore.getState().updatePageSettings({ orientation: "portrait" });
  assert.strictEqual(useDocumentStore.getState().isDirty, false);
});

test("Phase 2.2 State & Dirty: Changing paper size triggers isDirty state in documentStore", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  assert.strictEqual(useDocumentStore.getState().isDirty, false);
  assert.strictEqual(useDocumentStore.getState().pageSettings.paperSize, "A4");

  // Đổi sang A3
  useDocumentStore.getState().updatePageSettings({ paperSize: "A3" });
  assert.strictEqual(useDocumentStore.getState().isDirty, true);
  assert.strictEqual(useDocumentStore.getState().pageSettings.paperSize, "A3");

  // Đổi sang Letter
  useDocumentStore.getState().updatePageSettings({ paperSize: "Letter" });
  assert.strictEqual(useDocumentStore.getState().isDirty, true);
  assert.strictEqual(useDocumentStore.getState().pageSettings.paperSize, "Letter");

  // Quay về A4
  useDocumentStore.getState().updatePageSettings({ paperSize: "A4" });
  assert.strictEqual(useDocumentStore.getState().isDirty, false);
});

test("Phase 2.2 Save/Open Round-Trip: A3 Landscape persists through file serialization", () => {
  const initial = createInitialDocument();
  const configuredDoc = updateDocumentPageSettings(initial, {
    paperSize: "A3",
    orientation: "landscape",
    margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
    marginPreset: "Normal",
  });

  // Serialize to .mwd string
  const mwdString = serializeDocumentToMwd(configuredDoc);
  const parsed = JSON.parse(mwdString);
  assert.strictEqual(parsed.pageSettings?.paperSize, "A3");
  assert.strictEqual(parsed.pageSettings?.orientation, "landscape");

  // Deserialize from .mwd string
  const result = deserializeMwdToDocument(mwdString);
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.ok(result.document.pageSettings);
    assert.strictEqual(result.document.pageSettings.paperSize, "A3");
    assert.strictEqual(result.document.pageSettings.orientation, "landscape");

    const restoredDimensions = getPageDimensions(
      result.document.pageSettings.paperSize,
      result.document.pageSettings.orientation
    );
    assert.strictEqual(restoredDimensions.width, 420);
    assert.strictEqual(restoredDimensions.height, 297);
  }
});

test("Phase 2.2 Save/Open Round-Trip: Letter Landscape, Legal Portrait, A4 Portrait", () => {
  const testCases: Array<{ size: PaperSizeName; orientation: "portrait" | "landscape" }> = [
    { size: "Letter", orientation: "landscape" },
    { size: "Legal", orientation: "portrait" },
    { size: "A4", orientation: "portrait" },
  ];

  for (const tc of testCases) {
    const doc = updateDocumentPageSettings(createInitialDocument(), {
      paperSize: tc.size,
      orientation: tc.orientation,
      margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
      marginPreset: "Normal",
    });

    const mwdString = serializeDocumentToMwd(doc);
    const result = deserializeMwdToDocument(mwdString);

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.document.pageSettings?.paperSize, tc.size);
      assert.strictEqual(result.document.pageSettings?.orientation, tc.orientation);

      const dims = getPageDimensions(
        result.document.pageSettings!.paperSize,
        result.document.pageSettings!.orientation
      );
      if (tc.orientation === "landscape") {
        assert.ok(dims.width > dims.height);
      } else {
        assert.ok(dims.width < dims.height);
      }
    }
  }
});

test("Phase 2.2 Zoom Isolation: Visual zoom changes do not alter physical document model", () => {
  const docStore = useDocumentStore.getState();
  docStore.resetDocument();
  docStore.updatePageSettings({ paperSize: "A3", orientation: "landscape" });

  const zoomStore = useZoomStore.getState();
  zoomStore.resetZoom();
  assert.strictEqual(useZoomStore.getState().zoom, 100);

  // Phóng to 150% rồi 200%
  zoomStore.setZoom(150);
  assert.strictEqual(useZoomStore.getState().zoom, 150);
  zoomStore.setZoom(200);
  assert.strictEqual(useZoomStore.getState().zoom, 200);

  // Khổ giấy vật lý trong documentStore hoàn toàn giữ nguyên A3 Landscape (420 x 297 mm)
  const currentSettings = useDocumentStore.getState().pageSettings;
  assert.strictEqual(currentSettings.paperSize, "A3");
  assert.strictEqual(currentSettings.orientation, "landscape");

  const physicalDim = getPageDimensions(
    currentSettings.paperSize,
    currentSettings.orientation
  );
  assert.strictEqual(physicalDim.width, 420);
  assert.strictEqual(physicalDim.height, 297);

  // Đặt lại zoom 100%
  zoomStore.resetZoom();
  assert.strictEqual(useZoomStore.getState().zoom, 100);
});

test("Phase 2.2 Regression: Changing paper settings preserves document content AST", () => {
  const initial = createInitialDocument();
  const sampleContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Báo cáo Kế hoạch A3" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Đoạn văn quan trọng với " },
          { type: "text", marks: [{ type: "bold" }], text: "chữ in đậm" },
        ],
      },
    ],
  };

  const updatedDoc = updateDocumentContent(initial, sampleContent);
  const docWithA3 = updateDocumentPageSettings(updatedDoc, {
    paperSize: "A3",
    orientation: "landscape",
  });

  // Kiểm tra nội dung text, headings, marks không bị mất hoặc thay đổi
  assert.deepStrictEqual(docWithA3.content, sampleContent);
  assert.strictEqual(docWithA3.pageSettings?.paperSize, "A3");
  assert.strictEqual(docWithA3.pageSettings?.orientation, "landscape");
});
