import React, { useState, useEffect, useRef } from "react";
import { SlidersHorizontal, AlertCircle, X, Check } from "lucide-react";
import type { PageMargins, PaperSizeName, PageOrientation } from "../../page/types/pageTypes.ts";
import {
  getPageDimensions,
  mmToCm,
  cmToMm,
  validateCustomMargins,
} from "../../page/services/pageSettingsService.ts";

export interface CustomMarginsDialogProps {
  /** Trạng thái mở modal */
  isOpen: boolean;
  /** Lề trang hiện tại (đơn vị mm) */
  initialMargins: PageMargins;
  /** Khổ giấy hiện tại */
  paperSize: PaperSizeName;
  /** Hướng trang hiện tại */
  orientation: PageOrientation;
  /** Callback đóng modal (không lưu) */
  onClose: () => void;
  /** Callback áp dụng lề trang mới (đơn vị mm) */
  onApply: (margins: PageMargins) => void;
}

/**
 * Component hộp thoại tùy chỉnh lề trang (Custom Margins Dialog).
 *
 * Tính năng:
 * - Nhập lề 4 phía: Top, Bottom, Left, Right bằng đơn vị cm thân thiện với người dùng
 * - Chuyển đổi chính xác 1 cm = 10 mm về đơn vị nội bộ
 * - Validation nghiêm ngặt theo kích thước khổ giấy thực tế
 * - Chặn NaN, số âm, Infinity, lề quá lớn làm mất diện tích nội dung
 * - Áp dụng (Apply) cập nhật PageSettings và kích hoạt dirty state
 * - Hủy (Cancel) hoặc Escape đóng hộp thoại mà không làm thay đổi tài liệu
 */
