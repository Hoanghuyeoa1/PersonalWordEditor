import { Sparkles } from "lucide-react";

interface RibbonTabPlaceholderProps {
  tabName: string;
}

const TAB_DESCRIPTIONS: Record<string, string> = {
  Insert: "Khu vực chèn bảng biểu, hình ảnh, liên kết, số trang và ký hiệu đặc biệt.",
  Layout: "Khu vực cấu hình hướng giấy, lề tài liệu, kích thước và định dạng cột.",
  References: "Khu vực quản lý mục lục tự động, chú thích cuối trang và trích dẫn.",
  Review: "Khu vực kiểm tra chính tả, đếm từ, quản lý bình luận và theo dõi thay đổi.",
  View: "Khu vực chuyển đổi chế độ xem trang, phóng to/thu nhỏ và thước kẻ định vị.",
};

export function RibbonTabPlaceholder({ tabName }: RibbonTabPlaceholderProps) {
  const description = TAB_DESCRIPTIONS[tabName] ?? "Các chức năng sẽ được phát triển ở các phase sau.";

  return (
    <div className="ribbon-tab-content ribbon-placeholder-tab" role="region" aria-label={`Tab ${tabName}`}>
      <div className="ribbon-placeholder-inner">
        <Sparkles size={18} className="placeholder-icon" />
        <div className="placeholder-text">
          <span className="placeholder-title">Tab {tabName} (Placeholder)</span>
          <span className="placeholder-desc">{description}</span>
        </div>
        <span className="placeholder-badge">Sẽ phát triển ở phase sau</span>
      </div>
    </div>
  );
}
