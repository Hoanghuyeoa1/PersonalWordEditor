import React, { useState, useEffect, useMemo } from "react";
import type { Editor } from "@tiptap/core";
import { CaptionService } from "../services/captionService.ts";
import type {
  CaptionLabel,
  CaptionPosition,
  InsertCaptionOptions,
} from "../types/captionTypes.ts";
import { Tag, X } from "lucide-react";

interface CaptionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editor: Editor | null;
  onInsert: (options: InsertCaptionOptions) => void;
}

export const CaptionDialog: React.FC<CaptionDialogProps> = ({
  isOpen,
  onClose,
  editor,
  onInsert,
}) => {
  const [label, setLabel] = useState<CaptionLabel>("Figure");
  const [isCustomLabel, setIsCustomLabel] = useState(false);
  const [customLabelInput, setCustomLabelInput] = useState("");
  const [positionPolicy, setPositionPolicy] = useState<CaptionPosition>("below");
  const [text, setText] = useState("");

  // Tự động nhận diện đối tượng đang chọn khi mở hộp thoại
  useEffect(() => {
    if (isOpen && editor) {
      const detected = CaptionService.detectSelectedTarget(editor);
      const defaultLbl = CaptionService.getDefaultLabelForType(detected?.targetType);
      setLabel(defaultLbl);
      setIsCustomLabel(false);
      setCustomLabelInput("");
      setText("");
      setPositionPolicy(defaultLbl === "Table" ? "above" : "below");
    }
  }, [isOpen, editor]);

  // Nhãn đang chọn
  const activeLabel = isCustomLabel ? customLabelInput.trim() || "Figure" : label;

  // Số thứ tự ước tính tiếp theo
  const estimatedNumber = useMemo(() => {
    if (!editor) return 1;
    const captions = CaptionService.extractCaptions(editor.state.doc);
    const count = captions.filter(
      (c) => c.label.toLowerCase() === activeLabel.toLowerCase()
    ).length;
    return count + 1;
  }, [editor, activeLabel]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onInsert({
      label: activeLabel,
      text: text.trim(),
      positionPolicy,
    });
    onClose();
  };

  return (
    <div
      className="dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="caption-dialog-title"
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
          width: "440px",
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
            <Tag size={18} color="var(--color-primary, #2563eb)" />
            <h3
              id="caption-dialog-title"
              style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}
            >
              Chèn chú thích (Caption)
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
          {/* Nhãn chú thích */}
          <div style={{ marginBottom: "14px" }}>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                marginBottom: "6px",
              }}
            >
              Loại nhãn (Label):
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <select
                value={isCustomLabel ? "custom" : label}
                onChange={(e) => {
                  if (e.target.value === "custom") {
                    setIsCustomLabel(true);
                  } else {
                    setIsCustomLabel(false);
                    setLabel(e.target.value as CaptionLabel);
                    setPositionPolicy(e.target.value === "Table" ? "above" : "below");
                  }
                }}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border, #d1d5db)",
                  backgroundColor: "var(--color-bg-input, #fff)",
                  color: "inherit",
                  fontSize: "13px",
                }}
              >
                <option value="Figure">Figure (Hình ảnh / Minh họa)</option>
                <option value="Table">Table (Bảng biểu)</option>
                <option value="Equation">Equation (Công thức)</option>
                <option value="custom">Nhãn tùy chỉnh...</option>
              </select>
            </div>
            {isCustomLabel && (
              <input
                type="text"
                placeholder="Nhập nhãn tùy chỉnh (ví dụ: Biểu đồ, Sơ đồ)"
                value={customLabelInput}
                onChange={(e) => setCustomLabelInput(e.target.value)}
                autoFocus
                style={{
                  width: "100%",
                  marginTop: "8px",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border, #d1d5db)",
                  backgroundColor: "var(--color-bg-input, #fff)",
                  color: "inherit",
                  fontSize: "13px",
                  boxSizing: "border-box",
                }}
              />
            )}
          </div>

          {/* Vị trí */}
          <div style={{ marginBottom: "14px" }}>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                marginBottom: "6px",
              }}
            >
              Vị trí (Position):
            </label>
            <select
              value={positionPolicy}
              onChange={(e) => setPositionPolicy(e.target.value as CaptionPosition)}
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
              <option value="below">Dưới đối tượng (Below selected item)</option>
              <option value="above">Trên đối tượng (Above selected item)</option>
            </select>
          </div>

          {/* Nội dung mô tả chú thích */}
          <div style={{ marginBottom: "14px" }}>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                marginBottom: "6px",
              }}
            >
              Nội dung chú thích:
            </label>
            <input
              type="text"
              placeholder="Ví dụ: Kiến trúc tổng quan hệ thống"
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid var(--color-border, #d1d5db)",
                backgroundColor: "var(--color-bg-input, #fff)",
                color: "inherit",
                fontSize: "13px",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Xem trước kết quả */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "6px",
              backgroundColor: "var(--color-bg-secondary, #f3f4f6)",
              fontSize: "12px",
              color: "var(--color-text-secondary, #4b5563)",
              marginBottom: "18px",
              border: "1px dashed var(--color-border, #d1d5db)",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Xem trước hiển thị:</div>
            <div style={{ fontStyle: "italic", color: "var(--color-text-primary, #111)" }}>
              {activeLabel} {estimatedNumber} {text.trim() ? `— ${text.trim()}` : ""}
            </div>
          </div>

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
              style={{
                padding: "6px 16px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "var(--color-primary, #2563eb)",
                color: "#ffffff",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: "13px",
              }}
            >
              Chèn chú thích
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
