import { useState } from "react";
import { ArrowLeft, FileText, Info, FilePlus2, FolderOpen, Save, Printer, AlertCircle, FileDown, History } from "lucide-react";
import { useDocumentStore } from "../../stores/documentStore";
import { useEditorStore } from "../../stores/editorStore";
import { useVersionHistoryStore } from "../../stores/versionHistoryStore";
import {
  requestCreateNewDocument,
  requestOpenDocumentFile,
  saveDocumentFile,
  saveAsDocumentFile,
  exportDocxFile,
} from "../../file/fileOperations";

interface FileMenuShellProps {
  onClose: () => void;
}

export function FileMenuShell({ onClose }: FileMenuShellProps) {
  const document = useDocumentStore((state) => state.document);
  const stats = useDocumentStore((state) => state.stats);
  const filePath = useDocumentStore((state) => state.filePath);
  const isDirty = useDocumentStore((state) => state.isDirty);
  const editor = useEditorStore((state) => state.editor);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleNew = async () => {
    setErrorMessage(null);
    const res = await requestCreateNewDocument(editor);
    if (res.error) {
      setErrorMessage(res.error);
    } else if (res.success) {
      onClose();
    }
  };

  const handleOpen = async () => {
    setErrorMessage(null);
    const res = await requestOpenDocumentFile(editor);
    if (res.error) {
      setErrorMessage(res.error);
    } else if (res.success) {
      onClose();
    }
  };

  const handleSave = async () => {
    setErrorMessage(null);
    const res = await saveDocumentFile(editor);
    if (res.error) {
      setErrorMessage(res.error);
    } else if (res.success) {
      onClose();
    }
  };

  const handleSaveAs = async () => {
    setErrorMessage(null);
    const res = await saveAsDocumentFile(editor);
    if (res.error) {
      setErrorMessage(res.error);
    } else if (res.success) {
      onClose();
    }
  };

  const handleExportDocx = async () => {
    setErrorMessage(null);
    const res = await exportDocxFile(editor);
    if (res.error) {
      setErrorMessage(res.error);
    } else if (res.success) {
      onClose();
    }
  };

  const handleVersionHistory = () => {
    onClose();
    useVersionHistoryStore.getState().openHistory();
  };

  return (
    <div className="file-menu-overlay" role="dialog" aria-modal="true" aria-label="Menu File">
      <div className="file-menu-sidebar">
        <button
          type="button"
          className="file-menu-back-btn"
          onClick={onClose}
          title="Quay lại tài liệu"
        >
          <ArrowLeft size={18} />
          <span>Quay lại</span>
        </button>

        <div className="file-menu-nav">
          <button type="button" className="file-nav-item is-active">
            <Info size={16} />
            <span>Thông tin (Info)</span>
          </button>
          <button type="button" className="file-nav-item" onClick={handleNew} title="Ctrl+N">
            <FilePlus2 size={16} />
            <span>Tạo mới (New)</span>
          </button>
          <button type="button" className="file-nav-item" onClick={handleOpen} title="Ctrl+O">
            <FolderOpen size={16} />
            <span>Mở tệp (Open)</span>
          </button>
          <button type="button" className="file-nav-item" onClick={handleSave} title="Ctrl+S">
            <Save size={16} />
            <span>Lưu (Save)</span>
          </button>
          <button type="button" className="file-nav-item" onClick={handleSaveAs} title="Ctrl+Shift+S">
            <Save size={16} />
            <span>Lưu bản sao (Save As)</span>
          </button>
          <button type="button" className="file-nav-item" onClick={handleVersionHistory} title="Ctrl+Shift+H">
            <History size={16} />
            <span>Lịch sử phiên bản</span>
          </button>
          <button type="button" className="file-nav-item" onClick={handleExportDocx} title="Xuất Word (.docx)">
            <FileDown size={16} />
            <span>Xuất Word (.docx)</span>
          </button>
          <button type="button" className="file-nav-item is-disabled" title="Phase sau">
            <Printer size={16} />
            <span>In ấn (Print)</span>
          </button>
        </div>
      </div>

      <div className="file-menu-content">
        <div className="file-info-header">
          <h2>Thông tin tài liệu</h2>
          <p className="file-info-note">
            Tài liệu định dạng .mwd / .docx · Hỗ trợ tạo mới, mở, lưu và xuất Microsoft Word native trên Windows.
          </p>
          {errorMessage && (
            <div className="file-error-alert" role="alert">
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        <div className="file-info-cards">
          <div className="info-card">
            <FileText size={24} className="info-card-icon" />
            <div className="info-card-body">
              <span className="info-card-label">Tiêu đề tài liệu</span>
              <span className="info-card-value">{document.metadata.title}</span>
            </div>
          </div>

          <div className="info-card">
            <div className="info-card-body">
              <span className="info-card-label">Đường dẫn tệp trên đĩa (*.mwd)</span>
              <span className="info-card-code">
                {filePath || "Chưa lưu vào tệp (Tài liệu tạm thời)"}
              </span>
              <span className="info-card-sub" style={{ marginTop: "4px" }}>
                Trạng thái: {isDirty ? "● Có thay đổi chưa lưu" : "✓ Đã lưu đồng bộ"}
              </span>
            </div>
          </div>

          <div className="info-card">
            <div className="info-card-body">
              <span className="info-card-label">Mã định danh (ID)</span>
              <span className="info-card-code">{document.metadata.id}</span>
            </div>
          </div>

          <div className="info-grid">
            <div className="info-card">
              <span className="info-card-label">Phiên bản</span>
              <span className="info-card-value">v{document.metadata.version}</span>
            </div>
            <div className="info-card">
              <span className="info-card-label">Số từ / ký tự</span>
              <span className="info-card-value">
                {stats.words} từ · {stats.characters} ký tự
              </span>
            </div>
            <div className="info-card">
              <span className="info-card-label">Thời điểm tạo</span>
              <span className="info-card-sub">
                {new Date(document.metadata.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="info-card">
              <span className="info-card-label">Cập nhật gần nhất</span>
              <span className="info-card-sub">
                {new Date(document.metadata.updatedAt).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="file-menu-actions">
          <button type="button" className="file-return-btn" onClick={onClose}>
            Đóng menu và tiếp tục soạn thảo
          </button>
        </div>
      </div>
    </div>
  );
}
