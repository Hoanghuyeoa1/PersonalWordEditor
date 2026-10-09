import { useState, useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { X, Quote, Plus } from "lucide-react";
import { CitationService } from "../services/citationService.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import type { CitationStyle, InsertCitationOptions } from "../types/citationTypes.ts";

interface InsertCitationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editor: Editor | null;
  onInsert: (options: InsertCitationOptions) => void;
  onOpenManageSources: () => void;
}

export function InsertCitationDialog({
  isOpen,
  onClose,
  editor,
  onInsert,
  onOpenManageSources,
}: InsertCitationDialogProps) {
  const sources = useDocumentStore((state) => state.bibliographySources);
  const docStyle = useDocumentStore((state) => state.citationStyle);

  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [style, setStyle] = useState<CitationStyle>("apa");
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");

  useEffect(() => {
    if (isOpen) {
      setStyle(docStyle || "apa");
      if (sources.length > 0 && !selectedSourceId) {
        setSelectedSourceId(sources[0].id);
      }
    }
  }, [isOpen, docStyle, sources]);

  if (!isOpen) return null;

  const selectedSource = sources.find((s) => s.id === selectedSourceId);

  // Tính toán số thứ tự nếu là IEEE
  const index = editor && style === "ieee" && selectedSourceId
    ? CitationService.getSourceIndex(editor.state.doc, selectedSourceId)
    : 1;

  const previewText = selectedSource
    ? CitationService.formatInTextCitation(selectedSource, style, { prefix, suffix, index })
    : "(Chưa chọn nguồn)";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSourceId) return;

    onInsert({
      sourceId: selectedSourceId,
      style,
      prefix: prefix.trim() || undefined,
      suffix: suffix.trim() || undefined,
    });
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
          width: 520,
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
            <Quote size={20} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              Chèn Trích dẫn (Insert Citation)
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {sources.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <p style={{ color: "#64748b", fontSize: 14, marginBottom: 12 }}>
                Tài liệu chưa có nguồn tham khảo nào. Vui lòng tạo nguồn mới trước khi chèn trích dẫn.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenManageSources();
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  backgroundColor: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                <Plus size={14} /> Mở Quản lý Nguồn (Thêm Mới)
              </button>
            </div>
          ) : (
            <>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                    Chọn Nguồn Tham khảo *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenManageSources();
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#2563eb",
                      fontSize: 12,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    + Thêm nguồn mới...
                  </button>
                </div>
                <select
                  value={selectedSourceId}
                  onChange={(e) => setSelectedSourceId(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 4,
                    border: "1px solid #cbd5e1",
                    fontSize: 13,
                  }}
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} — {s.authors} ({s.year})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#1e293b" }}>
                    Tiền tố (Prefix)
                  </label>
                  <input
                    type="text"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="VD: xem thêm"
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 4,
                      border: "1px solid #cbd5e1",
                      fontSize: 13,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#1e293b" }}>
                    Hậu tố / Trang (Suffix)
                  </label>
                  <input
                    type="text"
                    value={suffix}
                    onChange={(e) => setSuffix(e.target.value)}
                    placeholder="VD: tr. 45"
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 4,
                      border: "1px solid #cbd5e1",
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#1e293b" }}>
                  Kiểu trích dẫn (Style)
                </label>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value as CitationStyle)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "1px solid #cbd5e1",
                    fontSize: 13,
                  }}
                >
                  <option value="apa">APA 7th (Tác giả, Năm)</option>
                  <option value="ieee">IEEE (Chỉ số số [1], [2])</option>
                </select>
              </div>

              {/* Live Preview */}
              <div
                style={{
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  padding: 12,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>
                  Xem trước hiển thị (Live Preview):
                </span>
                <div style={{ marginTop: 4, fontSize: 14, fontWeight: 500, color: "#1e293b" }}>
                  {previewText}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
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
                  type="submit"
                  disabled={!selectedSourceId}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 4,
                    border: "none",
                    backgroundColor: "#2563eb",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: selectedSourceId ? "pointer" : "not-allowed",
                    opacity: selectedSourceId ? 1 : 0.6,
                    fontSize: 13,
                  }}
                >
                  Chèn Trích dẫn
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
