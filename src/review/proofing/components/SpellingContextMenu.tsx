import { useEffect, useRef } from "react";
import {
  Check,
  EyeOff,
  BookPlus,
  AlertCircle,
  X,
  BookOpen,
  SlidersHorizontal,
} from "lucide-react";
import { useReviewStore } from "../../../stores/reviewStore.ts";
import { useEditorStore } from "../../../stores/editorStore.ts";
import type { GrammarIssue, SpellingIssue } from "../proofingTypes.ts";

export function SpellingContextMenu() {
  const issue = useReviewStore((state) => state.activeSpellingIssue);
  const pos = useReviewStore((state) => state.spellingContextMenuPos);
  const closeMenu = useReviewStore((state) => state.closeSpellingContextMenu);
  const editor = useEditorStore((state) => state.editor);

  const menuRef = useRef<HTMLDivElement>(null);

  // Đóng khi click ngoài hoặc nhấn Escape
  useEffect(() => {
    if (!issue || !pos) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [issue, pos, closeMenu]);

  if (!issue || !pos || !editor) return null;

  // Giới hạn vị trí nằm gọn trong viewport
  const left = Math.min(pos.x, window.innerWidth - 260);
  const top = Math.min(pos.y, window.innerHeight - 300);

  const isGrammar = issue.type === "grammar";
  const grammarIssue = isGrammar ? (issue as GrammarIssue) : null;
  const spellingIssue = !isGrammar ? (issue as SpellingIssue) : null;

  const handleApplySuggestion = (suggestion: string) => {
    editor.commands.applyProofingSuggestion(issue, suggestion);
    closeMenu();
    editor.commands.focus();
  };

  const handleIgnoreOnce = () => {
    if (isGrammar) {
      editor.commands.ignoreGrammarIssue(issue.id);
    } else {
      editor.commands.ignoreSpellingOnce(issue.id);
    }
    closeMenu();
    editor.commands.focus();
  };

  const handleIgnoreAll = () => {
    if (spellingIssue) {
      editor.commands.ignoreSpellingAll(spellingIssue.word);
    }
    closeMenu();
    editor.commands.focus();
  };

  const handleAddToDictionary = () => {
    if (spellingIssue) {
      editor.commands.addWordToUserDictionary(spellingIssue.word);
    }
    closeMenu();
    editor.commands.focus();
  };

  const handleDisableRule = () => {
    if (grammarIssue) {
      editor.commands.disableGrammarRule(grammarIssue.ruleId);
    }
    closeMenu();
    editor.commands.focus();
  };

  return (
    <div
      ref={menuRef}
      className="spelling-context-menu"
      style={{
        position: "fixed",
        top: `${top}px`,
        left: `${left}px`,
        zIndex: 9999,
        background: "#ffffff",
        border: "1px solid #cbd5e1",
        borderRadius: "8px",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.06)",
        minWidth: "220px",
        maxWidth: "320px",
        padding: "6px 0",
        fontSize: "13px",
        color: "#1e293b",
      }}
      role="menu"
      aria-label={isGrammar ? `Sửa lỗi ngữ pháp: ${grammarIssue?.ruleName}` : `Sửa lỗi chính tả: ${spellingIssue?.word}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px 6px 10px",
          borderBottom: "1px solid #f1f5f9",
          color: isGrammar ? "#2563eb" : "#dc2626",
          fontWeight: 600,
          fontSize: "12px",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          {isGrammar ? <BookOpen size={14} /> : <AlertCircle size={14} />}
          <span>{isGrammar ? (grammarIssue?.ruleName ?? "Ngữ pháp & Dấu câu") : spellingIssue?.word}</span>
        </span>
        <button
          type="button"
          onClick={closeMenu}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "#94a3b8",
            display: "inline-flex",
            padding: "2px",
          }}
          aria-label="Đóng"
        >
          <X size={13} />
        </button>
      </div>

      {/* Thông điệp giải thích lỗi (đặc biệt hữu ích cho Grammar) */}
      {isGrammar && (
        <div
          style={{
            padding: "8px 12px 6px 12px",
            fontSize: "12px",
            color: "#475569",
            lineHeight: "1.4",
            background: "#f8fafc",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          {issue.message}
        </div>
      )}

      {/* Danh sách gợi ý thay thế */}
      <div style={{ padding: "4px 0" }}>
        {issue.suggestions && issue.suggestions.length > 0 ? (
          issue.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="spelling-menu-item"
              onClick={() => handleApplySuggestion(suggestion)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 12px",
                border: "none",
                background: "transparent",
                textAlign: "left",
                cursor: "pointer",
                fontWeight: 600,
                color: isGrammar ? "#1d4ed8" : "#1d4ed8",
                fontSize: "13px",
              }}
            >
              <Check size={14} style={{ color: "#2563eb", flexShrink: 0 }} />
              <span>
                {suggestion === " " ? (
                  <span style={{ fontStyle: "italic", color: "#64748b" }}>[Một khoảng trắng]</span>
                ) : (
                  suggestion
                )}
              </span>
            </button>
          ))
        ) : (
          <div
            style={{
              padding: "6px 12px",
              color: "#94a3b8",
              fontStyle: "italic",
              fontSize: "12px",
            }}
          >
            Không có gợi ý thay thế
          </div>
        )}
      </div>

      <div style={{ height: "1px", background: "#f1f5f9", margin: "4px 0" }} />

      {/* Hành động bỏ qua & tùy chỉnh */}
      <div style={{ padding: "2px 0" }}>
        <button
          type="button"
          className="spelling-menu-item"
          onClick={handleIgnoreOnce}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "5px 12px",
            border: "none",
            background: "transparent",
            textAlign: "left",
            cursor: "pointer",
            color: "#475569",
            fontSize: "12.5px",
          }}
        >
          <EyeOff size={13} style={{ color: "#64748b", flexShrink: 0 }} />
          <span>Bỏ qua lỗi này</span>
        </button>

        {!isGrammar && (
          <>
            <button
              type="button"
              className="spelling-menu-item"
              onClick={handleIgnoreAll}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "5px 12px",
                border: "none",
                background: "transparent",
                textAlign: "left",
                cursor: "pointer",
                color: "#475569",
                fontSize: "12.5px",
              }}
            >
              <EyeOff size={13} style={{ color: "#64748b", flexShrink: 0 }} />
              <span>Bỏ qua tất cả</span>
            </button>

            <button
              type="button"
              className="spelling-menu-item"
              onClick={handleAddToDictionary}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "5px 12px",
                border: "none",
                background: "transparent",
                textAlign: "left",
                cursor: "pointer",
                color: "#475569",
                fontSize: "12.5px",
              }}
            >
              <BookPlus size={13} style={{ color: "#16a34a", flexShrink: 0 }} />
              <span>Thêm vào từ điển</span>
            </button>
          </>
        )}

        {isGrammar && (
          <button
            type="button"
            className="spelling-menu-item"
            onClick={handleDisableRule}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "5px 12px",
              border: "none",
              background: "transparent",
              textAlign: "left",
              cursor: "pointer",
              color: "#64748b",
              fontSize: "12px",
            }}
          >
            <SlidersHorizontal size={13} style={{ color: "#94a3b8", flexShrink: 0 }} />
            <span>Tắt quy tắc &quot;{grammarIssue?.ruleName}&quot;</span>
          </button>
        )}
      </div>
    </div>
  );
}

// Alias cho ngữ nghĩa chung
export const ProofingContextMenu = SpellingContextMenu;
