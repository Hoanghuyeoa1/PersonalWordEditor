import { useEffect, useRef } from "react";
import {
  Search,
  Replace,
  ChevronDown,
  ChevronUp,
  X,
  CaseSensitive,
} from "lucide-react";
import { useEditorStore } from "../../stores/editorStore";
import { useFindReplaceStore } from "../../stores/findReplaceStore";
import {
  setSearchTerm,
  setReplaceTerm,
  goToNextMatch,
  goToPreviousMatch,
  replaceCurrentMatch,
  replaceAllMatches,
  clearSearch,
  getSearchState,
} from "../../editor/editorCommands";

export function FindReplaceDialog() {
  const editor = useEditorStore((state) => state.editor);
  const {
    isOpen,
    mode,
    searchTerm,
    replaceTerm,
    caseSensitive,
    matchCount,
    currentIndex,
    statusMessage,
    close,
    setMode,
    setSearchTerm: updateSearchTerm,
    setReplaceTerm: updateReplaceTerm,
    toggleCaseSensitive,
    setResults,
    setStatusMessage,
  } = useFindReplaceStore();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Focus ô tìm kiếm khi mở hộp thoại
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (mode === "replace" && replaceInputRef.current && searchTerm) {
          replaceInputRef.current.focus();
        } else if (searchInputRef.current) {
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, mode]);

  // Đồng bộ kết quả tìm kiếm từ editor state vào store
  const syncResults = () => {
    if (!editor) return;
    const state = getSearchState(editor);
    if (!state) return;
    const count = state.matches.length;
    const current = state.currentIndex;
    setResults(count, current);
  };

  // Cập nhật tìm kiếm khi searchTerm hoặc caseSensitive thay đổi
  useEffect(() => {
    if (!editor || !isOpen) return;
    setSearchTerm(editor, searchTerm, caseSensitive);
    syncResults();
  }, [editor, isOpen, searchTerm, caseSensitive]);

  // Đồng bộ replaceTerm vào editor
  useEffect(() => {
    if (!editor || !isOpen) return;
    setReplaceTerm(editor, replaceTerm);
  }, [editor, isOpen, replaceTerm]);

  // Lắng nghe transaction/selection của editor để cập nhật số lượng kết quả
  useEffect(() => {
    if (!editor || !isOpen) return;
    const handleUpdate = () => {
      syncResults();
    };
    editor.on("transaction", handleUpdate);
    return () => {
      editor.off("transaction", handleUpdate);
    };
  }, [editor, isOpen]);

  // Đóng hộp thoại và dọn dẹp highlight decorations
  const handleClose = () => {
    if (editor) {
      clearSearch(editor);
      editor.commands.focus();
    }
    close();
  };

  // Xử lý phím Enter / Escape trong dialog
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrev();
      } else {
        handleNext();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    }
  };

  const handleReplaceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleReplace();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    }
  };

  const handleNext = () => {
    if (!editor) return;
    if (matchCount === 0) {
      setStatusMessage("Không tìm thấy kết quả");
      return;
    }
    goToNextMatch(editor);
    syncResults();
  };

  const handlePrev = () => {
    if (!editor) return;
    if (matchCount === 0) {
      setStatusMessage("Không tìm thấy kết quả");
      return;
    }
    goToPreviousMatch(editor);
    syncResults();
  };

  const handleReplace = () => {
    if (!editor) return;
    if (matchCount === 0 || currentIndex < 0) {
      setStatusMessage("Không có kết quả nào để thay thế");
      return;
    }
    replaceCurrentMatch(editor, replaceTerm);
    syncResults();
    setStatusMessage("Đã thay thế 1 kết quả");
  };

  const handleReplaceAll = () => {
    if (!editor) return;
    if (matchCount === 0) {
      setStatusMessage("Không có kết quả nào để thay thế");
      return;
    }
    const countBefore = matchCount;
    replaceAllMatches(editor, replaceTerm);
    syncResults();
    setStatusMessage(`Đã thay thế tất cả ${countBefore} kết quả`);
  };

  if (!isOpen) return null;

  return (
    <div
      className="find-replace-floating-panel"
      role="dialog"
      aria-label="Tìm kiếm và Thay thế"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Tab chuyển đổi chế độ */}
      <div className="find-replace-tabs">
        <div className="find-replace-tab-btns">
          <button
            type="button"
            className={`find-replace-tab-btn ${mode === "find" ? "is-active" : ""}`}
            onClick={() => setMode("find")}
          >
            <Search size={13} />
            <span>Tìm kiếm</span>
          </button>
          <button
            type="button"
            className={`find-replace-tab-btn ${mode === "replace" ? "is-active" : ""}`}
            onClick={() => setMode("replace")}
          >
            <Replace size={13} />
            <span>Thay thế</span>
          </button>
        </div>

        <button
          type="button"
          className="find-replace-close-btn"
          onClick={handleClose}
          title="Đóng (Esc)"
          aria-label="Đóng"
        >
          <X size={15} />
        </button>
      </div>

      {/* Hàng 1: Ô nhập tìm kiếm + Điều hướng kết quả */}
      <div className="find-replace-row">
        <div className="find-replace-input-wrapper">
          <Search size={14} className="find-replace-input-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="find-replace-input"
            placeholder="Tìm kiếm..."
            value={searchTerm}
            onChange={(e) => updateSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {searchTerm && (
            <span className="find-replace-counter">
              {matchCount > 0 ? `${currentIndex + 1}/${matchCount}` : "0/0"}
            </span>
          )}
        </div>

        <button
          type="button"
          className={`find-replace-btn icon-only-btn ${caseSensitive ? "is-active" : ""}`}
          onClick={toggleCaseSensitive}
          title="Khớp chữ hoa/thường (Case Sensitive)"
        >
          <CaseSensitive size={15} />
        </button>

        <button
          type="button"
          className="find-replace-btn icon-only-btn"
          onClick={handlePrev}
          disabled={matchCount === 0}
          title="Kết quả trước (Shift+Enter)"
        >
          <ChevronUp size={15} />
        </button>

        <button
          type="button"
          className="find-replace-btn icon-only-btn"
          onClick={handleNext}
          disabled={matchCount === 0}
          title="Kết quả tiếp theo (Enter)"
        >
          <ChevronDown size={15} />
        </button>
      </div>

      {/* Hàng 2: Ô nhập thay thế & Nút thao tác (chỉ hiện khi mode = "replace") */}
      {mode === "replace" && (
        <div className="find-replace-replace-section">
          <div className="find-replace-row">
            <div className="find-replace-input-wrapper">
              <Replace size={14} className="find-replace-input-icon" />
              <input
                ref={replaceInputRef}
                type="text"
                className="find-replace-input"
                placeholder="Thay thế bằng..."
                value={replaceTerm}
                onChange={(e) => updateReplaceTerm(e.target.value)}
                onKeyDown={handleReplaceKeyDown}
              />
            </div>
          </div>

          <div className="find-replace-actions-row">
            <button
              type="button"
              className="find-replace-action-btn"
              onClick={handleReplace}
              disabled={matchCount === 0}
            >
              Thay thế
            </button>
            <button
              type="button"
              className="find-replace-action-btn primary"
              onClick={handleReplaceAll}
              disabled={matchCount === 0}
            >
              Thay thế tất cả
            </button>
          </div>
        </div>
      )}

      {/* Thông báo trạng thái nếu có */}
      {statusMessage && (
        <div className="find-replace-status-bar" role="status">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
