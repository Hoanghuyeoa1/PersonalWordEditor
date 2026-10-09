import React, { useState, useEffect, useMemo } from "react";
import type { Editor } from "@tiptap/core";
import { ListOrdered, Check, X, AlertCircle } from "lucide-react";
import { CaptionListService } from "../services/captionListService.ts";
import type {
  CaptionListConfig,
  CaptionListPreset,
} from "../types/captionListTypes.ts";

export interface CaptionListDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editor: Editor | null;
  onInsert: (config: CaptionListConfig) => void;
  initialLabel?: string;
  initialTitle?: string;
}

/**
 * CaptionListDialog - Hộp thoại Chèn Danh mục Chú thích (Table of Figures / List of Captions)
 *
 * Cho phép người dùng:
 * 1. Chọn loại nhãn: Figure (Hình), Table (Bảng), Equation (Công thức), hoặc các custom labels có sẵn trong tài liệu.
 * 2. Nhập tiêu đề tùy chỉnh (mặc định: "Danh mục hình").
 * 3. Tùy chọn hiển thị số trang và căn phải số trang kèm dấu chấm nối.
 * 4. Lựa chọn phong cách hiển thị (Classic, Modern, Formal).
 * 5. Xem trước (Live Preview) số lượng và danh sách các mục sẽ xuất hiện.
 */
export const CaptionListDialog: React.FC<CaptionListDialogProps> = ({
  isOpen,
  onClose,
  editor,
  onInsert,
  initialLabel = "Figure",
  initialTitle = "Danh mục hình",
}) => {
  const [label, setLabel] = useState<string>(initialLabel);
  const [isCustomLabel, setIsCustomLabel] = useState<boolean>(false);
  const [customLabelInput, setCustomLabelInput] = useState<string>("");
  const [title, setTitle] = useState<string>(initialTitle);
  const [preset, setPreset] = useState<CaptionListPreset>("classic");
  const [showPageNumbers, setShowPageNumbers] = useState<boolean>(true);
  const [rightAlign, setRightAlign] = useState<boolean>(true);

  // Khám phá động tất cả các nhãn đang có trong tài liệu (không scan DOM)
  const availableLabels = useMemo(() => {
    if (!isOpen || !editor) return ["Figure", "Table", "Equation"];
    return CaptionListService.getAvailableLabels(editor.state.doc);
  }, [isOpen, editor]);

  // Khởi tạo lại trạng thái mỗi khi mở hộp thoại
  useEffect(() => {
    if (isOpen) {
      setLabel(initialLabel);
      setIsCustomLabel(false);
      setCustomLabelInput("");
      setTitle(initialTitle || CaptionListService.getDefaultTitle(initialLabel));
      setPreset("classic");
      setShowPageNumbers(true);
      setRightAlign(true);
    }
  }, [isOpen, initialLabel, initialTitle]);

  const activeLabel = isCustomLabel
    ? customLabelInput.trim() || "Figure"
    : label;

  // Tự động cập nhật tiêu đề khi đổi nhãn nếu tiêu đề đang ở dạng mặc định
  const handleLabelChange = (newLabel: string) => {
    if (newLabel === "custom") {
      setIsCustomLabel(true);
      if (!customLabelInput) {
        setTitle("Danh mục mới");
      }
    } else {
      setIsCustomLabel(false);
      setLabel(newLabel);
      setTitle(CaptionListService.getDefaultTitle(newLabel));
    }
  };

  // Trích xuất các mục xem trước (Live Preview)
  const previewEntries = useMemo(() => {
    if (!editor || !isOpen) return [];
    return CaptionListService.generateEntries(editor.state.doc, activeLabel);
  }, [editor, isOpen, activeLabel]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalLabel = activeLabel.trim() || "Figure";
    const finalTitle = title.trim() || CaptionListService.getDefaultTitle(finalLabel);

    onInsert({
      label: finalLabel,
      title: finalTitle,
      preset,
      showPageNumbers,
      rightAlignPageNumbers: rightAlign,
    });
    onClose();
  };

  return (
    <div
      className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="caption-list-dialog-title"
    >
      <div className="dialog-content bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-base">
            <ListOrdered className="w-5 h-5" />
            <span id="caption-list-dialog-title">Chèn Danh mục Hình ảnh & Đối tượng</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-sm text-slate-700 dark:text-slate-300">
          {/* Label Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Loại đối tượng (Nhãn chú thích)
            </label>
            <div className="flex gap-2">
              <select
                value={isCustomLabel ? "custom" : label}
                onChange={(e) => handleLabelChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              >
                {availableLabels.map((lbl) => (
                  <option key={lbl} value={lbl}>
                    {lbl === "Figure"
                      ? "Figure (Hình ảnh minh họa)"
                      : lbl === "Table"
                      ? "Table (Bảng biểu)"
                      : lbl === "Equation"
                      ? "Equation (Công thức toán)"
                      : `${lbl} (Nhãn tùy chỉnh trong bài)`}
                  </option>
                ))}
                <option value="custom">Nhãn tùy chỉnh khác...</option>
              </select>
            </div>
            {isCustomLabel && (
              <input
                type="text"
                placeholder="Nhập tên nhãn (ví dụ: Biểu đồ, Bản đồ)"
                value={customLabelInput}
                onChange={(e) => {
                  setCustomLabelInput(e.target.value);
                  setTitle(CaptionListService.getDefaultTitle(e.target.value));
                }}
                autoFocus
                className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Tiêu đề danh mục
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              placeholder="Danh mục hình"
            />
          </div>

          {/* Presets */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Phong cách hiển thị
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["classic", "modern", "formal"] as CaptionListPreset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium capitalize transition-all ${
                    preset === p
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-500 dark:text-indigo-300 shadow-sm"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {p === "classic"
                    ? "Cổ điển (Classic)"
                    : p === "modern"
                    ? "Hiện đại (Modern)"
                    : "Trang trọng (Formal)"}
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showPageNumbers}
                onChange={(e) => setShowPageNumbers(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs font-medium">Hiển thị số trang</span>
            </label>

            {showPageNumbers && (
              <label className="flex items-center gap-2 cursor-pointer pl-6">
                <input
                  type="checkbox"
                  checked={rightAlign}
                  onChange={(e) => setRightAlign(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Căn lề phải số trang với dấu chấm nối (...)
                </span>
              </label>
            )}
          </div>

          {/* Preview Box */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Xem trước ({previewEntries.length} mục tìm thấy)
              </span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 text-xs space-y-1.5 max-h-32 overflow-y-auto">
              {previewEntries.length === 0 ? (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 py-1">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Chưa có chú thích nào cho nhãn &quot;{activeLabel}&quot; trong tài liệu. Danh mục vẫn sẽ được tạo và cập nhật khi bạn thêm chú thích.</span>
                </div>
              ) : (
                previewEntries.slice(0, 3).map((entry, idx) => (
                  <div key={idx} className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                    <span className="truncate pr-2 font-medium">
                      {entry.fullTitle || `${entry.labelAndNumber} — ${entry.text}`}
                    </span>
                    {showPageNumbers && (
                      <span className="flex-shrink-0 text-slate-400 font-mono">
                        {rightAlign ? `..... ${entry.pageNumber ?? 1}` : `${entry.pageNumber ?? 1}`}
                      </span>
                    )}
                  </div>
                ))
              )}
              {previewEntries.length > 3 && (
                <div className="text-center text-slate-400 text-[11px] pt-1 italic">
                  + {previewEntries.length - 3} mục khác...
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Chèn danh mục</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
