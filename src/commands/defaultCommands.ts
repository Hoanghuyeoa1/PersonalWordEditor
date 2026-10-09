import type { EditorCommandDescriptor } from "./types.ts";
import { commandRegistry } from "./commandRegistry.ts";
import {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  setHeading,
  setParagraph,
  toggleBulletList,
  toggleOrderedList,
  setTextAlign,
} from "../editor/editorCommands.ts";
import {
  executeInsertTable,
  executeInsertImage,
  executeInsertTextBox,
  executeInsertHorizontalRule,
  executeInsertPageBreak,
  executeInsertSectionBreak,
} from "../insert/commands/insertCommands.ts";
import {
  insertTocCommand,
  insertFootnoteCommand,
  insertEndnoteCommand,
  insertTableOfFiguresCommand,
  updateTableOfFiguresCommand,
  manageBookmarksCommand,
} from "../references/commands/referencesCommands.ts";

import {
  toggleTrackChangesCommand,
  acceptChangeCommand,
  rejectChangeCommand,
  openDocumentStatisticsCommand,
} from "../review/commands/reviewCommands.ts";
import { TrackChangesService } from "../review/trackChanges/trackChangesService.ts";
import { useInsertDialogStore } from "../stores/insertDialogStore.ts";
import { useReferencesStore } from "../stores/referencesStore.ts";
import { useZoomStore, MIN_ZOOM, MAX_ZOOM } from "../stores/zoomStore.ts";
import { useFocusModeStore } from "../stores/focusModeStore.ts";
import { saveDocumentFile, saveAsDocumentFile } from "../file/fileOperations.ts";

/**
 * Trợ giúp mở hộp thoại chọn tệp hình ảnh máy tính và chèn vào editor
 */
export function triggerImageUpload(editor: import("@tiptap/core").Editor | null): void {
  if (!editor || !editor.isEditable) return;
  if (typeof document === "undefined") return;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp,image/svg+xml";
  input.style.display = "none";
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const maxBytes = 10 * 1024 * 1024; // 10MB
    if (file.size > maxBytes) {
      alert("Dung lượng tệp tin hình ảnh vượt quá giới hạn 10MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        executeInsertImage(editor, {
          src: dataUrl,
          alt: file.name.replace(/\.[^/.]+$/, ""),
          title: file.name,
          alignment: "center",
        });
      }
    };
    reader.readAsDataURL(file);
  };
  document.body.appendChild(input);
  input.click();
  setTimeout(() => {
    if (input.parentNode) {
      input.parentNode.removeChild(input);
    }
  }, 1000);
}

/**
 * Danh mục các lệnh mặc định khởi tạo ban đầu cho Unified Command System (Phase 7.1)
 * Gọi trực tiếp các command/service hiện có - Không copy business logic vào registry.
 */
