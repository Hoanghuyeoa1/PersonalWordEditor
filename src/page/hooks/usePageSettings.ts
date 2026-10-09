import { useDocumentStore } from "../../stores/documentStore.ts";
import { useEditorStore } from "../../stores/editorStore.ts";
import {
  getPageDimensions,
  getPageCssVariables,
} from "../services/pageSettingsService.ts";
import type {
  PaperSizeName,
  PageOrientation,
  PageMargins,
  PageSettings,
} from "../types/pageTypes.ts";
import { MARGIN_PRESETS } from "../services/pageConstants.ts";
import { updateSectionSettings } from "../../editor/editorCommands.ts";

/**
 * Hook quản lý PageSettings trong toàn ứng dụng,
 * kết nối đồng bộ với Zustand DocumentStore và Section Model (Phase 2.7).
 */
export function usePageSettings() {
  const pageSettings = useDocumentStore((state) => state.pageSettings);
  const currentSectionIndex = useDocumentStore((state) => state.currentSectionIndex);
  const storeUpdatePageSettings = useDocumentStore((state) => state.updatePageSettings);
  const editor = useEditorStore((state) => state.editor);

  const applySettings = (partial: Partial<PageSettings>) => {
    // 1. Cập nhật state trong documentStore (hỗ trợ cả headless tests và UI)
    storeUpdatePageSettings(partial);

    // 2. Nếu có active editor và đang ở Section k > 1, cập nhật trực tiếp vào node ProseMirror
    if (editor && currentSectionIndex > 1) {
      updateSectionSettings(editor, currentSectionIndex, partial, pageSettings);
    }
  };

  const setPaperSize = (paperSize: PaperSizeName) => {
    applySettings({ paperSize });
  };

  const setOrientation = (orientation: PageOrientation) => {
    applySettings({ orientation });
  };

  const setMarginPreset = (preset: "Normal" | "Narrow" | "Wide") => {
    applySettings({
      margins: { ...MARGIN_PRESETS[preset] },
      marginPreset: preset,
    });
  };

  const setMargins = (margins: PageMargins) => {
    applySettings({ margins });
  };

  const dimensions = getPageDimensions(
    pageSettings.paperSize,
    pageSettings.orientation
  );
  const cssVariables = getPageCssVariables(pageSettings);

  return {
    pageSettings,
    currentSectionIndex,
    updatePageSettings: applySettings,
    setPaperSize,
    setOrientation,
    setMarginPreset,
    setMargins,
    dimensions,
    cssVariables,
  };
}

