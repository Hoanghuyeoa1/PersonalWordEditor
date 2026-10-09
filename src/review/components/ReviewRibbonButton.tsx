import React from "react";
import type { ReviewItemDescriptor } from "../types/reviewTypes";

interface ReviewRibbonButtonProps {
  descriptor: ReviewItemDescriptor;
  icon: React.ReactNode;
  size?: "large" | "small";
  isActive?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

/**
 * ReviewRibbonButton - Nút bấm trên thanh Ribbon tab Review
 *
 * Tự động đồng bộ với trạng thái trong Review Registry:
 * - Hiển thị badge "Sắp ra mắt" hoặc disabled mờ rõ ràng nếu là tính năng planned
 * - Bảo vệ focus (onMouseDown preventDefault) không làm mất dấu nháy editor
 */
export function ReviewRibbonButton({
  descriptor,
  icon,
  size = "large",
  isActive = false,
  onClick,
  disabled,
}: ReviewRibbonButtonProps) {
  const isPlanned = descriptor.status === "planned";
  const isDisabled = disabled ?? isPlanned;

  const handleMouseDown = (e: React.MouseEvent) => {
    // Ngăn chặn nút bấm làm cướp focus / dấu nháy của editor
    e.preventDefault();
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDisabled) {
      e.preventDefault();
      return;
    }
    onClick?.();
  };

  const tooltipText = isPlanned
    ? `${descriptor.tooltip} — [Tính năng đang phát triển]`
    : descriptor.shortcut
    ? `${descriptor.tooltip} (${descriptor.shortcut})`
    : descriptor.tooltip;

  if (size === "small") {
    return (
      <button
        type="button"
        className={`ribbon-tool-btn small-btn ${isActive ? "is-active" : ""}`}
        title={tooltipText}
        disabled={isDisabled}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        aria-label={descriptor.name}
        aria-disabled={isDisabled}
      >
        <span className="ribbon-btn-icon" style={{ display: "inline-flex", alignItems: "center" }}>
          {icon}
        </span>
        <span className="ribbon-btn-label">{descriptor.name}</span>
        {isPlanned && (
          <span
            style={{
              fontSize: "9px",
              padding: "1px 4px",
              borderRadius: "3px",
              background: "#f1f5f9",
              color: "#64748b",
              marginLeft: "auto",
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
      aria-label={descriptor.name}
      aria-disabled={isDisabled}
      style={{ position: "relative" }}
    >
      <span className="ribbon-btn-icon" style={{ display: "inline-flex", alignItems: "center" }}>
        {icon}
      </span>
      <span className="ribbon-btn-label" style={{ textAlign: "center", lineHeight: "1.2" }}>
        {descriptor.name}
      </span>
      {isPlanned && (
        <span
          style={{
            position: "absolute",
            top: "2px",
            right: "2px",
            fontSize: "8.5px",
            fontWeight: 500,
            padding: "0 3px",
            borderRadius: "3px",
            background: "#e2e8f0",
            color: "#64748b",
            lineHeight: "13px",
          }}
          title="Tính năng chưa khả dụng ở phase này"
        >
          {descriptor.phase}
        </span>
      )}
    </button>
  );
}
