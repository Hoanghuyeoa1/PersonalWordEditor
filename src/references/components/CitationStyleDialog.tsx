import { useState, useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { X, Tag, Check } from "lucide-react";
import { CitationService } from "../services/citationService.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import type { CitationStyle } from "../types/citationTypes.ts";

interface CitationStyleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editor: Editor | null;
}

export function CitationStyleDialog({
  isOpen,
  onClose,
  editor,
}: CitationStyleDialogProps) {
  const currentStyle = useDocumentStore((state) => state.citationStyle);
  const [selectedStyle, setSelectedStyle] = useState<CitationStyle>("apa");

  useEffect(() => {
    if (isOpen) {
      setSelectedStyle(currentStyle || "apa");
    }
  }, [isOpen, currentStyle]);

  if (!isOpen) return null;

  const handleApply = () => {
    useDocumentStore.getState().setCitationStyle(selectedStyle);

    if (editor) {
      // Cập nhật lại Thư mục tài liệu
      CitationService.updateBibliography(editor);
      // Buộc editor render lại các NodeViews
      editor.view.dispatch(editor.state.tr);
    }

    onClose();
  };

  return (
    <div
      className="dialog-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dialog-container"
        style={{
          width: 500,
          maxWidth: "90vw",
          backgroundColor: "#fff",
          borderRadius: 8,
          boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Tag size={20} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              Chọn Kiểu Trích dẫn (Citation Style)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "#64748b",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
            Chọn quy cách định dạng chuẩn cho các dấu trích dẫn trong bài và danh mục tài liệu tham khảo:
          </p>

          {/* Option APA */}
          <div
            onClick={() => setSelectedStyle("apa")}
            style={{
              padding: 14,
              borderRadius: 6,
              border: selectedStyle === "apa" ? "2px solid #2563eb" : "1px solid #e2e8f0",
              backgroundColor: selectedStyle === "apa" ? "#eff6ff" : "#fff",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>
                APA 7th Edition (Tác giả, Năm)
              </div>
              {selectedStyle === "apa" && <Check size={18} color="#2563eb" />}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>
              <strong>Trích dẫn trong bài:</strong> <code>(Nguyễn Văn A, 2024)</code>
              <br />
              <strong>Thư mục tham khảo:</strong> Sắp xếp theo thứ tự bảng chữ cái tên tác giả.
            </div>
          </div>

          {/* Option IEEE */}
          <div
            onClick={() => setSelectedStyle("ieee")}
            style={{
              padding: 14,
              borderRadius: 6,
              border: selectedStyle === "ieee" ? "2px solid #2563eb" : "1px solid #e2e8f0",
              backgroundColor: selectedStyle === "ieee" ? "#eff6ff" : "#fff",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>
                IEEE (Chỉ số số theo thứ tự xuất hiện)
              </div>
              {selectedStyle === "ieee" && <Check size={18} color="#2563eb" />}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>
              <strong>Trích dẫn trong bài:</strong> <code>[1]</code>, <code>[2]</code>
              <br />
              <strong>Thư mục tham khảo:</strong> Đánh số liên tục [1], [2]... theo thứ tự trích dẫn trong văn bản.
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "6px 14px",
                borderRadius: 4,
                border: "1px solid #cbd5e1",
                backgroundColor: "#fff",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleApply}
              style={{
                padding: "6px 18px",
                borderRadius: 4,
                border: "none",
                backgroundColor: "#2563eb",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Áp dụng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
