import { useState } from "react";
import type { Editor } from "@tiptap/core";
import { X, Plus, Edit2, Trash2, BookOpen, AlertTriangle } from "lucide-react";
import { CitationService } from "../services/citationService.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import type { BibliographySource, SourceType } from "../types/citationTypes.ts";

interface ManageSourcesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editor: Editor | null;
}

export function ManageSourcesDialog({
  isOpen,
  onClose,
  editor,
}: ManageSourcesDialogProps) {
  const sources = useDocumentStore((state) => state.bibliographySources);
  const citationStyle = useDocumentStore((state) => state.citationStyle);

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states
  const [formType, setFormType] = useState<SourceType>("book");
  const [formTitle, setFormTitle] = useState("");
  const [formAuthors, setFormAuthors] = useState("");
  const [formYear, setFormYear] = useState(new Date().getFullYear().toString());
  const [formPublisher, setFormPublisher] = useState("");
  const [formJournal, setFormJournal] = useState("");
  const [formVolume, setFormVolume] = useState("");
  const [formIssue, setFormIssue] = useState("");
  const [formPages, setFormPages] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formAccessedAt, setFormAccessedAt] = useState("");
  const [formConferenceName, setFormConferenceName] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formDoi, setFormDoi] = useState("");

  // Delete confirmation
  const [deleteConfirmSource, setDeleteConfirmSource] = useState<BibliographySource | null>(null);

  if (!isOpen) return null;

  const selectedSource = sources.find((s) => s.id === selectedSourceId);

  const handleStartNew = () => {
    setIsNew(true);
    setIsEditing(true);
    setSelectedSourceId(null);
    setFormType("book");
    setFormTitle("");
    setFormAuthors("");
    setFormYear(new Date().getFullYear().toString());
    setFormPublisher("");
    setFormJournal("");
    setFormVolume("");
    setFormIssue("");
    setFormPages("");
    setFormUrl("");
    setFormAccessedAt("");
    setFormConferenceName("");
    setFormCity("");
    setFormDoi("");
    setErrorMessage(null);
  };

  const handleStartEdit = (source: BibliographySource) => {
    setIsNew(false);
    setIsEditing(true);
    setSelectedSourceId(source.id);
    setFormType(source.type);
    setFormTitle(source.title);
    setFormAuthors(source.authors);
    setFormYear(String(source.year));
    setFormPublisher(source.publisher || "");
    setFormJournal(source.journal || "");
    setFormVolume(String(source.volume || ""));
    setFormIssue(String(source.issue || ""));
    setFormPages(source.pages || "");
    setFormUrl(source.url || "");
    setFormAccessedAt(source.accessedAt || "");
    setFormConferenceName(source.conferenceName || "");
    setFormCity(source.city || "");
    setFormDoi(source.doi || "");
    setErrorMessage(null);
  };

  const handleCancelForm = () => {
    setIsEditing(false);
    setIsNew(false);
    setErrorMessage(null);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const sourceData: BibliographySource = {
      id: isNew ? CitationService.generateSourceId() : (selectedSourceId || CitationService.generateSourceId()),
      type: formType,
      title: formTitle.trim(),
      authors: formAuthors.trim(),
      year: formYear.trim(),
      publisher: formPublisher.trim() || undefined,
      journal: formJournal.trim() || undefined,
      volume: formVolume.trim() || undefined,
      issue: formIssue.trim() || undefined,
      pages: formPages.trim() || undefined,
      url: formUrl.trim() || undefined,
      accessedAt: formAccessedAt.trim() || undefined,
      conferenceName: formConferenceName.trim() || undefined,
      city: formCity.trim() || undefined,
      doi: formDoi.trim() || undefined,
    };

    const result = CitationService.saveSource(sourceData);
    if (!result.success) {
      setErrorMessage(result.message || "Lỗi lưu nguồn tài liệu.");
      return;
    }

    setIsEditing(false);
    setIsNew(false);
    setSelectedSourceId(sourceData.id);

    // Cập nhật lại các citation trong editor nếu có
    if (editor) {
      CitationService.updateBibliography(editor);
    }
  };

  const handleDeleteClick = (source: BibliographySource) => {
    const isCited = editor ? CitationService.isSourceCited(editor.state.doc, source.id) : false;
    if (isCited) {
      setDeleteConfirmSource(source);
    } else {
      CitationService.deleteSource(source.id);
      if (selectedSourceId === source.id) {
        setSelectedSourceId(null);
      }
      if (editor) CitationService.updateBibliography(editor);
    }
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirmSource) return;
    CitationService.deleteSource(deleteConfirmSource.id, undefined, true);
    if (selectedSourceId === deleteConfirmSource.id) {
      setSelectedSourceId(null);
    }
    setDeleteConfirmSource(null);
    if (editor) CitationService.updateBibliography(editor);
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
        if (e.target === e.currentTarget && !deleteConfirmSource) onClose();
      }}
    >
      <div
        className="dialog-container"
        style={{
          width: 780,
          maxWidth: "95vw",
          maxHeight: "90vh",
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
            <BookOpen size={20} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              Quản lý Nguồn Tài liệu Tham khảo (Manage Sources)
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

        {/* Body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Cột trái: Danh sách nguồn */}
          <div
            style={{
              width: 280,
              borderRight: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#f8fafc",
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>
                Nguồn trong tài liệu ({sources.length})
              </span>
              <button
                type="button"
                onClick={handleStartNew}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  padding: "4px 8px",
                  backgroundColor: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                <Plus size={12} /> Thêm mới
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
              {sources.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 8px", color: "#94a3b8", fontSize: 13 }}>
                  Chưa có nguồn tài liệu nào. Nhấp "Thêm mới" để tạo nguồn đầu tiên.
                </div>
              ) : (
                sources.map((s) => {
                  const isSelected = selectedSourceId === s.id;
                  const isCited = editor ? CitationService.isSourceCited(editor.state.doc, s.id) : false;
                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedSourceId(s.id);
                        if (!isEditing) {
                          // View mode
                        }
                      }}
                      style={{
                        padding: "8px 10px",
                        marginBottom: 4,
                        borderRadius: 6,
                        backgroundColor: isSelected ? "#e0e7ff" : "#fff",
                        border: isSelected ? "1px solid #6366f1" : "1px solid #e2e8f0",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b", marginBottom: 2 }}>
                        {s.title}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        {s.authors} ({s.year})
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                        <span
                          style={{
                            fontSize: 10,
                            padding: "1px 5px",
                            borderRadius: 3,
                            backgroundColor: "#f1f5f9",
                            color: "#475569",
                            textTransform: "uppercase",
                          }}
                        >
                          {s.type}
                        </span>
                        {isCited && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: "1px 5px",
                              borderRadius: 3,
                              backgroundColor: "#dcfce7",
                              color: "#15803d",
                              fontWeight: 500,
                            }}
                          >
                            Đã trích dẫn
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Cột phải: Form biên soạn hoặc Xem chi tiết */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", padding: 20 }}>
            {isEditing ? (
              <form onSubmit={handleSaveForm} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#1e293b" }}>
                  {isNew ? "Thêm Nguồn Tài liệu Mới" : "Chỉnh sửa Nguồn Tài liệu"}
                </h4>

                {errorMessage && (
                  <div
                    style={{
                      padding: "8px 12px",
                      backgroundColor: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: 4,
                      color: "#b91c1c",
                      fontSize: 13,
                    }}
                  >
                    {errorMessage}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      Loại tài liệu *
                    </label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value as SourceType)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        borderRadius: 4,
                        border: "1px solid #cbd5e1",
                        fontSize: 13,
                      }}
                    >
                      <option value="book">Sách (Book)</option>
                      <option value="journalArticle">Bài báo khoa học (Journal Article)</option>
                      <option value="website">Trang web (Website)</option>
                      <option value="conferencePaper">Kỷ yếu hội nghị (Conference Paper)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      Năm xuất bản *
                    </label>
                    <input
                      type="text"
                      value={formYear}
                      onChange={(e) => setFormYear(e.target.value)}
                      placeholder="VD: 2024"
                      required
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
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Tác giả * (Phân tách bằng dấu phẩy)
                  </label>
                  <input
                    type="text"
                    value={formAuthors}
                    onChange={(e) => setFormAuthors(e.target.value)}
                    placeholder="VD: Nguyễn Văn A, Trần Thị B hoặc Smith, J."
                    required
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
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Tiêu đề *
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Tiêu đề sách, bài báo hoặc trang web"
                    required
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 4,
                      border: "1px solid #cbd5e1",
                      fontSize: 13,
                    }}
                  />
                </div>

                {/* Các trường theo loại */}
                {formType === "book" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                        Nhà xuất bản
                      </label>
                      <input
                        type="text"
                        value={formPublisher}
                        onChange={(e) => setFormPublisher(e.target.value)}
                        placeholder="VD: NXB Khoa học và Kỹ thuật"
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
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                        Thành phố / Địa điểm
                      </label>
                      <input
                        type="text"
                        value={formCity}
                        onChange={(e) => setFormCity(e.target.value)}
                        placeholder="VD: Hà Nội"
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
                )}

                {formType === "journalArticle" && (
                  <>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                        Tên Tạp chí
                      </label>
                      <input
                        type="text"
                        value={formJournal}
                        onChange={(e) => setFormJournal(e.target.value)}
                        placeholder="VD: Tạp chí Tin học và Điều khiển học"
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 4,
                          border: "1px solid #cbd5e1",
                          fontSize: 13,
                        }}
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                          Tập (Volume)
                        </label>
                        <input
                          type="text"
                          value={formVolume}
                          onChange={(e) => setFormVolume(e.target.value)}
                          placeholder="VD: 38"
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
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                          Số (Issue)
                        </label>
                        <input
                          type="text"
                          value={formIssue}
                          onChange={(e) => setFormIssue(e.target.value)}
                          placeholder="VD: 2"
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
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                          Trang (Pages)
                        </label>
                        <input
                          type="text"
                          value={formPages}
                          onChange={(e) => setFormPages(e.target.value)}
                          placeholder="VD: 105-115"
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
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                        DOI
                      </label>
                      <input
                        type="text"
                        value={formDoi}
                        onChange={(e) => setFormDoi(e.target.value)}
                        placeholder="VD: 10.1016/j.procs.2023.01.002"
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 4,
                          border: "1px solid #cbd5e1",
                          fontSize: 13,
                        }}
                      />
                    </div>
                  </>
                )}

                {formType === "website" && (
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                        URL
                      </label>
                      <input
                        type="url"
                        value={formUrl}
                        onChange={(e) => setFormUrl(e.target.value)}
                        placeholder="VD: https://example.com/article"
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
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                        Ngày truy cập
                      </label>
                      <input
                        type="text"
                        value={formAccessedAt}
                        onChange={(e) => setFormAccessedAt(e.target.value)}
                        placeholder="VD: 2024-10-07"
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
                )}

                {formType === "conferencePaper" && (
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                        Tên Hội thảo / Kỷ yếu
                      </label>
                      <input
                        type="text"
                        value={formConferenceName}
                        onChange={(e) => setFormConferenceName(e.target.value)}
                        placeholder="VD: Hội nghị Quốc gia về Khoa học Máy tính"
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
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                        Trang (Pages)
                      </label>
                      <input
                        type="text"
                        value={formPages}
                        onChange={(e) => setFormPages(e.target.value)}
                        placeholder="VD: 45-52"
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
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={handleCancelForm}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 4,
                      border: "1px solid #cbd5e1",
                      backgroundColor: "#fff",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: "6px 16px",
                      borderRadius: 4,
                      border: "none",
                      backgroundColor: "#2563eb",
                      color: "#fff",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    Lưu Nguồn
                  </button>
                </div>
              </form>
            ) : selectedSource ? (
              <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h4 style={{ margin: "0 0 4px 0", fontSize: 16, fontWeight: 600, color: "#1e293b" }}>
                      {selectedSource.title}
                    </h4>
                    <div style={{ fontSize: 13, color: "#64748b" }}>
                      Tác giả: <strong>{selectedSource.authors}</strong> ({selectedSource.year})
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => handleStartEdit(selectedSource)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "5px 10px",
                        fontSize: 12,
                        borderRadius: 4,
                        border: "1px solid #cbd5e1",
                        backgroundColor: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <Edit2 size={12} /> Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(selectedSource)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "5px 10px",
                        fontSize: 12,
                        borderRadius: 4,
                        border: "1px solid #fecaca",
                        backgroundColor: "#fef2f2",
                        color: "#dc2626",
                        cursor: "pointer",
                      }}
                    >
                      <Trash2 size={12} /> Xóa
                    </button>
                  </div>
                </div>

                {/* Preview theo Style */}
                <div style={{ backgroundColor: "#f8fafc", padding: 12, borderRadius: 6, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                    Xem trước trích dẫn ({citationStyle.toUpperCase()}):
                  </div>
                  <div style={{ fontSize: 13, color: "#1e293b", marginBottom: 8 }}>
                    <strong>Trong văn bản (In-text):</strong>{" "}
                    <code>{CitationService.formatInTextCitation(selectedSource, citationStyle)}</code>
                  </div>
                  <div style={{ fontSize: 13, color: "#1e293b" }}>
                    <strong>Thư mục (Bibliography):</strong>
                    <div style={{ marginTop: 4, fontStyle: "italic", color: "#334155" }}>
                      {CitationService.formatBibliographyEntry(selectedSource, citationStyle, 1)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#94a3b8",
                  fontSize: 14,
                }}
              >
                Chọn một nguồn từ danh sách bên trái hoặc nhấn "Thêm mới".
              </div>
            )}
          </div>
        </div>

        {/* Modal xác nhận xóa khi đang được trích dẫn */}
        {deleteConfirmSource && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.6)",
              zIndex: 10000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 440,
                backgroundColor: "#fff",
                borderRadius: 8,
                padding: 20,
                boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#dc2626", marginBottom: 12 }}>
                <AlertTriangle size={24} />
                <h4 style={{ margin: 0, fontSize: 16 }}>Cảnh báo xóa nguồn đang trích dẫn</h4>
              </div>
              <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                Nguồn "<strong>{deleteConfirmSource.title}</strong>" đang được trích dẫn trong văn bản!
                <br />
                Nếu xóa, các vị trí trích dẫn sẽ hiển thị trạng thái{" "}
                <code style={{ color: "#dc2626" }}>[Citation not found]</code>.
                <br />
                Bạn có chắc chắn muốn xóa không?
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmSource(null)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 4,
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Giữ lại
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 4,
                    border: "none",
                    backgroundColor: "#dc2626",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Xóa bỏ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "flex-end",
            backgroundColor: "#f8fafc",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 16px",
              borderRadius: 4,
              border: "1px solid #cbd5e1",
              backgroundColor: "#fff",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
