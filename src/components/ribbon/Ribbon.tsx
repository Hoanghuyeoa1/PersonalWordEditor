import { useState } from "react";
import { HomeRibbon } from "./HomeRibbon";
import { InsertRibbon } from "./InsertRibbon";
import { LayoutRibbon } from "./LayoutRibbon";
import { ReferencesRibbon } from "./ReferencesRibbon";
import { ReviewRibbon } from "./ReviewRibbon";
import { ViewRibbon } from "./ViewRibbon";
import { FileMenuShell } from "./FileMenuShell";
import { RibbonTabPlaceholder } from "./RibbonTabPlaceholder";
import { useDocumentStore } from "../../stores/documentStore";
import { X } from "lucide-react";

export type RibbonTab = "File" | "Home" | "Insert" | "Layout" | "References" | "Review" | "View";

const TABS: RibbonTab[] = ["File", "Home", "Insert", "Layout", "References", "Review", "View"];

export function Ribbon() {
  const [activeTab, setActiveTab] = useState<RibbonTab>("Home");
  const [showJsonModal, setShowJsonModal] = useState(false);
  const document = useDocumentStore((state) => state.document);

  const handleTabClick = (tab: RibbonTab) => {
    setActiveTab(tab);
  };

  const preventBlur = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <>
      <section className="ribbon-container" aria-label="Ribbon Navigation & Tools">
        {/* Thanh chuyển đổi Tab */}
        <nav className="ribbon-tabs-nav" role="tablist">
          {TABS.map((tab) => {
            const isFile = tab === "File";
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`ribbon-tab-btn ${isFile ? "tab-file" : ""} ${isActive ? "is-active" : ""}`}
                onMouseDown={preventBlur}
                onClick={() => handleTabClick(tab)}
              >
                {tab}
              </button>
            );
          })}
        </nav>

        {/* Thân Ribbon theo Tab đang chọn */}
        <div className="ribbon-panel">
          {activeTab === "Home" && (
            <HomeRibbon onOpenJsonModal={() => setShowJsonModal(true)} />
          )}

          {activeTab === "Insert" && (
            <InsertRibbon />
          )}

          {activeTab === "Layout" && (
            <LayoutRibbon />
          )}

          {activeTab === "References" && (
            <ReferencesRibbon />
          )}

          {activeTab === "Review" && (
            <ReviewRibbon />
          )}

          {activeTab === "View" && (
            <ViewRibbon />
          )}

          {activeTab !== "Home" &&
            activeTab !== "Insert" &&
            activeTab !== "Layout" &&
            activeTab !== "References" &&
            activeTab !== "Review" &&
            activeTab !== "View" &&
            activeTab !== "File" && (
              <RibbonTabPlaceholder tabName={activeTab} />
            )}
        </div>
      </section>


      {/* Menu File Shell dạng Backstage */}
      {activeTab === "File" && (
        <FileMenuShell onClose={() => setActiveTab("Home")} />
      )}

      {/* Modal xem AST JSON của tài liệu */}
      {showJsonModal && (
        <div className="json-modal-backdrop" onClick={() => setShowJsonModal(false)}>
          <div
            className="json-modal-content"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="ProseMirror / Tiptap Document Model JSON"
          >
            <div className="json-modal-header">
              <div>
                <h3>ProseMirror Document Model (JSON Source)</h3>
                <p className="json-modal-subtitle">
                  ID: {document.metadata.id} · Version: {document.metadata.version} · Updated:{" "}
                  {new Date(document.metadata.updatedAt).toLocaleTimeString()}
                </p>
              </div>
              <button
                type="button"
                className="json-modal-close"
                onClick={() => setShowJsonModal(false)}
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>
            <pre className="json-modal-body">
              {JSON.stringify(document, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}

export default Ribbon;
