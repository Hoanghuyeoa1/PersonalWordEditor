import { useEffect } from "react";
import { BarChart3, X, Check, FileCheck, Layers, Info } from "lucide-react";
import { useReviewStore } from "../../stores/reviewStore";
import { useDocumentStore } from "../../stores/documentStore";
import { usePaginationStore } from "../../stores/paginationStore";
import { useEditorStore } from "../../stores/editorStore";
import { StatisticsService } from "../statistics/statisticsService";
import { ProofingService } from "../proofing/proofingService";
import { formatNumber } from "../utils/reviewUtils";

/**
 * DocumentStatisticsModal - Hộp thoại Thống kê tài liệu / Đếm từ (Word Count)
 *
 * Hiển thị các chỉ số định lượng đầy đủ và chi tiết:
 * 1. Nội dung văn bản chính: Trang, Từ, Ký tự (có/không khoảng trắng), Đoạn văn, Dòng ước tính
 * 2. Cấu trúc bổ sung: Tiêu đề (Headings), Bảng (Tables), Hình ảnh (Images)
 * 3. Thống kê vùng chọn (Selection Statistics): Khi người dùng đang bôi đen một phần văn bản
 * 4. Tổng quan kiểm duyệt (Review Summary): Lỗi chính tả, Ngữ pháp, Bình luận, Thay đổi theo dõi
 */
