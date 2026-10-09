import React from "react";
import type { ReferenceItemDescriptor } from "../types/referencesTypes.ts";

interface ReferencesRibbonButtonProps {
  descriptor: ReferenceItemDescriptor;
  icon: React.ReactNode;
  size?: "large" | "small";
  isActive?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  tooltip?: string;
}

/**
 * ReferencesRibbonButton - Nút bấm trên thanh Ribbon tab References
 *
 * Tự động đồng bộ với trạng thái trong References Registry:
 * - Hiển thị badge phase (ví dụ: "6.2", "6.3") rõ ràng nếu là tính năng planned
 * - Hiển thị trạng thái disabled khi tính năng chưa triển khai
 * - Bảo vệ focus (onMouseDown preventDefault) không làm mất dấu nháy editor
 * - Hỗ trợ tooltip chi tiết kèm phím tắt và nhãn tiếp cận aria-label
 */
export function ReferencesRibbonButton({
  descriptor,
  icon,
  size = "large",
  isActive = false,
  onClick,
  disabled,
  tooltip,
}: ReferencesRibbonButtonProps) {
  const isPlanned = descriptor.status === "planned";
  const isDisabled = disabled ?? isPlanned;

  const handleMouseDown = (e: React.MouseEvent) => {
    // Ngăn chặn nút bấm làm cướp focus / mất dấu nháy của editor
    e.preventDefault();
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDisabled) {
      e.preventDefault();
      return;
    }
    onClick?.();
  };

  const tooltipText =
    tooltip ??
    (isPlanned
      ? `${descriptor.tooltip} — [Tính năng đang phát triển — Phase ${descriptor.phase}]`
      : descriptor.shortcut
      ? `${descriptor.tooltip} (${descriptor.shortcut})`
      : descriptor.tooltip);

  if (size === "small") {
    return (
      <button
        type="button"
        className={`ribbon-tool-btn small-btn ${isActive ? "is-active" : ""}`}
        title={tooltipText}
        disabled={isDisabled}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        aria-label={descriptor.label}
        aria-disabled={isDisabled}
      >
        <span className="ribbon-btn-icon" style={{ display: "inline-flex", alignItems: "center" }}>
          {icon}
        </span>
        <span className="ribbon-btn-label">{descriptor.label}</span>
        {isPlanned && (
          <span
            style={{
              fontSize: "9px",
              padding: "1px 4px",
              borderRadius: "3px",
              background: "#f1f5f9",
              color: "#64748b",
              marginLeft: "auto",
              fontWeight: 500,
            }}
          >
            {descriptor.phase}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`ribbon-tool-btn large-btn ${isActive ? "is-active" : ""}`}
      title={tooltipText}
      disabled={isDisabled}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      aria-label={descriptor.label}
      aria-disabled={isDisabled}
      style={{ position: "relative" }}
    >
      <span className="ribbon-btn-icon" style={{ display: "inline-flex", alignItems: "center" }}>
        {icon}
      </span>
      <span className="ribbon-btn-label" style={{ textAlign: "center", lineHeight: "1.2" }}>
        {descriptor.label}
      </span>
      {isPlanned && (
        <span
          style={{
            position: "absolute",
            top: "2px",
            right: "2px",
            fontSize: "9px",
            padding: "1px 3px",
            borderRadius: "3px",
            background: "#f1f5f9",
            color: "#64748b",
            fontWeight: 500,
            lineHeight: 1,
          }}
        >
          {descriptor.phase}
        </span>
      )}
    </button>
  );
}
