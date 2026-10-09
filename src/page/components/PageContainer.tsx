import React from "react";
import { usePageSettings } from "../hooks/usePageSettings.ts";

export interface PageContainerProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  role?: string;
  "aria-label"?: string;
}

/**
 * Component vùng chứa trang giấy vật lý (Physical Paper Container).
 * Tách biệt hoàn toàn tầng hiển thị trang khỏi logic Tiptap lõi và App.tsx.
 * Áp dụng kích thước khổ giấy và lề trang từ PageSettings qua CSS variables.
 */
export function PageContainer({
  children,
  className = "",
  style = {},
  onClick,
  role = "region",
  "aria-label": ariaLabel,
}: PageContainerProps) {
  const { pageSettings, dimensions, cssVariables } = usePageSettings();

  const label =
    ariaLabel ||
    `Trang soạn thảo ${pageSettings.paperSize} (${dimensions.width} x ${dimensions.height} mm) - Hướng ${pageSettings.orientation}`;

  const mergedStyles: React.CSSProperties = {
    ...cssVariables,
    ...style,
  };

  return (
    <div
      className={`page-container-sheet ${className}`}
      style={mergedStyles}
      onClick={onClick}
      role={role}
      aria-label={label}
      data-paper-size={pageSettings.paperSize}
      data-orientation={pageSettings.orientation}
      data-margin-preset={pageSettings.marginPreset}
    >
      {children}
    </div>
  );
}

export default PageContainer;
