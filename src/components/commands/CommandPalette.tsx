import { useEffect, useRef, useMemo } from "react";
import { Search, CornerDownLeft, Sparkles } from "lucide-react";
import { useCommandPaletteStore } from "../../stores/commandPaletteStore.ts";
import { useEditorStore } from "../../stores/editorStore.ts";
import { commandRegistry } from "../../commands/commandRegistry.ts";
import { executeCommandWithSelection } from "../../commands/commandExecution.ts";
import { CommandIcon } from "./CommandIcons.tsx";

export function CommandPalette() {
  const {
    isOpen,
    query,
    selectedIndex,
    savedSelection,
    closePalette,
    setQuery,
    selectNext,
    selectPrev,
    setSelectedIndex,
  } = useCommandPaletteStore();

  const editor = useEditorStore((state) => state.editor);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Danh sách kết quả tìm kiếm được memoized
  const results = useMemo(() => {
    return commandRegistry.search(query, { paletteOnly: true });
  }, [query]);

  // Autofocus ô tìm kiếm khi mở
  useEffect(() => {
    if (isOpen) {
      // Dùng requestAnimationFrame để đảm bảo modal đã gắn vào DOM
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isOpen]);

  // Tự động cuộn mục đang chọn vào tầm nhìn (Scroll into view)
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(
      `[data-index="${selectedIndex}"]`
    );
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, isOpen]);

  // Lắng nghe phím tắt bàn phím toàn cục khi palette mở
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePalette();
        if (editor) {
          editor.commands.focus();
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectNext(results.length);
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        selectPrev(results.length);
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const target = results[selectedIndex];
        if (target) {
          const ctx = { editor };
          const canRun = !target.canExecute || target.canExecute(ctx);
          if (canRun) {
            closePalette();
            executeCommandWithSelection(target.id, {
              editor,
              savedSelection,
            });
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, results, selectedIndex, editor, savedSelection, closePalette, selectNext, selectPrev]);

  if (!isOpen) return null;

  const handleItemClick = (cmdId: string, canRun: boolean) => {
    if (!canRun) return;
    closePalette();
    executeCommandWithSelection(cmdId, {
      editor,
      savedSelection,
    });
  };

  const getCategoryLabel = (cat: string): string => {
    switch (cat) {
      case "format":
        return "Định dạng";
      case "insert":
        return "Chèn đối tượng";
      case "references":
        return "Tham chiếu & Mục lục";
      case "review":
        return "Soát lỗi & Theo dõi";
      case "view":
        return "Chế độ xem";
      case "file":
        return "Tệp tin";
      default:
        return cat;
    }
  };

  return (
    <div
      className="command-palette-backdrop"
      onClick={closePalette}
      role="presentation"
    >
      <div
        className="command-palette-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
      >
        {/* Thanh tìm kiếm */}
        <div className="command-palette-search-box">
          <Search size={18} className="command-palette-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Gõ lệnh hoặc tìm kiếm... (ví dụ: in đậm, tiêu đề, bảng, mục lục)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="command-palette-list"
            aria-activedescendant={
              results[selectedIndex] ? `cmd-item-${results[selectedIndex].id}` : undefined
            }
          />
          <div className="command-palette-hint-chip">
            <kbd>ESC</kbd> đóng
          </div>
        </div>

        {/* Danh sách kết quả */}
        <div className="command-palette-results-wrapper">
          {results.length === 0 ? (
            <div className="command-palette-empty">
              <Sparkles size={28} className="command-palette-empty-icon" />
              <div className="command-palette-empty-title">Không tìm thấy lệnh phù hợp</div>
              <div className="command-palette-empty-desc">
                Thử tìm với từ khóa khác như "tiêu đề", "bảng", "định dạng" hoặc "in đậm".
              </div>
            </div>
          ) : (
            <ul
              ref={listRef}
              id="command-palette-list"
              className="command-palette-list"
              role="listbox"
            >
              {results.map((cmd, idx) => {
                const isSelected = idx === selectedIndex;
                const canRun = !cmd.canExecute || cmd.canExecute({ editor });

                return (
                  <li
                    key={cmd.id}
                    id={`cmd-item-${cmd.id}`}
                    data-index={idx}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={!canRun}
                    className={`command-palette-item ${isSelected ? "selected" : ""} ${
                      !canRun ? "disabled" : ""
                    }`}
                    onClick={() => handleItemClick(cmd.id, canRun)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="command-palette-item-icon">
                      <CommandIcon name={cmd.icon} size={16} />
                    </div>

                    <div className="command-palette-item-content">
                      <div className="command-palette-item-top">
                        <span className="command-palette-item-label">{cmd.label}</span>
                        {cmd.labelEn && (
                          <span className="command-palette-item-label-en">
                            ({cmd.labelEn})
                          </span>
                        )}
                        <span className="command-palette-item-category">
                          {getCategoryLabel(cmd.category)}
                        </span>
                      </div>
                      {cmd.description && (
                        <div className="command-palette-item-desc">{cmd.description}</div>
                      )}
                    </div>

                    {cmd.shortcut && (
                      <div className="command-palette-item-shortcut">
                        <kbd>{cmd.shortcut}</kbd>
                      </div>
                    )}

                    {isSelected && canRun && (
                      <div className="command-palette-item-enter-hint" title="Nhấn Enter để chạy">
                        <CornerDownLeft size={13} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer ghi chú */}
        <div className="command-palette-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> để di chuyển
          </span>
          <span>
            <kbd>↵</kbd> để thực thi
          </span>
          <span>
            <kbd>Esc</kbd> để thoát
          </span>
        </div>
      </div>
    </div>
  );
}