export const DEFAULT_COMMANDS: EditorCommandDescriptor[] = [
  // =========================================================================
  // 1. NHÓM FORMATTING (Định dạng văn bản & đoạn văn)
  // =========================================================================
  {
    id: "format.bold",
    label: "In đậm",
    labelEn: "Bold",
    description: "Chuyển văn bản được chọn thành in đậm (Ctrl+B)",
    category: "format",
    keywords: ["bold", "dam", "in dam", "chu dam"],
    shortcut: "Ctrl+B",
    icon: "Bold",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => toggleBold(editor),
    slashEnabled: false,
    paletteEnabled: true,
  },
  {
    id: "format.italic",
    label: "In nghiêng",
    labelEn: "Italic",
    description: "Chuyển văn bản được chọn thành in nghiêng (Ctrl+I)",
    category: "format",
    keywords: ["italic", "nghieng", "in nghieng", "chu nghieng"],
    shortcut: "Ctrl+I",
    icon: "Italic",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => toggleItalic(editor),
    slashEnabled: false,
    paletteEnabled: true,
  },
  {
    id: "format.underline",
    label: "Gạch chân",
    labelEn: "Underline",
    description: "Thêm đường gạch dưới cho văn bản được chọn (Ctrl+U)",
    category: "format",
    keywords: ["underline", "gach duoi", "gach chan"],
    shortcut: "Ctrl+U",
    icon: "Underline",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => toggleUnderline(editor),
    slashEnabled: false,
    paletteEnabled: true,
  },
  {
    id: "format.strike",
    label: "Gạch ngang chữ",
    labelEn: "Strikethrough",
    description: "Gạch một đường xuyên qua văn bản được chọn",
    category: "format",
    keywords: ["strike", "strikethrough", "gach ngang", "xoa"],
    icon: "Strikethrough",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => toggleStrike(editor),
    slashEnabled: false,
    paletteEnabled: true,
  },
  {
    id: "format.heading1",
    label: "Tiêu đề 1",
    labelEn: "Heading 1",
    description: "Chuyển đổi dòng hiện tại thành Tiêu đề cấp 1 lớn",
    category: "format",
    keywords: ["heading 1", "h1", "tieu de 1", "tieu de", "header"],
    icon: "Heading1",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => setHeading(editor, 1),
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "format.heading2",
    label: "Tiêu đề 2",
    labelEn: "Heading 2",
    description: "Chuyển đổi dòng hiện tại thành Tiêu đề cấp 2",
    category: "format",
    keywords: ["heading 2", "h2", "tieu de 2", "header"],
    icon: "Heading2",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => setHeading(editor, 2),
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "format.heading3",
    label: "Tiêu đề 3",
    labelEn: "Heading 3",
    description: "Chuyển đổi dòng hiện tại thành Tiêu đề cấp 3 nhỏ",
    category: "format",
    keywords: ["heading 3", "h3", "tieu de 3", "header"],
    icon: "Heading3",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => setHeading(editor, 3),
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "format.paragraph",
    label: "Đoạn văn thường",
    labelEn: "Normal Text",
    description: "Đặt lại kiểu định dạng về đoạn văn thường (Normal/Paragraph)",
    category: "format",
    keywords: ["paragraph", "normal", "doan van", "van ban thuong", "text"],
    icon: "Pilcrow",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => setParagraph(editor),
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "format.bulletList",
    label: "Danh sách dấu đầu dòng",
    labelEn: "Bullet List",
    description: "Bật/tắt danh sách liệt kê dấu chấm tròn",
    category: "format",
    keywords: ["bullet list", "danh sach", "dau cham", "list", "bullet"],
    icon: "List",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => toggleBulletList(editor),
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "format.orderedList",
    label: "Danh sách đánh số",
    labelEn: "Numbered List",
    description: "Bật/tắt danh sách liệt kê theo số thứ tự",
    category: "format",
    keywords: ["numbered list", "ordered list", "danh sach so", "so thu tu", "123"],
    icon: "ListOrdered",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => toggleOrderedList(editor),
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "format.alignLeft",
    label: "Căn lề trái",
    labelEn: "Align Left",
    description: "Căn chỉnh lề văn bản về bên trái",
    category: "format",
    keywords: ["align left", "can trai", "le trai"],
    icon: "AlignLeft",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => setTextAlign(editor, "left"),
    slashEnabled: false,
    paletteEnabled: true,
  },
  {
    id: "format.alignCenter",
    label: "Căn giữa",
    labelEn: "Align Center",
    description: "Căn chỉnh nội dung vào chính giữa đoạn văn",
    category: "format",
    keywords: ["align center", "can giua"],
    icon: "AlignCenter",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => setTextAlign(editor, "center"),
    slashEnabled: false,
    paletteEnabled: true,
  },
  {
    id: "format.alignRight",
    label: "Căn lề phải",
    labelEn: "Align Right",
    description: "Căn chỉnh lề văn bản về bên phải",
    category: "format",
    keywords: ["align right", "can phai", "le phai"],
    icon: "AlignRight",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => setTextAlign(editor, "right"),
    slashEnabled: false,
    paletteEnabled: true,
  },
  {
    id: "format.alignJustify",
    label: "Căn đều hai bên",
    labelEn: "Justify",
    description: "Căn đều hai bên lề của đoạn văn",
    category: "format",
    keywords: ["justify", "align justify", "can deu"],
    icon: "AlignJustify",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => setTextAlign(editor, "justify"),
    slashEnabled: false,
    paletteEnabled: true,
  },

  // =========================================================================
  // 2. NHÓM INSERT (Chèn phần tử & Đối tượng)
  // =========================================================================
  {
    id: "insert.table",
    label: "Chèn bảng",
    labelEn: "Insert Table",
    description: "Chèn một bảng dữ liệu 3x3 vào vị trí con trỏ",
    category: "insert",
    keywords: ["table", "bang", "chen bang", "grid", "hang cot"],
    icon: "Table",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => {
      const res = executeInsertTable(editor, { rows: 3, cols: 3, withHeaderRow: true });
      return res.success;
    },
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "insert.image",
    label: "Chèn hình ảnh",
    labelEn: "Insert Image",
    description: "Chọn và chèn hình ảnh từ máy tính (PNG, JPG, WEBP, SVG)",
    category: "insert",
    keywords: ["image", "picture", "photo", "hinh anh", "anh", "chen hinh"],
    icon: "Image",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => {
      triggerImageUpload(editor);
      return true;
    },
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "insert.link",
    label: "Chèn liên kết",
    labelEn: "Insert Hyperlink",
    description: "Gán siêu liên kết web hoặc bookmark vào văn bản (Ctrl+K)",
    category: "insert",
    keywords: ["link", "hyperlink", "lien ket", "url", "web"],
    shortcut: "Ctrl+K",
    icon: "Link",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: () => {
      useInsertDialogStore.getState().openLinkDialog();
      return true;
    },
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "insert.textBox",
    label: "Chèn khung chữ",
    labelEn: "Insert Text Box",
    description: "Chèn một khung chứa văn bản nổi (Text Box)",
    category: "insert",
    keywords: ["textbox", "text box", "khung chu", "hop van ban"],
    icon: "Square",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => {
      const res = executeInsertTextBox(editor, { initialText: "Văn bản trong khung" });
      return res.success;
    },
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "insert.horizontalRule",
    label: "Chèn đường kẻ ngang",
    labelEn: "Horizontal Line",
    description: "Chèn một đường phân cách ngang trang văn bản",
    category: "insert",
    keywords: ["horizontal rule", "hr", "line", "duong ke", "duong ke ngang", "divider"],
    icon: "Minus",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => {
      const res = executeInsertHorizontalRule(editor);
      return res.success;
    },
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "insert.equation",
    label: "Chèn công thức toán",
    labelEn: "Insert Equation",
    description: "Mở hộp thoại soạn thảo và chèn công thức toán học LaTeX",
    category: "insert",
    keywords: ["equation", "math", "formula", "toan", "cong thuc", "latex"],
    icon: "Binary",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: () => {
      useInsertDialogStore.getState().openEquationDialog();
      return true;
    },
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "insert.symbol",
    label: "Chèn ký tự đặc biệt",
    labelEn: "Insert Symbol",
    description: "Mở bảng chọn ký tự đặc biệt và ký hiệu toán học",
    category: "insert",
    keywords: ["symbol", "ky tu", "ky hieu", "special character", "icon"],
    icon: "Sparkles",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: () => {
      useInsertDialogStore.getState().openSymbolDialog();
      return true;
    },
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "insert.pageBreak",
    label: "Ngắt trang",
    labelEn: "Page Break",
    description: "Ngắt nội dung sang trang tiếp theo (Ctrl+Enter)",
    category: "insert",
    keywords: ["page break", "ngat trang", "trang moi", "sang trang"],
    shortcut: "Ctrl+Enter",
    icon: "FileText",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => {
      const res = executeInsertPageBreak(editor);
      return res.success;
    },
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "insert.sectionBreak",
    label: "Ngắt phần",
    labelEn: "Section Break",
    description: "Tạo phân đoạn mới với định dạng khổ giấy và lề độc lập",
    category: "insert",
    keywords: ["section break", "ngat phan", "phan moi", "section"],
    icon: "FilePlus",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => {
      const res = executeInsertSectionBreak(editor);
      return res.success;
    },
    slashEnabled: true,
    paletteEnabled: true,
  },

  // =========================================================================
  // 3. NHÓM REFERENCES & NAVIGATION (Tham chiếu & Điều hướng)
  // =========================================================================
  {
    id: "references.documentOutline",
    label: "Sơ đồ đề mục",
    labelEn: "Document Outline",
    description: "Bật/tắt thanh bên sơ đồ cấu trúc đề mục Heading của tài liệu",
    category: "references",
    keywords: ["outline", "so do de muc", "sidebar", "navigation", "muc luc ben"],
    icon: "Compass",
    execute: () => {
      useReferencesStore.getState().toggleReferencePanel("outline");
      return true;
    },
    slashEnabled: false,
    paletteEnabled: true,
  },
  {
    id: "references.tableOfContents",
    label: "Chèn mục lục",
    labelEn: "Table of Contents",
    description: "Tự động sinh khối Mục lục từ các tiêu đề Heading trong tài liệu",
    category: "references",
    keywords: ["table of contents", "toc", "muc luc", "danh muc"],
    icon: "BookOpen",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => {
      const res = insertTocCommand(editor);
      return res.success;
    },
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "references.tableOfFigures",
    label: "Chèn danh mục hình",
    labelEn: "Insert Table of Figures",
    description: "Tự động sinh khối Danh mục hình ảnh và bảng biểu từ các chú thích",
    category: "references",
    keywords: ["table of figures", "tof", "danh muc hinh", "danh muc bang", "figures"],
    icon: "ListOrdered",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => {
      const res = insertTableOfFiguresCommand(editor);
      return res.success;
    },
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "references.updateTableOfFigures",
    label: "Cập nhật danh mục",
    labelEn: "Update Table of Figures",
    description: "Cập nhật lại số trang và các mục trong danh mục hình/bảng (F9)",
    category: "references",
    keywords: ["update table of figures", "cap nhat danh muc", "f9", "update list"],
    icon: "RefreshCw",
    shortcut: "F9",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => {
      const res = updateTableOfFiguresCommand(editor);
      return res.success;
    },
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "references.bookmarks",
    label: "Quản lý thẻ đánh dấu",
    labelEn: "Bookmark Manager",
    description: "Mở hộp thoại quản lý và điều hướng thẻ đánh dấu trong tài liệu",
    category: "references",
    keywords: ["bookmark", "the danh dau", "danh dau", "bookmarks"],
    icon: "Bookmark",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => {
      const res = manageBookmarksCommand(editor);
      return res.success;
    },
    slashEnabled: true,
    paletteEnabled: true,
  },

  {
    id: "references.footnote",
    label: "Chèn chú thích chân trang",
    labelEn: "Insert Footnote",
    description: "Chèn ký hiệu chú thích ở chân trang hiện tại",
    category: "references",
    keywords: ["footnote", "chu thich chan trang", "ghi chu chan trang"],
    icon: "FileDown",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => {
      const res = insertFootnoteCommand(editor);
      return res.success;
    },
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "references.endnote",
    label: "Chèn chú thích cuối tài liệu",
    labelEn: "Insert Endnote",
    description: "Chèn ký hiệu chú thích ở cuối toàn bộ tài liệu",
    category: "references",
    keywords: ["endnote", "chu thich cuoi", "ghi chu cuoi bai"],
    icon: "ScrollText",
    canExecute: ({ editor }) => Boolean(editor && editor.isEditable),
    execute: ({ editor }) => {
      const res = insertEndnoteCommand(editor);
      return res.success;
    },
    slashEnabled: true,
    paletteEnabled: true,
  },

  // =========================================================================
  // 4. NHÓM REVIEW & PROOFING (Soát lỗi & Theo dõi thay đổi)
  // =========================================================================
  {
    id: "review.trackChanges",
    label: "Bật/Tắt theo dõi thay đổi",
    labelEn: "Toggle Track Changes",
    description: "Theo dõi và ghi nhận mọi thao tác thêm/xóa văn bản (Ctrl+Shift+E)",
    category: "review",
    keywords: ["track changes", "theo doi thay doi", "ghi nhan thay doi"],
    shortcut: "Ctrl+Shift+E",
    icon: "History",
    execute: () => {
      toggleTrackChangesCommand();
      return true;
    },
    slashEnabled: false,
    paletteEnabled: true,
  },
  {
    id: "review.acceptChange",
    label: "Chấp nhận thay đổi",
    labelEn: "Accept Change",
    description: "Chấp nhận chỉnh sửa hiện tại đang được con trỏ trỏ tới",
    category: "review",
    keywords: ["accept change", "chap nhan thay doi", "dong y"],
    icon: "Check",
    canExecute: ({ editor }) =>
      Boolean(editor && editor.isEditable && TrackChangesService.resolveTargetChangeId(editor)),
    execute: ({ editor }) => {
      const res = acceptChangeCommand(editor);
      return res.success;
    },
    slashEnabled: false,
    paletteEnabled: true,
  },
  {
    id: "review.rejectChange",
    label: "Từ chối thay đổi",
    labelEn: "Reject Change",
    description: "Khôi phục lại nội dung trước khi chỉnh sửa hiện tại",
    category: "review",
    keywords: ["reject change", "tu choi thay doi", "huy bo"],
    icon: "X",
    canExecute: ({ editor }) =>
      Boolean(editor && editor.isEditable && TrackChangesService.resolveTargetChangeId(editor)),
    execute: ({ editor }) => {
      const res = rejectChangeCommand(editor);
      return res.success;
    },
    slashEnabled: false,
    paletteEnabled: true,
  },
  {
    id: "review.statistics",
    label: "Thống kê tài liệu",
    labelEn: "Document Statistics",
    description: "Mở bảng đếm số từ, ký tự, đoạn văn và thống kê chi tiết (Ctrl+Shift+G)",
    category: "review",
    keywords: ["statistics", "word count", "dem tu", "thong ke", "so tu"],
    shortcut: "Ctrl+Shift+G",
    icon: "BarChart2",
    execute: () => {
      openDocumentStatisticsCommand();
      return true;
    },
    slashEnabled: false,
    paletteEnabled: true,
  },

  // =========================================================================
  // 5. NHÓM VIEW & FILE (Xem & Tệp an toàn)
  // =========================================================================
  {
    id: "view.toggleFocusMode",
    label: "Chế độ tập trung (Focus Mode)",
    labelEn: "Focus Mode",
    description: "Bật hoặc tắt chế độ soạn thảo toàn màn hình không gây xao nhãng (F11 / Ctrl+Shift+D)",
    category: "view",
    keywords: ["focus", "zen", "tap trung", "fullscreen", "distraction free", "focus mode"],
    shortcut: "F11",
    icon: "Maximize2",
    execute: () => {
      useFocusModeStore.getState().toggleFocusMode();
      return true;
    },
    slashEnabled: true,
    paletteEnabled: true,
  },
  {
    id: "view.zoomIn",
    label: "Phóng to",
    labelEn: "Zoom In",
    description: "Tăng mức thu phóng trang tài liệu (Ctrl++)",
    category: "view",
    keywords: ["zoom in", "phong to", "tang thu phong"],
    shortcut: "Ctrl++",
    icon: "ZoomIn",
    canExecute: () => useZoomStore.getState().zoom < MAX_ZOOM,
    execute: () => {
      useZoomStore.getState().zoomIn();
      return true;
    },
    slashEnabled: false,
    paletteEnabled: true,
  },
  {
    id: "view.zoomOut",
    label: "Thu nhỏ",
    labelEn: "Zoom Out",
    description: "Giảm mức thu phóng trang tài liệu (Ctrl+-)",
    category: "view",
    keywords: ["zoom out", "thu nho", "giam thu phong"],
    shortcut: "Ctrl+-",
    icon: "ZoomOut",
    canExecute: () => useZoomStore.getState().zoom > MIN_ZOOM,
    execute: () => {
      useZoomStore.getState().zoomOut();
      return true;
    },
    slashEnabled: false,
    paletteEnabled: true,
  },
  {
    id: "view.resetZoom",
    label: "Đặt lại thu phóng (100%)",
    labelEn: "Reset Zoom",
    description: "Đưa mức thu phóng trang về mặc định 100% (Ctrl+0)",
    category: "view",
    keywords: ["reset zoom", "100%", "dat lai thu phong"],
    shortcut: "Ctrl+0",
    icon: "RotateCcw",
    canExecute: () => useZoomStore.getState().zoom !== 100,
    execute: () => {
      useZoomStore.getState().resetZoom();
      return true;
    },
    slashEnabled: false,
    paletteEnabled: true,
  },
  {
    id: "file.save",
    label: "Lưu tài liệu",
    labelEn: "Save",
    description: "Lưu các thay đổi của tài liệu hiện tại (Ctrl+S)",
    category: "file",
    keywords: ["save", "luu", "luu tep"],
    shortcut: "Ctrl+S",
    icon: "Save",
    execute: ({ editor }) => {
      saveDocumentFile(editor);
      return true;
    },
    slashEnabled: false,
    paletteEnabled: true,
  },
  {
    id: "file.saveAs",
    label: "Lưu thành tệp mới",
    labelEn: "Save As",
    description: "Lưu tài liệu ra một vị trí tệp tin mới (Ctrl+Shift+S)",
    category: "file",
    keywords: ["save as", "luu moi", "luu thanh"],
    shortcut: "Ctrl+Shift+S",
    icon: "Save",
    execute: ({ editor }) => {
      saveAsDocumentFile(editor);
      return true;
    },
    slashEnabled: false,
    paletteEnabled: true,
  },
  {
    id: "file.versionHistory",
    label: "Lịch sử phiên bản",
    labelEn: "Version History",
    description: "Xem và khôi phục các bản sao lưu lịch sử của tài liệu (Ctrl+Shift+H)",
    category: "file",
    keywords: ["version history", "lich su", "phien ban", "snapshot", "backup", "sao luu", "recovery"],
    shortcut: "Ctrl+Shift+H",
    icon: "History",
    execute: () => {
      import("../stores/versionHistoryStore.ts").then(({ useVersionHistoryStore }) => {
        useVersionHistoryStore.getState().openHistory();
      });
      return true;
    },
    slashEnabled: false,
    paletteEnabled: true,
  },
];

// Tự động đăng ký các lệnh mặc định vào Registry Singleton
if (commandRegistry.getAll().length === 0) {
  commandRegistry.registerAll(DEFAULT_COMMANDS);
}
