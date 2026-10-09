import React, { useState, useEffect, useRef } from "react";
import { X, Check, Sigma, Sparkles } from "lucide-react";
import katex from "katex";

export interface EquationDialogProps {
  isOpen: boolean;
  initialLatex?: string;
  initialAlignment?: "left" | "center" | "right";
  isEditing?: boolean;
  onClose: () => void;
  onApply: (latex: string, alignment: "left" | "center" | "right") => void;
}

const EQUATION_TEMPLATES = [
  { label: "Pythagoras", latex: "x^2 + y^2 = z^2" },
  { label: "Năng lượng", latex: "E = mc^2" },
  { label: "Phân số", latex: "\\frac{a}{b}" },
  { label: "Căn bậc hai", latex: "\\sqrt{x}" },
  { label: "Căn bậc n", latex: "\\sqrt[n]{x}" },
  { label: "Tổng sigma", latex: "\\sum_{i=1}^{n} x_i" },
  { label: "Tích phân", latex: "\\int_{a}^{b} f(x) dx" },
  { label: "Giới hạn", latex: "\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1" },
  { label: "Ma trận", latex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
];

export function EquationDialog({
  isOpen,
  initialLatex = "x^2 + y^2 = z^2",
  initialAlignment = "center",
  isEditing = false,
  onClose,
  onApply,
}: EquationDialogProps) {
  const [latex, setLatex] = useState(initialLatex);
  const [alignment, setAlignment] = useState<"left" | "center" | "right">(initialAlignment);
  const [previewHtml, setPreviewHtml] = useState("");
  const [hasError, setHasError] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setLatex(initialLatex);
      setAlignment(initialAlignment);
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialLatex, initialAlignment]);

  // Render live KaTeX preview
  useEffect(() => {
    try {
      const html = katex.renderToString(latex || "\\text{(Nhập công thức...)}", {
        throwOnError: false,
        displayMode: true,
      });
      setPreviewHtml(html);
      setHasError(false);
    } catch {
      setHasError(true);
      setPreviewHtml(`<span style="color: #ef4444;">Lỗi cú pháp LaTeX</span>`);
    }
  }, [latex]);

  if (!isOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = latex.trim();
    if (!trimmed) return;
    onApply(trimmed, alignment);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="presentation"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        className="modal-container equation-modal-container"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="equation-modal-title"
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "8px",
          width: "560px",
          maxWidth: "92vw",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
            backgroundColor: "#f8fafc",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "6px",
                backgroundColor: "#eff6ff",
                color: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sigma size={20} />
            </div>
            <div>
              <h2
                id="equation-modal-title"
                style={{ fontSize: "16px", fontWeight: "600", color: "#0f172a", margin: 0 }}
              >
                {isEditing ? "Chỉnh sửa công thức toán học" : "Chèn công thức toán học (Equation)"}
              </h2>
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                Hỗ trợ định dạng chuẩn LaTeX kết xuất qua KaTeX
              </span>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#64748b",
              padding: "4px",
              borderRadius: "4px",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: "20px" }}>
          {/* Quick template chips */}
          <div style={{ marginBottom: "16px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                fontWeight: "600",
                color: "#475569",
                marginBottom: "8px",
              }}
            >
              <Sparkles size={14} color="#2563eb" />
              <span>Mẫu công thức phổ biến:</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {EQUATION_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.label}
                  type="button"
                  className="equation-chip"
                  onClick={() => setLatex(tmpl.latex)}
                  style={{
                    padding: "4px 10px",
                    fontSize: "12px",
                    borderRadius: "14px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#f1f5f9",
                    color: "#334155",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  title={tmpl.latex}
                >
                  {tmpl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input field */}
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="latex-source-input"
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: "500",
                color: "#334155",
                marginBottom: "6px",
              }}
            >
              Mã nguồn LaTeX (Source expression):
            </label>
            <textarea
              id="latex-source-input"
              ref={textareaRef}
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              placeholder="Ví dụ: x^2 + y^2 = z^2"
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontFamily: "Consolas, 'Courier New', monospace",
                fontSize: "13.5px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Live Preview Card */}
          <div style={{ marginBottom: "16px" }}>
            <span
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: "500",
                color: "#334155",
                marginBottom: "6px",
              }}
            >
              Xem trước kết quả (Live Preview):
            </span>
            <div
              className="equation-preview-box"
              style={{
                minHeight: "70px",
                padding: "16px",
                backgroundColor: "#f8fafc",
                borderRadius: "6px",
                border: "1px dashed #cbd5e1",
                display: "flex",
                alignItems: "center",
                justifyContent: alignment === "left" ? "flex-start" : alignment === "right" ? "flex-end" : "center",
                overflowX: "auto",
              }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>

          {/* Alignment controls */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: "4px",
            }}
          >
            <span style={{ fontSize: "13px", color: "#475569" }}>Căn lề công thức:</span>
            <div style={{ display: "flex", gap: "6px" }}>
              {(["left", "center", "right"] as const).map((align) => (
                <button
                  key={align}
                  type="button"
                  onClick={() => setAlignment(align)}
                  style={{
                    padding: "4px 12px",
                    fontSize: "12px",
                    borderRadius: "4px",
                    border: alignment === align ? "1px solid #2563eb" : "1px solid #cbd5e1",
                    backgroundColor: alignment === align ? "#eff6ff" : "#ffffff",
                    color: alignment === align ? "#1d4ed8" : "#475569",
                    cursor: "pointer",
                    fontWeight: alignment === align ? "600" : "normal",
                  }}
                >
                  {align === "left" ? "Trái" : align === "center" ? "Giữa" : "Phải"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="modal-footer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "10px",
            padding: "14px 20px",
            backgroundColor: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
          }}
        >
          <button
            type="button"
            className="btn-cancel"
            onClick={onClose}
            style={{
              padding: "7px 16px",
              fontSize: "13px",
              borderRadius: "5px",
              border: "1px solid #cbd5e1",
              backgroundColor: "#ffffff",
              color: "#475569",
              cursor: "pointer",
            }}
          >
            Hủy
          </button>
          <button
            type="button"
            className="btn-confirm"
            onClick={() => handleSubmit()}
            disabled={!latex.trim() || hasError}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 18px",
              fontSize: "13px",
              fontWeight: "500",
              borderRadius: "5px",
              border: "none",
              backgroundColor: !latex.trim() || hasError ? "#94a3b8" : "#2563eb",
              color: "#ffffff",
              cursor: !latex.trim() || hasError ? "not-allowed" : "pointer",
            }}
          >
            <Check size={16} />
            <span>{isEditing ? "Cập nhật" : "Chèn công thức"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default EquationDialog;
