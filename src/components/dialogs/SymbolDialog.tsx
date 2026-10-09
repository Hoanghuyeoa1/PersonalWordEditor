import { useState, useEffect, useMemo, useRef } from "react";
import { Omega, Search, X, Check } from "lucide-react";
import {
  POPULAR_SYMBOLS,
  SYMBOL_CATEGORIES,
  filterSymbols,
  type SymbolItem,
} from "../../insert/services/symbolService.ts";

export interface SymbolDialogProps {
  /** Trạng thái hiển thị modal */
  isOpen: boolean;
  /** Callback đóng modal */
  onClose: () => void;
  /** Callback khi chọn chèn một symbol */
  onSelect: (symbol: string) => void;
}

export function SymbolDialog({ isOpen, onClose, onSelect }: SymbolDialogProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSymbol, setActiveSymbol] = useState<SymbolItem>(POPULAR_SYMBOLS[0]);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setSelectedCategory("all");
      setActiveSymbol(POPULAR_SYMBOLS[0]);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Đóng bằng Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const filteredSymbols = useMemo(() => {
    return filterSymbols(selectedCategory, searchQuery);
  }, [selectedCategory, searchQuery]);

  if (!isOpen) return null;

  const handleInsert = (sym?: SymbolItem) => {
    const target = sym || activeSymbol;
    if (target) {
      onSelect(target.char);
      onClose();
    }
  };

  return (
    <div
      className="custom-margins-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="symbol-dialog-title"
      onClick={onClose}
    >
      <div
        className="custom-margins-card symbol-dialog"
        role="document"
        style={{ maxWidth: "580px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="custom-margins-header">
          <div className="custom-margins-header-icon">
            <Omega size={20} color="#1d4ed8" aria-hidden="true" />
          </div>
          <div className="custom-margins-header-text">
            <h2 id="symbol-dialog-title">Chèn ký hiệu đặc biệt (Symbol)</h2>
            <span className="custom-margins-subtitle">
              Ký tự Unicode chuẩn · Giữ nguyên định dạng font
            </span>
          </div>
          <button
            type="button"
            className="custom-margins-close-btn"
            onClick={onClose}
            title="Đóng hộp thoại (Escape)"
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        <div className="custom-margins-body" style={{ padding: "14px 20px" }}>
          {/* Top Bar: Search & Category Filter */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px", alignItems: "center" }}>
            <div className="custom-margins-input-wrap" style={{ position: "relative", flex: 1 }}>
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: "9px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                }}
              />
              <input
                ref={searchInputRef}
                type="text"
                style={{ width: "100%", paddingLeft: "28px" }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm ký hiệu (vd: copyright, euro, mũi tên)..."
              />
            </div>
            <div className="custom-margins-input-wrap" style={{ width: "160px" }}>
              <select
                style={{
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  padding: "6px 10px",
                  fontSize: "12.5px",
                  color: "#0f172a",
                  outline: "none",
                }}
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                aria-label="Chọn nhóm ký hiệu"
              >
                <option value="all">Tất cả nhóm</option>
                {SYMBOL_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Symbol Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(42px, 1fr))",
              gap: "4px",
              maxHeight: "220px",
              overflowY: "auto",
              padding: "6px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "4px",
            }}
          >
            {filteredSymbols.map((sym) => {
              const isSelected = activeSymbol?.char === sym.char;
              return (
                <button
                  key={`${sym.category}-${sym.char}-${sym.codePoint}`}
                  type="button"
                  onClick={() => setActiveSymbol(sym)}
                  onDoubleClick={() => handleInsert(sym)}
                  title={`${sym.name} (${sym.codePoint})`}
                  style={{
                    height: "40px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px",
                    fontFamily: "Segoe UI Symbol, Calibri, sans-serif",
                    background: isSelected ? "#dbeafe" : "#ffffff",
                    border: isSelected ? "1.5px solid #2563eb" : "1px solid #cbd5e1",
                    borderRadius: "4px",
                    cursor: "pointer",
                    color: isSelected ? "#1d4ed8" : "#1e293b",
                    transition: "all 0.1s ease",
                  }}
                >
                  {sym.char}
                </button>
              );
            })}
            {filteredSymbols.length === 0 && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  textAlign: "center",
                  padding: "24px 0",
                  color: "#64748b",
                  fontSize: "12px",
                }}
              >
                Không tìm thấy ký hiệu phù hợp.
              </div>
            )}
          </div>

          {/* Selected Symbol Preview Card */}
          {activeSymbol && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                marginTop: "12px",
                padding: "8px 12px",
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: "4px",
              }}
            >
              <div
                style={{
                  fontSize: "30px",
                  fontWeight: 600,
                  width: "48px",
                  height: "48px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "4px",
                  color: "#1e293b",
                }}
              >
                {activeSymbol.char}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>
                  {activeSymbol.name}
                </div>
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px", fontFamily: "monospace" }}>
                  Mã Unicode: {activeSymbol.codePoint}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="custom-margins-actions">
          <button
            type="button"
            className="confirm-btn confirm-btn-cancel"
            onClick={onClose}
          >
            Đóng
          </button>
          <button
            type="button"
            className="confirm-btn confirm-btn-save"
            onClick={() => handleInsert()}
          >
            <Check size={16} />
            <span>Chèn ký hiệu</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default SymbolDialog;
