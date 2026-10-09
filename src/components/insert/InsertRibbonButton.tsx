import React from "react";
import type { LucideIcon } from "lucide-react";
import type { InsertItemDescriptor } from "../../insert/types/insertTypes.ts";

interface InsertRibbonButtonProps {
  /** Bản ghi mô tả của phần tử chèn */
  item?: InsertItemDescriptor;
  /** Nhãn hiển thị chính */
  label: string;
  /** Biểu tượng Lucide hoặc React Node */
  icon?: LucideIcon | React.ReactNode;
  /** Phím tắt hiển thị nếu có */
  shortcut?: string;
  /** Trạng thái vô hiệu hóa (disabled / placeholder) */
  disabled?: boolean;
  /** Kích thước nút: 'large' (mặc định) hoặc 'small' */
  variant?: "large" | "small";
  /** Callback khi click */
  onClick?: () => void;
  /** Tooltip ghi đè nếu cần */
  title?: string;
  /** CSS class bổ sung */
  className?: string;
  /** Custom icon size */
  iconSize?: number;
}

/**
 * Reusable Ribbon Button cho Insert Tab.
 * Đảm bảo:
 * 1. preventBlur khi mouseDown tránh mất con trỏ editor
 * 2. Disabled states thể hiện rõ ràng cho các tính năng chưa triển khai
 * 3. Hỗ trợ đầy đủ phím tắt và nhãn chú thích
 */
export function InsertRibbonButton({
  item,
  label,
  icon: Icon,
  shortcut,
  disabled = false,
  variant = "large",
  onClick,
  title,
  className = "",
  iconSize = 22,
}: InsertRibbonButtonProps) {
  const preventBlur = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const isActuallyDisabled = disabled || (item ? item.status !== "active" : false);

  const displayTitle =
    title ||
    (item
      ? `${item.tooltip}${item.shortcut ? ` (${item.shortcut})` : ""}`
      : `${label}${shortcut ? ` (${shortcut})` : ""}`);

  const renderIcon = () => {
    if (!Icon) return null;
    if (React.isValidElement(Icon)) return Icon;
    const Component = Icon as LucideIcon;
    return <Component size={variant === "large" ? iconSize : 14} aria-hidden="true" />;
  };

  if (variant === "small") {
    return (
      <button
        type="button"
        className={`ribbon-tool-btn small-btn insert-btn-small ${isActuallyDisabled ? "is-disabled" : ""} ${className}`}
        disabled={isActuallyDisabled}
        aria-disabled={isActuallyDisabled}
        onMouseDown={preventBlur}
        onClick={isActuallyDisabled ? undefined : onClick}
        title={displayTitle}
        aria-label={label}
      >
        {renderIcon()}
        <span className="insert-btn-label">{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`ribbon-tool-btn large-btn insert-btn-large ${isActuallyDisabled ? "is-disabled" : ""} ${className}`}
      disabled={isActuallyDisabled}
      aria-disabled={isActuallyDisabled}
      onMouseDown={preventBlur}
      onClick={isActuallyDisabled ? undefined : onClick}
      title={displayTitle}
      aria-label={label}
    >
      <div className="insert-btn-icon-wrapper">{renderIcon()}</div>
      <span className="insert-btn-label">{label}</span>
      {isActuallyDisabled && <span className="insert-btn-badge">Sắp có</span>}
    </button>
  );
}