export function DocumentStatisticsModal() {
  const isOpen = useReviewStore((state) => state.isStatisticsModalOpen);
  const closeModal = useReviewStore((state) => state.closeStatisticsModal);
  const document = useDocumentStore((state) => state.document);
  const pageCount = usePaginationStore((state) => state.pageCount);
  const editor = useEditorStore((state) => state.editor);

  // Đóng bằng phím Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeModal]);

  if (!isOpen) return null;

  // Lấy văn bản đang chọn nếu có
  let selectedText: string | undefined;
  if (editor && !editor.state.selection.empty) {
    const { from, to } = editor.state.selection;
    if (from < to) {
      selectedText = editor.state.doc.textBetween(from, to, " ");
    }
  }

  // Lấy số lượng lỗi chính tả / ngữ pháp đang hiển thị
  const proofingIssues = editor ? ProofingService.getIssuesFromEditor(editor) : [];
  const spellingIssues = proofingIssues.filter((i) => i.type !== "grammar").length;
  const grammarIssues = proofingIssues.filter((i) => i.type === "grammar").length;

  const stats = StatisticsService.calculateDetailedStats(document?.content, pageCount, {
    selectedText,
    spellingIssues,
    grammarIssues,
  });

  const hasSelection = stats.selectedWords !== undefined && stats.selectedWords > 0;

  return (
    <div
      className="custom-margins-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="statistics-modal-title"
      onClick={closeModal}
    >
      <div
        className="custom-margins-card"
        role="document"
        style={{ maxWidth: "460px", width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="custom-margins-header">
          <div className="custom-margins-header-icon" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
            <BarChart3 size={20} aria-hidden="true" />
          </div>
          <div className="custom-margins-header-text">
            <h2 id="statistics-modal-title">Thống kê tài liệu (Word Count)</h2>
            <span className="custom-margins-subtitle">
              Chỉ số định lượng nội dung và tổng quan kiểm duyệt
            </span>
          </div>
          <button
            type="button"
            className="custom-margins-close-btn"
            onClick={closeModal}
            title="Đóng (Escape)"
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="custom-margins-body" style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          {/* 1. Nhóm chỉ số văn bản cốt lõi */}
          <div style={{ marginBottom: "16px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#475569",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: "8px",
              }}
            >
              <FileCheck size={14} style={{ color: "#2563eb" }} />
              <span>Chỉ số văn bản</span>
            </div>

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
                color: "#334155",
              }}
            >
              <tbody>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "7px 4px", fontWeight: 500 }}>Trang vật lý (Pages):</td>
                  <td style={{ padding: "7px 4px", textAlign: "right", fontWeight: 600, color: "#0f172a" }}>
                    {formatNumber(stats.pages)}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "7px 4px", fontWeight: 500 }}>Số từ (Words):</td>
                  <td style={{ padding: "7px 4px", textAlign: "right", fontWeight: 700, color: "#1d4ed8", fontSize: "14px" }}>
                    {formatNumber(stats.words)}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "7px 4px", fontWeight: 500 }}>Ký tự (không tính khoảng trắng):</td>
                  <td style={{ padding: "7px 4px", textAlign: "right", fontWeight: 600, color: "#0f172a" }}>
                    {formatNumber(stats.charactersNoSpaces)}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "7px 4px", fontWeight: 500 }}>Ký tự (tính cả khoảng trắng):</td>
                  <td style={{ padding: "7px 4px", textAlign: "right", fontWeight: 600, color: "#0f172a" }}>
                    {formatNumber(stats.characters)}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "7px 4px", fontWeight: 500 }}>Đoạn văn (Paragraphs):</td>
                  <td style={{ padding: "7px 4px", textAlign: "right", fontWeight: 600, color: "#0f172a" }}>
                    {formatNumber(stats.paragraphs)}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "7px 4px", fontWeight: 500 }}>Dòng ước tính (Lines):</td>
                  <td style={{ padding: "7px 4px", textAlign: "right", fontWeight: 600, color: "#0f172a" }}>
                    {formatNumber(stats.lines)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 2. Thống kê vùng chọn (Selection Statistics) nếu có */}
          {hasSelection && (
            <div
              style={{
                marginBottom: "16px",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "6px",
                padding: "10px 14px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#166534",
                  marginBottom: "6px",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Văn bản đang chọn (Selection)</span>
                <span style={{ fontSize: "11px", fontWeight: 500, color: "#15803d" }}>Đang bôi đen</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <span style={{ color: "#374151" }}>Số từ được chọn:</span>
                <span style={{ fontWeight: 700, color: "#15803d" }}>
                  {formatNumber(stats.selectedWords!)} / {formatNumber(stats.words)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginTop: "4px" }}>
                <span style={{ color: "#374151" }}>Ký tự được chọn:</span>
                <span style={{ fontWeight: 600, color: "#15803d" }}>
                  {formatNumber(stats.selectedCharacters!)} / {formatNumber(stats.characters)}
                </span>
              </div>
            </div>
          )}

          {/* 3. Cấu trúc bổ sung (Headings, Tables, Images) */}
          <div style={{ marginBottom: "16px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#475569",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: "8px",
              }}
            >
              <Layers size={14} style={{ color: "#475569" }} />
              <span>Cấu trúc thành phần</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              <div style={{ background: "#f8fafc", padding: "8px", borderRadius: "6px", textAlign: "center", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "11px", color: "#64748b" }}>Tiêu đề</div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>{formatNumber(stats.headings ?? 0)}</div>
              </div>
              <div style={{ background: "#f8fafc", padding: "8px", borderRadius: "6px", textAlign: "center", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "11px", color: "#64748b" }}>Bảng</div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>{formatNumber(stats.tables ?? 0)}</div>
              </div>
              <div style={{ background: "#f8fafc", padding: "8px", borderRadius: "6px", textAlign: "center", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "11px", color: "#64748b" }}>Hình ảnh</div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>{formatNumber(stats.images ?? 0)}</div>
              </div>
            </div>
          </div>

          {/* 4. Tổng quan kiểm duyệt (Review Summary) */}
          <div style={{ marginBottom: "14px" }}>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#475569",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: "8px",
              }}
            >
              Tổng quan kiểm duyệt (Review Summary)
            </div>

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12px",
                color: "#334155",
              }}
            >
              <tbody>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "6px 4px" }}>Lỗi chính tả (Spelling):</td>
                  <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 600, color: (stats.spellingIssues ?? 0) > 0 ? "#dc2626" : "#16a34a" }}>
                    {(stats.spellingIssues ?? 0) > 0 ? `${formatNumber(stats.spellingIssues!)} lỗi` : "0 (Sạch)"}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "6px 4px" }}>Lỗi ngữ pháp (Grammar):</td>
                  <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 600, color: (stats.grammarIssues ?? 0) > 0 ? "#2563eb" : "#16a34a" }}>
                    {(stats.grammarIssues ?? 0) > 0 ? `${formatNumber(stats.grammarIssues!)} lưu ý` : "0 (Sạch)"}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "6px 4px" }}>Bình luận (Comments):</td>
                  <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 600, color: "#0f172a" }}>
                    {formatNumber(stats.comments ?? 0)}
                    {(stats.unresolvedComments ?? 0) > 0 && (
                      <span style={{ fontSize: "11px", color: "#d97706", marginLeft: "4px" }}>
                        ({formatNumber(stats.unresolvedComments!)} chưa xử lý)
                      </span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "6px 4px" }}>Theo dõi thay đổi (Tracked Changes):</td>
                  <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 600, color: "#0f172a" }}>
                    {formatNumber(stats.trackedChanges ?? 0)}
                    {(stats.trackedChanges ?? 0) > 0 && (
                      <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "4px" }}>
                        (+{formatNumber(stats.trackedInsertions ?? 0)} / -{formatNumber(stats.trackedDeletions ?? 0)})
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 5. Ghi chú chính sách đếm từ (Word Count Policy) */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "6px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "4px",
              padding: "8px 10px",
              fontSize: "11px",
              color: "#64748b",
              lineHeight: 1.4,
            }}
          >
            <Info size={14} style={{ flexShrink: 0, marginTop: "1px", color: "#64748b" }} />
            <span>
              <strong>Chính sách:</strong> Không tính văn bản đã đánh dấu xóa khi Track Changes bật, nội dung thẻ bình luận (comment body) và tiêu đề/chân trang vào số từ chính.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div
          className="custom-margins-footer"
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "12px 20px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
          }}
        >
          <button
            type="button"
            className="btn-primary"
            onClick={closeModal}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 20px",
              borderRadius: "4px",
              background: "#1d4ed8",
              color: "#ffffff",
              border: "none",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Check size={14} />
            <span>Đóng</span>
          </button>
        </div>
      </div>
    </div>
  );
}
