import React, { useState } from "react";
import { ListOrdered, Check, X, RefreshCw } from "lucide-react";
import type { TocConfig, TocPreset } from "../types/tocTypes.ts";

interface TocDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (config: TocConfig) => void;
  onUpdate?: (options?: { updatePageNumbersOnly?: boolean }) => void;
  hasExistingToc?: boolean;
}

export const TocDialog: React.FC<TocDialogProps> = ({
  isOpen,
  onClose,
  onInsert,
  onUpdate,
  hasExistingToc = false,
}) => {
  const [title, setTitle] = useState("Mục lục");
  const [preset, setPreset] = useState<TocPreset>("classic");
  const [includeH1, setIncludeH1] = useState(true);
  const [includeH2, setIncludeH2] = useState(true);
  const [includeH3, setIncludeH3] = useState(true);
  const [showPageNumbers, setShowPageNumbers] = useState(true);
  const [rightAlign, setRightAlign] = useState(true);

  if (!isOpen) return null;

  const handleInsert = () => {
    const levels: (1 | 2 | 3)[] = [];
    if (includeH1) levels.push(1);
    if (includeH2) levels.push(2);
    if (includeH3) levels.push(3);

    // Mặc định ít nhất level 1 nếu bỏ chọn tất cả
    const finalLevels: (1 | 2 | 3)[] = levels.length > 0 ? levels : [1];

    onInsert({
      title: title.trim() || "Mục lục",
      preset,
      includedLevels: finalLevels,
      showPageNumbers,
      rightAlignPageNumbers: rightAlign,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-base">
            <ListOrdered className="w-5 h-5" />
            <span>{hasExistingToc ? "Tùy chỉnh Mục lục" : "Chèn Mục lục tự động"}</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-sm text-slate-700 dark:text-slate-300">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Tiêu đề mục lục
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              placeholder="Mục lục"
            />
          </div>

          {/* Heading Levels */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Các cấp độ đề mục hiển thị
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeH1}
                  onChange={(e) => setIncludeH1(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-medium text-xs">Heading 1</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeH2}
                  onChange={(e) => setIncludeH2(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-medium text-xs">Heading 2</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeH3}
                  onChange={(e) => setIncludeH3(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-medium text-xs">Heading 3</span>
              </label>
            </div>
          </div>

          {/* Preset Styles */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Phong cách hiển thị
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["classic", "modern", "formal"] as TocPreset[]).map((p) => (
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
                  {p === "classic" ? "Cổ điển (Classic)" : p === "modern" ? "Hiện đại (Modern)" : "Trang trọng (Formal)"}
                </button>
              ))}
            </div>
          </div>

          {/* Page numbers options */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showPageNumbers}
                onChange={(e) => setShowPageNumbers(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>Hiển thị số trang</span>
            </label>

            {showPageNumbers && (
              <label className="flex items-center gap-2 cursor-pointer ml-5 text-xs text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={rightAlign}
                  onChange={(e) => setRightAlign(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Căn phải số trang kèm dấu chấm nối (dot leaders)</span>
              </label>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          {hasExistingToc && onUpdate ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onUpdate({ updatePageNumbersOnly: false });
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Cập nhật toàn bộ (F9)</span>
              </button>
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleInsert}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5 transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{hasExistingToc ? "Lưu thiết lập" : "Chèn Mục lục"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
