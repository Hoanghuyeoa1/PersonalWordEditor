import type { FormattingPropertyDiff, FormattingRevisionScope, TrackChangeType } from "../../document/documentTypes.ts";

/**
 * Ánh xạ tên thuộc tính kỹ thuật sang nhãn tiếng Việt và định dạng giá trị Before -> After
 */
export function formatPropertyDiffDisplay(diff: FormattingPropertyDiff): {
  label: string;
  beforeDisplay: string;
  afterDisplay: string;
} {
  const prop = diff.property;
  const before = diff.before;
  const after = diff.after;

  switch (prop) {
    case "fontSize":
      return {
        label: "Cỡ chữ",
        beforeDisplay: before ? `${String(before).replace(/pt$/, "")}pt` : "12pt",
        afterDisplay: `${String(after).replace(/pt$/, "")}pt`,
      };

    case "fontFamily":
      return {
        label: "Phông chữ",
        beforeDisplay: before ? String(before) : "Mặc định",
        afterDisplay: String(after),
      };

    case "bold":
      return {
        label: "In đậm",
        beforeDisplay: before ? "Bật" : "Tắt",
        afterDisplay: after ? "Bật" : "Tắt",
      };

    case "italic":
      return {
        label: "In nghiêng",
        beforeDisplay: before ? "Bật" : "Tắt",
        afterDisplay: after ? "Bật" : "Tắt",
      };

    case "underline":
      return {
        label: "Gạch chân",
        beforeDisplay: before ? "Bật" : "Tắt",
        afterDisplay: after ? "Bật" : "Tắt",
      };

    case "strike":
      return {
        label: "Gạch ngang",
        beforeDisplay: before ? "Bật" : "Tắt",
        afterDisplay: after ? "Bật" : "Tắt",
      };

    case "color":
      return {
        label: "Màu chữ",
        beforeDisplay: before ? String(before) : "Mặc định",
        afterDisplay: String(after),
      };

    case "highlight":
      return {
        label: "Màu nền highlight",
        beforeDisplay: before ? String(before) : "Không màu",
        afterDisplay: after ? String(after) : "Không màu",
      };

    case "textAlign":
    case "alignment": {
      const translateAlign = (val: any) => {
        if (!val || val === "left") return "Trái (Left)";
        if (val === "center") return "Giữa (Center)";
        if (val === "right") return "Phải (Right)";
        if (val === "justify") return "Đều hai bên (Justify)";
        return String(val);
      };
      return {
        label: "Căn lề",
        beforeDisplay: translateAlign(before),
        afterDisplay: translateAlign(after),
      };
    }

    case "lineSpacing":
      return {
        label: "Giãn dòng",
        beforeDisplay: before ? String(before) : "1.15",
        afterDisplay: String(after),
      };

    case "spaceBefore":
      return {
        label: "Cách đoạn trước",
        beforeDisplay: before !== null && before !== undefined ? `${before}pt` : "0pt",
        afterDisplay: `${after}pt`,
      };

    case "spaceAfter":
      return {
        label: "Cách đoạn sau",
        beforeDisplay: before !== null && before !== undefined ? `${before}pt` : "0pt",
        afterDisplay: `${after}pt`,
      };

    case "indentLeft":
      return {
        label: "Thụt lề trái",
        beforeDisplay: before !== null && before !== undefined ? `${before}cm` : "0cm",
        afterDisplay: `${after}cm`,
      };

    case "indentRight":
      return {
        label: "Thụt lề phải",
        beforeDisplay: before !== null && before !== undefined ? `${before}cm` : "0cm",
        afterDisplay: `${after}cm`,
      };

    case "firstLineIndent":
      return {
        label: "Thụt dòng đầu",
        beforeDisplay: before !== null && before !== undefined ? `${before}cm` : "0cm",
        afterDisplay: `${after}cm`,
      };

    case "hangingIndent":
      return {
        label: "Nhô dòng đầu",
        beforeDisplay: before !== null && before !== undefined ? `${before}cm` : "0cm",
        afterDisplay: `${after}cm`,
      };

    case "paragraphStyleId": {
      const formatStyle = (id: any) => {
        if (!id || id === "style_normal") return "Normal";
        if (id === "style_heading_1") return "Heading 1";
        if (id === "style_heading_2") return "Heading 2";
        if (id === "style_heading_3") return "Heading 3";
        return String(id);
      };
      return {
        label: "Kiểu đoạn văn",
        beforeDisplay: formatStyle(before),
        afterDisplay: formatStyle(after),
      };
    }

    case "characterStyleId": {
      const formatCharStyle = (id: any) => {
        if (!id) return "Mặc định (None)";
        return String(id);
      };
      return {
        label: "Kiểu ký tự",
        beforeDisplay: formatCharStyle(before),
        afterDisplay: formatCharStyle(after),
      };
    }

    case "headingLevel":
      return {
        label: "Cấp độ đề mục",
        beforeDisplay: before ? `Cấp ${before}` : "Đoạn thường",
        afterDisplay: after ? `Cấp ${after}` : "Đoạn thường",
      };

    default:
      return {
        label: prop,
        beforeDisplay: before !== null && before !== undefined ? String(before) : "Trống",
        afterDisplay: after !== null && after !== undefined ? String(after) : "Trống",
      };
  }
}

/**
 * Trả về huy hiệu phạm vi định dạng (Scope Badge)
 */
export function getScopeBadge(scope?: FormattingRevisionScope): {
  label: string;
  bg: string;
  color: string;
} {
  switch (scope) {
    case "paragraph":
      return { label: "Đoạn văn", bg: "#f3e8ff", color: "#7e22ce" };
    case "style":
      return { label: "Kiểu dáng", bg: "#e0e7ff", color: "#4338ca" };
    case "character":
    default:
      return { label: "Ký tự", bg: "#ede9fe", color: "#6d28d9" };
  }
}

/**
 * Trả về huy hiệu phân loại thay đổi (Change Type Badge)
 */
export function getChangeTypeBadge(type: TrackChangeType): {
  label: string;
  bg: string;
  color: string;
  badgeClass: string;
} {
  switch (type) {
    case "insert":
      return { label: "Thêm mới", bg: "#dcfce7", color: "#15803d", badgeClass: "badge-insert" };
    case "delete":
      return { label: "Xóa bỏ", bg: "#fee2e2", color: "#b91c1c", badgeClass: "badge-delete" };
    case "format":
      return { label: "Định dạng", bg: "#f3e8ff", color: "#7e22ce", badgeClass: "badge-format" };
    default:
      return { label: type, bg: "#f1f5f9", color: "#475569", badgeClass: `badge-${type}` };
  }
}

/**
 * Định dạng mốc thời gian hiển thị thân thiện
 */
export function formatRevisionTimestamp(isoTimestamp?: string): string {
  if (!isoTimestamp) return "";
  try {
    const d = new Date(isoTimestamp);
    if (isNaN(d.getTime())) return isoTimestamp;
    return d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }) + " " + d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return isoTimestamp;
  }
}
