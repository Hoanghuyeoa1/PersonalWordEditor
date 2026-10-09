import { useState, useEffect, useMemo, type FormEvent } from "react";
import {
  X,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlertCircle,
  Check,
} from "lucide-react";
import type { Editor } from "@tiptap/core";
import type {
  DocumentStyleType,
  ParagraphStyleProperties,
  CharacterStyleProperties,
} from "../../styles/types/styleTypes.ts";
import {
  STYLE_NORMAL_ID,
  isBuiltInStyleId,
} from "../../styles/services/builtInStyles.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import {
  createStyle,
  updateStyle,
} from "../../styles/services/styleManagementService.ts";
import { resolveStyle } from "../../styles/services/styleResolver.ts";
import {
  SUPPORTED_FONT_FAMILIES,
  FONT_SIZE_PRESETS,
  LINE_SPACING_PRESETS,
} from "../../editor/editorCommands.ts";

export interface StyleEditorDialogProps {
  isOpen: boolean;
  mode: "create" | "modify";
  styleId?: string;
  onClose: () => void;
  editor: Editor | null;
}

export function StyleEditorDialog({
  isOpen,
  mode,
  styleId,
  onClose,
  editor,
}: StyleEditorDialogProps) {
  const definitions = useDocumentStore(
    (state) => state.document.styles?.definitions ?? []
  );

  const existingStyle = useMemo(() => {
    if (mode === "modify" && styleId) {
      return definitions.find((s) => s.id === styleId) ?? null;
    }
    return null;
  }, [mode, styleId, definitions]);

  // Draft form states
  const [name, setName] = useState("");
  const [type, setType] = useState<DocumentStyleType>("paragraph");
  const [basedOn, setBasedOn] = useState<string | null>(STYLE_NORMAL_ID);
  const [nextStyleId, setNextStyleId] = useState<string | null>(STYLE_NORMAL_ID);

  // Character properties draft
  const [fontFamily, setFontFamily] = useState("Calibri");
  const [fontSize, setFontSize] = useState<number>(11);
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [strike, setStrike] = useState(false);
  const [color, setColor] = useState("#0f172a");
  const [highlight, setHighlight] = useState("");

  // Paragraph properties draft
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right" | "justify">("left");
  const [lineSpacing, setLineSpacing] = useState("1.15");
  const [spacingBefore, setSpacingBefore] = useState<number>(0);
  const [spacingAfter, setSpacingAfter] = useState<number>(8);
  const [leftIndent, setLeftIndent] = useState<number>(0);
  const [rightIndent, setRightIndent] = useState<number>(0);
  const [firstLineIndent, setFirstLineIndent] = useState<number>(0);
  const [hangingIndent, setHangingIndent] = useState<number>(0);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset / Khởi tạo draft khi mở modal
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);

    if (mode === "modify" && existingStyle) {
      setName(existingStyle.name);
      setType(existingStyle.type);
      setBasedOn(existingStyle.basedOn ?? null);
      setNextStyleId(existingStyle.nextStyleId ?? null);

      const c = existingStyle.character ?? {};
      setFontFamily(c.fontFamily ?? "Calibri");
      setFontSize(typeof c.fontSize === "number" ? c.fontSize : 11);
      setBold(c.bold ?? false);
      setItalic(c.italic ?? false);
      setUnderline(c.underline ?? false);
      setStrike(c.strike ?? false);
      setColor(c.color ?? "#0f172a");
      setHighlight(c.highlight ?? "");

      const p = existingStyle.paragraph ?? {};
      setTextAlign(p.textAlign ?? "left");
      setLineSpacing(String(p.lineSpacing ?? "1.15"));
      setSpacingBefore(p.spacingBefore ?? 0);
      setSpacingAfter(p.spacingAfter ?? 8);
      setLeftIndent(p.leftIndent ?? 0);
      setRightIndent(p.rightIndent ?? 0);
      setFirstLineIndent(p.firstLineIndent ?? 0);
      setHangingIndent(p.hangingIndent ?? 0);
    } else {
      setName("");
      setType("paragraph");
      setBasedOn(STYLE_NORMAL_ID);
      setNextStyleId(STYLE_NORMAL_ID);
      setFontFamily("Calibri");
      setFontSize(11);
      setBold(false);
      setItalic(false);
      setUnderline(false);
      setStrike(false);
      setColor("#0f172a");
      setHighlight("");
      setTextAlign("left");
      setLineSpacing("1.15");
      setSpacingBefore(0);
      setSpacingAfter(8);
      setLeftIndent(0);
      setRightIndent(0);
      setFirstLineIndent(0);
      setHangingIndent(0);
    }
  }, [isOpen, mode, existingStyle]);

  // Đóng modal khi nhấn Escape
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

  // Live preview: Giải quyết kế thừa thật (Inheritance) mà KHÔNG mutate document
  const previewResolved = useMemo(() => {
    // 1. Resolve parent nếu có basedOn
    let baseChar: CharacterStyleProperties = {
      fontFamily: "Calibri",
      fontSize: 11,
      color: "#0f172a",
      bold: false,
      italic: false,
      underline: false,
      strike: false,
    };
    let basePara: ParagraphStyleProperties = {
      textAlign: "left",
      lineSpacing: "1.15",
      spacingBefore: 0,
      spacingAfter: 8,
      leftIndent: 0,
      rightIndent: 0,
      firstLineIndent: 0,
      hangingIndent: 0,
    };

    if (basedOn && basedOn !== styleId) {
      try {
        const resolvedBase = resolveStyle(basedOn, definitions);
        if (resolvedBase.character) baseChar = { ...baseChar, ...resolvedBase.character };
        if (resolvedBase.paragraph) basePara = { ...basePara, ...resolvedBase.paragraph };
      } catch {
        // Safe fallback
      }
    }

    // 2. Phủ draft values lên
    const finalChar = {
      ...baseChar,
      fontFamily,
      fontSize,
      bold,
      italic,
      underline,
      strike,
      color,
      highlight: highlight || undefined,
    };

    const finalPara =
      type === "paragraph"
        ? {
            ...basePara,
            textAlign,
            lineSpacing,
            spacingBefore,
            spacingAfter,
            leftIndent,
            rightIndent,
            firstLineIndent,
            hangingIndent,
          }
        : undefined;

    return { char: finalChar, para: finalPara };
  }, [
    basedOn,
    styleId,
    definitions,
    fontFamily,
    fontSize,
    bold,
    italic,
    underline,
    strike,
    color,
    highlight,
    type,
    textAlign,
    lineSpacing,
    spacingBefore,
    spacingAfter,
    leftIndent,
    rightIndent,
    firstLineIndent,
    hangingIndent,
  ]);

  if (!isOpen) return null;

  const handleSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    const charProps: CharacterStyleProperties = {
      fontFamily,
      fontSize,
      bold,
      italic,
      underline,
      strike,
      color,
      highlight: highlight || undefined,
    };

    const paraProps: ParagraphStyleProperties | undefined =
      type === "paragraph"
        ? {
            textAlign,
            lineSpacing,
            spacingBefore: Number(spacingBefore) || 0,
            spacingAfter: Number(spacingAfter) || 0,
            leftIndent: Number(leftIndent) || 0,
            rightIndent: Number(rightIndent) || 0,
            firstLineIndent: Number(firstLineIndent) || 0,
            hangingIndent: Number(hangingIndent) || 0,
          }
        : undefined;

    if (mode === "create") {
      const res = createStyle(
        {
          name,
          type,
          basedOn: basedOn || null,
          nextStyleId: type === "paragraph" ? nextStyleId : null,
          paragraph: paraProps,
          character: charProps,
        },
        editor
      );
      if (!res.success) {
        setErrorMessage(res.error || "Không thể tạo Style.");
        return;
      }
    } else if (mode === "modify" && styleId) {
      const res = updateStyle(
        styleId,
        {
          name,
          basedOn: basedOn || null,
          nextStyleId: type === "paragraph" ? nextStyleId : null,
          paragraph: paraProps,
          character: charProps,
        },
        editor
      );
      if (!res.success) {
        setErrorMessage(res.error || "Không thể cập nhật Style.");
        return;
      }
    }

    onClose();
  };

  const isBuiltIn = existingStyle ? isBuiltInStyleId(existingStyle.id) : false;

  // Lọc danh sách styles cùng loại cho dropdown Based On
  const compatibleParents = definitions.filter(
    (s) => s.type === type && s.id !== styleId
  );

  return (
    <div
      className="custom-margins-backdrop"
      style={{ zIndex: 1200 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="custom-margins-dialog"
        style={{ maxWidth: "620px", width: "95%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="style-editor-title"
      >
        <div className="custom-margins-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Palette size={18} className="text-blue-600" />
            <h3 id="style-editor-title" style={{ fontSize: "15px", fontWeight: 600 }}>
              {mode === "create" ? "Tạo Style Mới (Create Style)" : `Chỉnh sửa Style: ${existingStyle?.name || ""}`}
            </h3>
          </div>
          <button
            type="button"
            className="custom-margins-close"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div
            className="custom-margins-body"
            style={{ overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}
          >
            {/* Banner Lỗi Validation */}
            {errorMessage && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 12px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "6px",
                  color: "#b91c1c",
                  fontSize: "12px",
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* General Settings */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="custom-margins-field">
                <label htmlFor="style-name">Tên Style:</label>
                <input
                  id="style-name"
                  type="text"
                  value={name}
                  disabled={isBuiltIn}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nhập tên Style..."
                  style={{ width: "100%", padding: "6px 8px", fontSize: "13px" }}
                />
              </div>

              <div className="custom-margins-field">
                <label htmlFor="style-type">Loại Style (Type):</label>
                <select
                  id="style-type"
                  value={type}
                  disabled={mode === "modify"}
                  onChange={(e) => {
                    const nextType = e.target.value as DocumentStyleType;
                    setType(nextType);
                    setBasedOn(nextType === "paragraph" ? STYLE_NORMAL_ID : null);
                  }}
                  style={{ width: "100%", padding: "6px 8px", fontSize: "13px" }}
                >
                  <option value="paragraph">Paragraph (Khối đoạn văn)</option>
                  <option value="character">Character (Ký tự / Run)</option>
                </select>
              </div>

              <div className="custom-margins-field">
                <label htmlFor="style-based-on">Kế thừa từ (Based On):</label>
                <select
                  id="style-based-on"
                  value={basedOn ?? ""}
                  disabled={existingStyle?.id === STYLE_NORMAL_ID}
                  onChange={(e) => setBasedOn(e.target.value || null)}
                  style={{ width: "100%", padding: "6px 8px", fontSize: "13px" }}
                >
                  <option value="">(Không kế thừa / Root)</option>
                  {compatibleParents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.isBuiltIn ? "(Built-in)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {type === "paragraph" && (
                <div className="custom-margins-field">
                  <label htmlFor="style-next-style">Style cho đoạn tiếp theo:</label>
                  <select
                    id="style-next-style"
                    value={nextStyleId ?? ""}
                    onChange={(e) => setNextStyleId(e.target.value || null)}
                    style={{ width: "100%", padding: "6px 8px", fontSize: "13px" }}
                  >
                    {definitions
                      .filter((s) => s.type === "paragraph")
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            {/* Character Formatting Section */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                padding: "12px",
                background: "#f8fafc",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "8px" }}>
                Định dạng ký tự (Character Formatting)
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  style={{ padding: "4px 8px", fontSize: "12px", borderRadius: "4px" }}
                >
                  {SUPPORTED_FONT_FAMILIES.map((f) => (
                    <option key={f.label} value={f.label}>
                      {f.label}
                    </option>
                  ))}
                </select>

                <select
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  style={{ padding: "4px 8px", fontSize: "12px", borderRadius: "4px" }}
                >
                  {FONT_SIZE_PRESETS.map((sz) => (
                    <option key={sz} value={sz}>
                      {sz} pt
                    </option>
                  ))}
                </select>

                <div style={{ display: "flex", gap: "2px", border: "1px solid #cbd5e1", borderRadius: "4px", background: "#fff" }}>
                  <button
                    type="button"
                    onClick={() => setBold(!bold)}
                    style={{
                      padding: "4px 8px",
                      background: bold ? "#dbeafe" : "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                    title="In đậm (Bold)"
                  >
                    <Bold size={14} color={bold ? "#1d4ed8" : "#334155"} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setItalic(!italic)}
                    style={{
                      padding: "4px 8px",
                      background: italic ? "#dbeafe" : "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                    title="In nghiêng (Italic)"
                  >
                    <Italic size={14} color={italic ? "#1d4ed8" : "#334155"} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnderline(!underline)}
                    style={{
                      padding: "4px 8px",
                      background: underline ? "#dbeafe" : "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                    title="Gạch chân (Underline)"
                  >
                    <Underline size={14} color={underline ? "#1d4ed8" : "#334155"} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setStrike(!strike)}
                    style={{
                      padding: "4px 8px",
                      background: strike ? "#dbeafe" : "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                    title="Gạch ngang (Strikethrough)"
                  >
                    <Strikethrough size={14} color={strike ? "#1d4ed8" : "#334155"} />
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>Màu chữ:</span>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    style={{ width: "26px", height: "26px", padding: "0", border: "none", cursor: "pointer" }}
                  />
                </div>
              </div>
            </div>

            {/* Paragraph Formatting Section (Chỉ hiển thị nếu là Paragraph Style) */}
            {type === "paragraph" && (
              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  padding: "12px",
                  background: "#f8fafc",
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "8px" }}>
                  Định dạng đoạn văn (Paragraph Formatting)
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
                  {/* Căn lề */}
                  <div style={{ display: "flex", gap: "2px", border: "1px solid #cbd5e1", borderRadius: "4px", background: "#fff" }}>
                    <button
                      type="button"
                      onClick={() => setTextAlign("left")}
                      style={{ padding: "4px 8px", background: textAlign === "left" ? "#dbeafe" : "transparent", border: "none" }}
                    >
                      <AlignLeft size={14} color={textAlign === "left" ? "#1d4ed8" : "#334155"} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTextAlign("center")}
                      style={{ padding: "4px 8px", background: textAlign === "center" ? "#dbeafe" : "transparent", border: "none" }}
                    >
                      <AlignCenter size={14} color={textAlign === "center" ? "#1d4ed8" : "#334155"} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTextAlign("right")}
                      style={{ padding: "4px 8px", background: textAlign === "right" ? "#dbeafe" : "transparent", border: "none" }}
                    >
                      <AlignRight size={14} color={textAlign === "right" ? "#1d4ed8" : "#334155"} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTextAlign("justify")}
                      style={{ padding: "4px 8px", background: textAlign === "justify" ? "#dbeafe" : "transparent", border: "none" }}
                    >
                      <AlignJustify size={14} color={textAlign === "justify" ? "#1d4ed8" : "#334155"} />
                    </button>
                  </div>

                  {/* Giãn dòng */}
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>Giãn dòng:</span>
                    <select
                      value={lineSpacing}
                      onChange={(e) => setLineSpacing(e.target.value)}
                      style={{ padding: "4px 6px", fontSize: "12px", borderRadius: "4px" }}
                    >
                      {LINE_SPACING_PRESETS.map((ls) => (
                        <option key={ls} value={ls}>
                          {ls}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Khoảng cách trước / sau đoạn */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>Trước:</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={spacingBefore}
                      onChange={(e) => setSpacingBefore(Number(e.target.value))}
                      style={{ width: "46px", padding: "2px 4px", fontSize: "12px" }}
                    />
                    <span style={{ fontSize: "11px", color: "#64748b" }}>pt</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>Sau:</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={spacingAfter}
                      onChange={(e) => setSpacingAfter(Number(e.target.value))}
                      style={{ width: "46px", padding: "2px 4px", fontSize: "12px" }}
                    />
                    <span style={{ fontSize: "11px", color: "#64748b" }}>pt</span>
                  </div>
                </div>

                {/* Thụt lề đoạn văn */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", marginTop: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>Lề trái:</span>
                    <input
                      type="number"
                      min="0"
                      max="200"
                      value={leftIndent}
                      onChange={(e) => setLeftIndent(Number(e.target.value))}
                      style={{ width: "46px", padding: "2px 4px", fontSize: "12px" }}
                    />
                    <span style={{ fontSize: "11px", color: "#64748b" }}>pt</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>Dòng đầu:</span>
                    <input
                      type="number"
                      min="0"
                      max="200"
                      value={firstLineIndent}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setFirstLineIndent(val);
                        if (val > 0) setHangingIndent(0);
                      }}
                      style={{ width: "46px", padding: "2px 4px", fontSize: "12px" }}
                    />
                    <span style={{ fontSize: "11px", color: "#64748b" }}>pt</span>
                  </div>
                </div>
              </div>
            )}

            {/* Live Preview Box */}
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", overflow: "hidden" }}>
              <div
                style={{
                  background: "#f1f5f9",
                  padding: "6px 12px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#475569",
                  borderBottom: "1px solid #cbd5e1",
                }}
              >
                Xem trước trực quan (Live Preview)
              </div>
              <div
                style={{
                  padding: "16px",
                  background: "#ffffff",
                  minHeight: "75px",
                }}
              >
                <div
                  style={{
                    fontFamily: previewResolved.char.fontFamily,
                    fontSize: `${previewResolved.char.fontSize}pt`,
                    fontWeight: previewResolved.char.bold ? "bold" : "normal",
                    fontStyle: previewResolved.char.italic ? "italic" : "normal",
                    textDecoration:
                      previewResolved.char.underline && previewResolved.char.strike
                        ? "underline line-through"
                        : previewResolved.char.underline
                        ? "underline"
                        : previewResolved.char.strike
                        ? "line-through"
                        : "none",
                    color: previewResolved.char.color,
                    backgroundColor: previewResolved.char.highlight || "transparent",
                    textAlign: previewResolved.para?.textAlign || "left",
                    lineHeight: previewResolved.para?.lineSpacing || "1.15",
                    marginTop: `${previewResolved.para?.spacingBefore || 0}pt`,
                    marginBottom: `${previewResolved.para?.spacingAfter || 0}pt`,
                    marginLeft: `${previewResolved.para?.leftIndent || 0}pt`,
                    textIndent: `${previewResolved.para?.firstLineIndent || 0}pt`,
                  }}
                >
                  The quick brown fox jumps over the lazy dog. Văn bản mẫu hiển thị định dạng thực tế của Style được cấu hình.
                </div>
              </div>
            </div>
          </div>

          <div
            className="custom-margins-actions"
            style={{ padding: "12px 16px", borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}
          >
            <button
              type="button"
              className="confirm-btn confirm-btn-cancel"
              onClick={onClose}
            >
              Hủy bỏ (Cancel)
            </button>
            <button
              type="submit"
              className="confirm-btn confirm-btn-primary"
            >
              <Check size={14} />
              <span>{mode === "create" ? "Tạo Style" : "Lưu thay đổi"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
