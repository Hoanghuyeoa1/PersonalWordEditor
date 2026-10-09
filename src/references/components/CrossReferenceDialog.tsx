import React, { useState, useEffect, useMemo } from "react";
import type { Editor } from "@tiptap/core";
import { CrossReferenceService } from "../services/crossReferenceService.ts";
import type {
  CrossReferenceFormat,
  CrossReferenceTargetType,
  InsertCrossReferenceOptions,
} from "../types/crossReferenceTypes.ts";
import { ExternalLink, Check, X, AlertCircle } from "lucide-react";

interface CrossReferenceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editor: Editor | null;
  onInsert: (options: InsertCrossReferenceOptions) => void;
}

export const CrossReferenceDialog: React.FC<CrossReferenceDialogProps> = ({
  isOpen,
  onClose,
  editor,
  onInsert,
}) => {
  const [referenceType, setReferenceType] = useState<CrossReferenceTargetType>("heading");
  const [format, setFormat] = useState<CrossReferenceFormat>("text");
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  // Lấy danh sách mục tiêu khả dụng từ tài liệu hiện tại (không dùng cache cũ)
  const targets = useMemo(() => {
    if (!isOpen || !editor) return [];
    return CrossReferenceService.getAvailableTargets(editor.state.doc, referenceType);
  }, [isOpen, editor, referenceType]);

  // Tự động chọn mục đầu tiên khi chuyển referenceType
  useEffect(() => {
    if (targets.length > 0) {
      setSelectedTargetId(targets[0].id);
    } else {
      setSelectedTargetId(null);
    }
  }, [targets]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetId) return;

    onInsert({
      targetId: selectedTargetId,
      targetType: referenceType,
      format,
    });
    onClose();
  };

  // Preview hiển thị
  const selectedItem = targets.find((t) => t.id === selectedTargetId);
  const previewText = selectedItem
    ? CrossReferenceService.resolveTarget(editor!.state.doc, {
        targetId: selectedItem.id,
        targetType: referenceType,
        format,
      }).text
    : "";

  return (
    <div
      className="dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cross-ref-dialog-title"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        className="dialog-content"
        style={{
          backgroundColor: "var(--color-bg-primary, #ffffff)",
          color: "var(--color-text-primary, #111827)",
          borderRadius: "8px",
          width: "520px",
          maxWidth: "92vw",
          padding: "20px 24px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
          border: "1px solid var(--color-border, #e5e7eb)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ExternalLink size={18} color="var(--color-primary, #2563eb)" />
            <h3
              id="cross-ref-dialog-title"
              style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}
            >
              Tham chiếu chéo (Cross-reference)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-secondary, #6b7280)",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
            {/* Loại đối tượng tham chiếu */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  marginBottom: "6px",
                }}
              >
                Loại tham chiếu (Type):
              </label>
              <select
                value={referenceType}
                onChange={(e) => {
                  const newType = e.target.value as CrossReferenceTargetType;
                  setReferenceType(newType);
                  if (newType === "bookmark" && format !== "text" && format !== "pageNumber") {
                    setFormat("text");
                  }
                }}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border, #d1d5db)",
                  backgroundColor: "var(--color-bg-input, #fff)",
                  color: "inherit",
                  fontSize: "13px",
                  boxSizing: "border-box",
                }}
              >
                <option value="heading">Tiêu đề (Headings)</option>
                <option value="figure">Hình ảnh (Figures)</option>
                <option value="table">Bảng biểu (Tables)</option>
                <option value="equation">Công thức (Equations)</option>
                <option value="footnote">Chú thích cuối trang (Footnotes)</option>
                <option value="endnote">Chú thích cuối bài (Endnotes)</option>
                <option value="bookmark">Thẻ đánh dấu (Bookmarks)</option>
              </select>
            </div>

            {/* Định dạng chèn */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 500,
                  marginBottom: "6px",
                }}
              >
                Chèn tham chiếu tới:
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as CrossReferenceFormat)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border, #d1d5db)",
                  backgroundColor: "var(--color-bg-input, #fff)",
                  color: "inherit",
                  fontSize: "13px",
                  boxSizing: "border-box",
                }}
              >
                {referenceType === "bookmark" ? (
                  <>
                    <option value="text">Nội dung thẻ đánh dấu (Bookmark text)</option>
                    <option value="pageNumber">Số trang (Page number)</option>
                  </>
                ) : (
                  <>
                    <option value="text">Nội dung đầy đủ (Heading / Caption)</option>
                    <option value="labelAndNumber">Chỉ nhãn và số (e.g. Figure 1)</option>
                    <option value="number">Chỉ số thứ tự (e.g. 1)</option>
                    <option value="pageNumber">Số trang (Page number)</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Danh sách mục tiêu để chọn */}
          <div style={{ marginBottom: "14px" }}>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                marginBottom: "6px",
              }}
            >
              Chọn đối tượng trong tài liệu:
            </label>
            <div
              style={{
                border: "1px solid var(--color-border, #d1d5db)",
                borderRadius: "6px",
                maxHeight: "170px",
                overflowY: "auto",
                backgroundColor: "var(--color-bg-secondary, #f9fafb)",
              }}
            >
              {targets.length === 0 ? (
                <div
                  style={{
                    padding: "20px",
                    textAlign: "center",
                    color: "var(--color-text-secondary, #6b7280)",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  <AlertCircle size={16} />
                  Không tìm thấy đối tượng nào thuộc loại này trong tài liệu.
                </div>
              ) : (
                targets.map((item) => {
                  const isSelected = item.id === selectedTargetId;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedTargetId(item.id)}
                      style={{
                        padding: "8px 12px",
                        fontSize: "13px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        backgroundColor: isSelected
                          ? "var(--color-primary-light, #eff6ff)"
                          : "transparent",
                        borderLeft: isSelected
                          ? "3px solid var(--color-primary, #2563eb)"
                          : "3px solid transparent",
                        borderBottom: "1px solid var(--color-border, #e5e7eb)",
                        color: isSelected
                          ? "var(--color-primary, #1d4ed8)"
                          : "inherit",
                        fontWeight: isSelected ? 500 : 400,
                      }}
                    >
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.title}
                      </span>
                      {isSelected && <Check size={14} color="var(--color-primary, #2563eb)" />}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Xem trước kết quả */}
          {selectedItem && (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                backgroundColor: "var(--color-bg-secondary, #f3f4f6)",
                fontSize: "12px",
                color: "var(--color-text-secondary, #4b5563)",
                marginBottom: "16px",
                border: "1px dashed var(--color-border, #d1d5db)",
              }}
            >
              <span style={{ fontWeight: 600 }}>Văn bản chèn vào: </span>
              <span
                style={{
                  color: "var(--color-primary, #2563eb)",
                  fontWeight: 500,
                  textDecoration: "underline",
                }}
              >
                {previewText}
              </span>
            </div>
          )}

          {/* Nút hành động */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "1px solid var(--color-border, #d1d5db)",
                backgroundColor: "transparent",
                color: "inherit",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={!selectedTargetId}
              style={{
                padding: "6px 16px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: selectedTargetId
                  ? "var(--color-primary, #2563eb)"
                  : "var(--color-disabled, #9ca3af)",
                color: "#ffffff",
                cursor: selectedTargetId ? "pointer" : "not-allowed",
                fontWeight: 500,
                fontSize: "13px",
              }}
            >
              Chèn tham chiếu
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