export function CustomMarginsDialog({
  isOpen,
  initialMargins,
  paperSize,
  orientation,
  onClose,
  onApply,
}: CustomMarginsDialogProps) {
  const [topCm, setTopCm] = useState("");
  const [bottomCm, setBottomCm] = useState("");
  const [leftCm, setLeftCm] = useState("");
  const [rightCm, setRightCm] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const topInputRef = useRef<HTMLInputElement>(null);
  const paperDimensions = getPageDimensions(paperSize, orientation);

  // Khởi tạo giá trị khi mở hộp thoại
  useEffect(() => {
    if (isOpen) {
      setTopCm(mmToCm(initialMargins.top).toString());
      setBottomCm(mmToCm(initialMargins.bottom).toString());
      setLeftCm(mmToCm(initialMargins.left).toString());
      setRightCm(mmToCm(initialMargins.right).toString());
      setErrorMessage(null);

      // Autofocus vào ô lề trên
      setTimeout(() => {
        topInputRef.current?.focus();
        topInputRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialMargins]);

  // Lắng nghe phím Escape và Enter toàn cục trên dialog
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Chuyển chuỗi nhập (hỗ trợ cả dấu chấm và phẩy) thành số cm
  const parseInputToCm = (val: string): number => {
    const cleaned = val.trim().replace(",", ".");
    return Number(cleaned);
  };

  // Tính candidate margins theo mm
  const getCandidateMargins = (): PageMargins => {
    return {
      top: cmToMm(parseInputToCm(topCm)),
      bottom: cmToMm(parseInputToCm(bottomCm)),
      left: cmToMm(parseInputToCm(leftCm)),
      right: cmToMm(parseInputToCm(rightCm)),
    };
  };

  // Kiểm tra hợp lệ thời gian thực
  const candidateMargins = getCandidateMargins();
  const validationResult = validateCustomMargins(candidateMargins, paperDimensions);

  const usableWidthCm = validationResult.usableWidth !== undefined
    ? Math.max(0, mmToCm(validationResult.usableWidth))
    : 0;
  const usableHeightCm = validationResult.usableHeight !== undefined
    ? Math.max(0, mmToCm(validationResult.usableHeight))
    : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const candidate = getCandidateMargins();
    const validation = validateCustomMargins(candidate, paperDimensions);

    if (!validation.isValid) {
      setErrorMessage(validation.error || "Giá trị lề không hợp lệ.");
      return;
    }

    onApply(candidate);
    onClose();
  };

  const orientationText = orientation === "portrait" ? "Dọc" : "Ngang";
  const paperWidthCm = mmToCm(paperDimensions.width);
  const paperHeightCm = mmToCm(paperDimensions.height);

  return (
    <div
      className="custom-margins-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-margins-title"
      onClick={onClose}
    >
      <div
        className="custom-margins-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="custom-margins-header">
          <div className="custom-margins-header-icon">
            <SlidersHorizontal size={20} color="#1d4ed8" />
          </div>
          <div className="custom-margins-header-text">
            <h2 id="custom-margins-title">Tùy chỉnh lề trang (Custom Margins)</h2>
            <span className="custom-margins-subtitle">
              Khổ giấy: {paperSize} · {orientationText} ({paperWidthCm} × {paperHeightCm} cm)
            </span>
          </div>
          <button
            type="button"
            className="custom-margins-close-btn"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="custom-margins-body">
            <p className="custom-margins-instruction">
              Nhập khoảng cách lề theo đơn vị <strong>Centimet (cm)</strong>. Hệ thống sẽ tự động quy đổi chính xác về chuẩn vật lý milimet.
            </p>

            <div className="custom-margins-grid">
              {/* Lề Trên */}
              <div className="custom-margins-field">
                <label htmlFor="margin-top">Lề trên (Top):</label>
                <div className="custom-margins-input-wrap">
                  <input
                    ref={topInputRef}
                    id="margin-top"
                    type="number"
                    step="0.05"
                    min="0"
                    value={topCm}
                    onChange={(e) => {
                      setTopCm(e.target.value);
                      setErrorMessage(null);
                    }}
                    required
                  />
                  <span className="custom-margins-unit">cm</span>
                </div>
              </div>

              {/* Lề Dưới */}
              <div className="custom-margins-field">
                <label htmlFor="margin-bottom">Lề dưới (Bottom):</label>
                <div className="custom-margins-input-wrap">
                  <input
                    id="margin-bottom"
                    type="number"
                    step="0.05"
                    min="0"
                    value={bottomCm}
                    onChange={(e) => {
                      setBottomCm(e.target.value);
                      setErrorMessage(null);
                    }}
                    required
                  />
                  <span className="custom-margins-unit">cm</span>
                </div>
              </div>

              {/* Lề Trái */}
              <div className="custom-margins-field">
                <label htmlFor="margin-left">Lề trái (Left):</label>
                <div className="custom-margins-input-wrap">
                  <input
                    id="margin-left"
                    type="number"
                    step="0.05"
                    min="0"
                    value={leftCm}
                    onChange={(e) => {
                      setLeftCm(e.target.value);
                      setErrorMessage(null);
                    }}
                    required
                  />
                  <span className="custom-margins-unit">cm</span>
                </div>
              </div>

              {/* Lề Phải */}
              <div className="custom-margins-field">
                <label htmlFor="margin-right">Lề phải (Right):</label>
                <div className="custom-margins-input-wrap">
                  <input
                    id="margin-right"
                    type="number"
                    step="0.05"
                    min="0"
                    value={rightCm}
                    onChange={(e) => {
                      setRightCm(e.target.value);
                      setErrorMessage(null);
                    }}
                    required
                  />
                  <span className="custom-margins-unit">cm</span>
                </div>
              </div>
            </div>

            {/* Thông tin vùng khả dụng */}
            <div className="custom-margins-preview">
              <span className="preview-label">Vùng nội dung khả dụng:</span>
              <span className={`preview-val ${usableWidthCm <= 0 || usableHeightCm <= 0 ? "is-invalid" : ""}`}>
                {usableWidthCm.toFixed(2)} × {usableHeightCm.toFixed(2)} cm
              </span>
            </div>

            {/* Hiển thị lỗi nếu có */}
            {errorMessage && (
              <div className="custom-margins-error-alert" role="alert">
                <AlertCircle size={16} />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          <div className="custom-margins-actions">
            <button
              type="button"
              className="confirm-btn confirm-btn-cancel"
              onClick={onClose}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="confirm-btn confirm-btn-save"
            >
              <Check size={16} />
              Áp dụng
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CustomMarginsDialog;
