import React, { useState } from "react";
import {
  Compass,
  X,
  Search,
  ChevronRight,
  ChevronDown,
  Layers,
  FileQuestion,
} from "lucide-react";
import { useDocumentOutline } from "../hooks/useDocumentOutline.ts";
import { useReferencesStore } from "../../stores/referencesStore.ts";
import type { HeadingItem } from "../services/headingService.ts";

/**
 * DocumentOutlineSidebar - Thanh bên sơ đồ đề mục tài liệu (Phase 6.2 Architecture)
 *
 * Hiển thị cấu trúc cây phân cấp Heading 1 / 2 / 3, hỗ trợ lọc tìm kiếm nhanh
 * và điều hướng tức thời tới vị trí con trỏ trong văn bản.
 */
export function DocumentOutlineSidebar() {
  const isReferencesPanelOpen = useReferencesStore((state) => state.isReferencesPanelOpen);
  const activeReferencePanel = useReferencesStore((state) => state.activeReferencePanel);
  const closeReferencePanel = useReferencesStore((state) => state.closeReferencePanel);

  const { headings, headingTree, activeHeadingId, navigateToHeading, isEmpty } =
    useDocumentOutline();

  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});

  // Nếu panel không mở hoặc không phải tab outline thì không render
  if (!isReferencesPanelOpen || activeReferencePanel !== "outline") {
    return null;
  }

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodes((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const filteredHeadings = searchQuery.trim()
    ? headings.filter((h) =>
        h.text.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : null;

  const renderTreeItem = (item: HeadingItem, depth = 0) => {
    const isCollapsed = Boolean(collapsedNodes[item.id]);
    const hasChildren = Boolean(item.children && item.children.length > 0);
    const isActive = activeHeadingId === item.id;

    const indentPadding = 8 + depth * 14;

    return (
      <div key={item.id} className="outline-node-wrapper">
        <div
          className={`outline-item-row ${isActive ? "is-active" : ""} ${
            item.isDeleted ? "is-deleted" : ""
          }`}
          style={{ paddingLeft: `${indentPadding}px` }}
          onClick={() => navigateToHeading(item)}
          onMouseDown={(e) => e.preventDefault()} // Ngăn chặn cướp focus của editor
          role="treeitem"
          aria-selected={isActive}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigateToHeading(item);
            }
          }}
          title={`${item.text} (${item.level === 1 ? "Heading 1" : item.level === 2 ? "Heading 2" : "Heading 3"})`}
        >
          {/* Nút thu gọn / mở rộng */}
          {hasChildren ? (
            <button
              type="button"
              className="outline-toggle-btn"
              onClick={(e) => toggleCollapse(item.id, e)}
              onMouseDown={(e) => e.preventDefault()}
              aria-label={isCollapsed ? "Mở rộng" : "Thu gọn"}
            >
              {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
          ) : (
            <span className="outline-toggle-placeholder" />
          )}

          {/* Badge cấp độ H1/H2/H3 */}
          <span className={`outline-level-badge level-${item.level}`}>
            H{item.level}
          </span>

          {/* Tên tiêu đề */}
          <span className="outline-item-text">{item.text}</span>

          {/* Tag Section nếu có */}
          {item.sectionIndex && item.sectionIndex > 1 && (
            <span className="outline-section-tag" title={`Section ${item.sectionIndex}`}>
              S{item.sectionIndex}
            </span>
          )}
        </div>

        {/* Render đệ quy các con */}
        {hasChildren && !isCollapsed && (
          <div className="outline-node-children">
            {item.children!.map((child) => renderTreeItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className="document-outline-sidebar"
      role="complementary"
      aria-label="Sơ đồ đề mục tài liệu"
    >
      {/* 1. Header */}
      <div className="outline-sidebar-header">
        <div className="outline-header-title">
          <Compass size={17} className="outline-header-icon" />
          <h3>Sơ đồ đề mục</h3>
          <span className="outline-badge" title="Tổng số đề mục">
            {headings.length}
          </span>
        </div>

        <button
          type="button"
          className="outline-close-btn"
          title="Đóng sơ đồ đề mục"
          onClick={closeReferencePanel}
          onMouseDown={(e) => e.preventDefault()}
          aria-label="Đóng bảng sơ đồ"
        >
          <X size={15} />
        </button>
      </div>

      {/* 2. Ô tìm kiếm lọc đề mục */}
      {!isEmpty && (
        <div className="outline-search-box">
          <Search size={14} className="outline-search-icon" />
          <input
            type="text"
            className="outline-search-input"
            placeholder="Lọc tiêu đề..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Lọc tiêu đề trong sơ đồ"
          />
          {searchQuery && (
            <button
              type="button"
              className="outline-search-clear"
              onClick={() => setSearchQuery("")}
              title="Xóa tìm kiếm"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* 3. Danh sách cây phân cấp / Kết quả tìm kiếm */}
      <div className="outline-content-body" role="tree">
        {isEmpty ? (
          <div className="outline-empty-state">
            <Layers size={36} className="outline-empty-icon" />
            <h4>Chưa có đề mục nào</h4>
            <p>
              Tài liệu hiện chưa chứa tiêu đề. Hãy áp dụng kiểu <strong>Heading 1</strong>,{" "}
              <strong>Heading 2</strong> hoặc <strong>Heading 3</strong> từ tab <em>Home</em> để
              tạo sơ đồ phân cấp tài liệu.
            </p>
          </div>
        ) : filteredHeadings ? (
          // Chế độ hiển thị kết quả tìm kiếm phẳng
          filteredHeadings.length === 0 ? (
            <div className="outline-no-results">
              <FileQuestion size={24} className="outline-empty-icon" />
              <p>Không tìm thấy đề mục khớp với "{searchQuery}"</p>
            </div>
          ) : (
            <div className="outline-filtered-list">
              <div className="outline-filtered-count">
                Tìm thấy {filteredHeadings.length} đề mục:
              </div>
              {filteredHeadings.map((item) => (
                <div
                  key={item.id}
                  className={`outline-item-row ${
                    activeHeadingId === item.id ? "is-active" : ""
                  }`}
                  style={{ paddingLeft: "12px" }}
                  onClick={() => navigateToHeading(item)}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <span className={`outline-level-badge level-${item.level}`}>
                    H{item.level}
                  </span>
                  <span className="outline-item-text">{item.text}</span>
                </div>
              ))}
            </div>
          )
        ) : (
          // Chế độ cây phân cấp đầy đủ (Hierarchical Tree)
          <div className="outline-tree-container">
            {headingTree.map((rootItem) => renderTreeItem(rootItem, 0))}
          </div>
        )}
      </div>
    </aside>
  );
}
