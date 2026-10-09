import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  createDefaultStyleDefinitions,
} from "./services/builtInStyles.ts";
import {
  resolveStyle,
  resolveAllStyles,
  getStyleById,
  getStyleChildren,
  collectDescendants,
  canSetBasedOn,
  detectInheritanceCycle,
  SYSTEM_DEFAULT_PARAGRAPH_PROPERTIES,
  SYSTEM_DEFAULT_CHARACTER_PROPERTIES,
} from "./services/styleResolver.ts";
import { StyleResolutionEngine } from "./services/styleResolutionEngine.ts";
import type { DocumentStyle } from "./types/styleTypes.ts";

test("Style Resolution - 1. Resolve Normal Built-in Style", () => {
  const defs = createDefaultStyleDefinitions();
  const resolved = resolveStyle(STYLE_NORMAL_ID, defs);

  assert.equal(resolved.id, STYLE_NORMAL_ID);
  assert.equal(resolved.name, "Normal");
  assert.equal(resolved.type, "paragraph");
  assert.equal(resolved.basedOn, null);
  assert.equal(resolved.isBuiltIn, true);
  assert.deepEqual(resolved.inheritanceChain, [STYLE_NORMAL_ID]);

  // Paragraph properties
  assert.ok(resolved.paragraph);
  assert.equal(resolved.paragraph.textAlign, "left");
  assert.equal(resolved.paragraph.lineSpacing, "1.15");
  assert.equal(resolved.paragraph.spacingBefore, 0);
  assert.equal(resolved.paragraph.spacingAfter, 8);
  assert.equal(resolved.paragraph.leftIndent, 0);
  assert.equal(resolved.paragraph.rightIndent, 0);
  assert.equal(resolved.paragraph.keepWithNext, false);

  // Character properties
  assert.equal(resolved.character.fontFamily, "Calibri");
  assert.equal(resolved.character.fontSize, 11);
  assert.equal(resolved.character.bold, false);
  assert.equal(resolved.character.italic, false);
  assert.equal(resolved.character.color, "#0f172a");
});

test("Style Resolution - 2. One-level inheritance", () => {
  const defs = createDefaultStyleDefinitions();
  const bodyStyle: DocumentStyle = {
    id: "style_body",
    name: "Body Text",
    type: "paragraph",
    basedOn: STYLE_NORMAL_ID,
    isBuiltIn: false,
    paragraph: {
      lineSpacing: "1.5",
      spacingAfter: 10,
    },
  };
  defs.push(bodyStyle);

  const resolved = resolveStyle("style_body", defs);

  assert.equal(resolved.id, "style_body");
  assert.deepEqual(resolved.inheritanceChain, [STYLE_NORMAL_ID, "style_body"]);

  // Inherited from Normal
  assert.equal(resolved.paragraph?.textAlign, "left");
  assert.equal(resolved.paragraph?.spacingBefore, 0);
  assert.equal(resolved.character.fontFamily, "Calibri");
  assert.equal(resolved.character.fontSize, 11);
  assert.equal(resolved.character.color, "#0f172a");

  // Overridden by Body Text
  assert.equal(resolved.paragraph?.lineSpacing, "1.5");
  assert.equal(resolved.paragraph?.spacingAfter, 10);
});

test("Style Resolution - 3. Multi-level inheritance", () => {
  const defs = createDefaultStyleDefinitions();

  const level1: DocumentStyle = {
    id: "style_body",
    name: "Body Text",
    type: "paragraph",
    basedOn: STYLE_NORMAL_ID,
    isBuiltIn: false,
    paragraph: { lineSpacing: "1.5" },
  };

  const level2: DocumentStyle = {
    id: "style_academic",
    name: "Academic Body",
    type: "paragraph",
    basedOn: "style_body",
    isBuiltIn: false,
    paragraph: { textAlign: "justify", leftIndent: 1 },
    character: { fontFamily: "Times New Roman" },
  };

  const level3: DocumentStyle = {
    id: "style_thesis",
    name: "Thesis Body",
    type: "paragraph",
    basedOn: "style_academic",
    isBuiltIn: false,
    paragraph: { spacingBefore: 12, spacingAfter: 12 },
    character: { fontSize: 13 },
  };

  defs.push(level1, level2, level3);

  const resolved = resolveStyle("style_thesis", defs);

  assert.equal(resolved.id, "style_thesis");
  assert.deepEqual(resolved.inheritanceChain, [
    STYLE_NORMAL_ID,
    "style_body",
    "style_academic",
    "style_thesis",
  ]);

  // Inherited from Normal (root)
  assert.equal(resolved.character.color, "#0f172a");
  assert.equal(resolved.character.bold, false);

  // Inherited from Body Text (level 1)
  assert.equal(resolved.paragraph?.lineSpacing, "1.5");

  // Inherited from Academic Body (level 2)
  assert.equal(resolved.paragraph?.textAlign, "justify");
  assert.equal(resolved.paragraph?.leftIndent, 1);
  assert.equal(resolved.character.fontFamily, "Times New Roman");

  // Overridden in Thesis Body (level 3)
  assert.equal(resolved.paragraph?.spacingBefore, 12);
  assert.equal(resolved.paragraph?.spacingAfter, 12);
  assert.equal(resolved.character.fontSize, 13);
});

test("Style Resolution - 4. Child override non-defined properties preserved", () => {
  const defs = createDefaultStyleDefinitions();
  const child: DocumentStyle = {
    id: "style_alert",
    name: "Alert Box",
    type: "paragraph",
    basedOn: STYLE_NORMAL_ID,
    isBuiltIn: false,
    character: {
      bold: true,
      color: "#dc2626", // Red override
    },
  };
  defs.push(child);

  const resolved = resolveStyle("style_alert", defs);

  // Overrides applied
  assert.equal(resolved.character.bold, true);
  assert.equal(resolved.character.color, "#dc2626");

  // Parent properties preserved
  assert.equal(resolved.character.fontFamily, "Calibri");
  assert.equal(resolved.character.fontSize, 11);
  assert.equal(resolved.character.italic, false);
  assert.equal(resolved.paragraph?.lineSpacing, "1.15");
  assert.equal(resolved.paragraph?.textAlign, "left");
});

test("Style Resolution - 5. Source immutability", () => {
  const defs = createDefaultStyleDefinitions();
  const child: DocumentStyle = {
    id: "style_custom",
    name: "Custom",
    type: "paragraph",
    basedOn: STYLE_NORMAL_ID,
    isBuiltIn: false,
    paragraph: { lineSpacing: "2.0" },
    character: { fontSize: 18 },
  };
  defs.push(child);

  // Snapshot JSON before resolution
  const beforeSnapshot = JSON.stringify(defs);

  // Freeze objects to enforce immutability strictly at runtime
  for (const s of defs) {
    Object.freeze(s);
    if (s.paragraph) Object.freeze(s.paragraph);
    if (s.character) Object.freeze(s.character);
  }

  // Execute resolutions
  const resolved = resolveStyle("style_custom", defs);
  const allResolved = resolveAllStyles(defs);

  assert.equal(resolved.paragraph?.lineSpacing, "2.0");
  assert.equal(allResolved.size, defs.length);

  // Snapshot JSON after resolution must be strictly unchanged
  const afterSnapshot = JSON.stringify(defs);
  assert.equal(beforeSnapshot, afterSnapshot, "Source definitions must not be mutated");
});

test("Style Resolution - 6. Missing / Broken parent handling", () => {
  const defs = createDefaultStyleDefinitions();
  const orphanChild: DocumentStyle = {
    id: "style_orphan",
    name: "Orphan Style",
    type: "paragraph",
    basedOn: "style_nonexistent_parent",
    isBuiltIn: false,
    paragraph: {
      textAlign: "right",
      spacingBefore: 15,
    },
    character: {
      fontFamily: "Arial",
      fontSize: 14,
    },
  };
  defs.push(orphanChild);

  // Must not throw, fail-safe resolution
  const resolved = resolveStyle("style_orphan", defs);

  assert.equal(resolved.id, "style_orphan");
  assert.equal(resolved.hasBrokenParent, true);
  assert.equal(resolved.missingParentId, "style_nonexistent_parent");

  // Child's defined properties are preserved
  assert.equal(resolved.paragraph?.textAlign, "right");
  assert.equal(resolved.paragraph?.spacingBefore, 15);
  assert.equal(resolved.character.fontFamily, "Arial");
  assert.equal(resolved.character.fontSize, 14);

  // Baseline properties are safely filled from defaults
  assert.equal(resolved.paragraph?.lineSpacing, SYSTEM_DEFAULT_PARAGRAPH_PROPERTIES.lineSpacing);
  assert.equal(resolved.character.color, SYSTEM_DEFAULT_CHARACTER_PROPERTIES.color);
});

test("Style Resolution - 7. Self-reference cycle protection (A → A)", () => {
  const defs = createDefaultStyleDefinitions();
  const selfStyle: DocumentStyle = {
    id: "style_self",
    name: "Self Looping Style",
    type: "paragraph",
    basedOn: "style_self", // A -> A
    isBuiltIn: false,
    paragraph: { textAlign: "center" },
  };
  defs.push(selfStyle);

  // canSetBasedOn must deny this
  assert.equal(canSetBasedOn("style_self", "style_self", defs), false);

  // detectInheritanceCycle must report cycle
  const cycleInfo = detectInheritanceCycle("style_self", defs);
  assert.equal(cycleInfo.hasCycle, true);

  // Must not crash or stack overflow
  const resolved = resolveStyle("style_self", defs);
  assert.equal(resolved.id, "style_self");
  assert.equal(resolved.hasCycle, true);
  assert.deepEqual(resolved.cyclePath, ["style_self", "style_self"]);
  assert.equal(resolved.paragraph?.textAlign, "center");
  assert.equal(resolved.paragraph?.lineSpacing, SYSTEM_DEFAULT_PARAGRAPH_PROPERTIES.lineSpacing);
});

test("Style Resolution - 8. Indirect cycle protection (A → B → C → A)", () => {
  const defs = createDefaultStyleDefinitions();

  const styleA: DocumentStyle = {
    id: "style_a",
    name: "Style A",
    type: "paragraph",
    basedOn: "style_b",
    isBuiltIn: false,
    paragraph: { textAlign: "center" },
  };
  const styleB: DocumentStyle = {
    id: "style_b",
    name: "Style B",
    type: "paragraph",
    basedOn: "style_c",
    isBuiltIn: false,
    paragraph: { lineSpacing: "2.0" },
  };
  const styleC: DocumentStyle = {
    id: "style_c",
    name: "Style C",
    type: "paragraph",
    basedOn: "style_a", // Closes cycle
    isBuiltIn: false,
    character: { bold: true },
  };

  defs.push(styleA, styleB, styleC);

  // canSetBasedOn must prevent closing cycle
  assert.equal(canSetBasedOn("style_c", "style_a", defs), false);

  // Cycle detection
  const cycleA = detectInheritanceCycle("style_a", defs);
  assert.equal(cycleA.hasCycle, true);
  assert.ok(cycleA.cyclePath?.includes("style_a"));

  // Resolver must not crash and terminate safely
  const resolvedA = resolveStyle("style_a", defs);
  assert.equal(resolvedA.hasCycle, true);
  assert.equal(resolvedA.paragraph?.textAlign, "center");

  const resolvedB = resolveStyle("style_b", defs);
  assert.equal(resolvedB.hasCycle, true);
  assert.equal(resolvedB.paragraph?.lineSpacing, "2.0");
});

test("Style Resolution - 9. Deep inheritance (10 levels)", () => {
  const defs = createDefaultStyleDefinitions();
  const depth = 10;
  let prevId = STYLE_NORMAL_ID;

  for (let i = 1; i <= depth; i++) {
    const id = `style_depth_${i}`;
    const style: DocumentStyle = {
      id,
      name: `Depth ${i}`,
      type: "paragraph",
      basedOn: prevId,
      isBuiltIn: false,
      paragraph: {
        spacingBefore: i * 2,
      },
      character: {
        fontSize: 10 + i,
      },
    };
    defs.push(style);
    prevId = id;
  }

  const resolved = resolveStyle(`style_depth_${depth}`, defs);

  // Chain length: Normal + 10 levels = 11 styles
  assert.equal(resolved.inheritanceChain.length, 11);
  assert.equal(resolved.inheritanceChain[0], STYLE_NORMAL_ID);
  assert.equal(resolved.inheritanceChain[10], `style_depth_${depth}`);

  // Inherited from depth 10
  assert.equal(resolved.paragraph?.spacingBefore, depth * 2);
  assert.equal(resolved.character.fontSize, 10 + depth);

  // Root Normal properties preserved
  assert.equal(resolved.paragraph?.textAlign, "left");
  assert.equal(resolved.character.color, "#0f172a");
});

test("Style Resolution - 10. Deterministic result regardless of array order", () => {
  const defs1 = createDefaultStyleDefinitions();
  const s1: DocumentStyle = {
    id: "style_s1",
    name: "S1",
    type: "paragraph",
    basedOn: STYLE_NORMAL_ID,
    isBuiltIn: false,
    paragraph: { lineSpacing: "1.5" },
  };
  const s2: DocumentStyle = {
    id: "style_s2",
    name: "S2",
    type: "paragraph",
    basedOn: "style_s1",
    isBuiltIn: false,
    character: { fontSize: 15 },
  };
  defs1.push(s1, s2);

  // Shuffled order in defs2
  const defs2 = [s2, ...createDefaultStyleDefinitions().reverse(), s1];

  const resolvedFromDefs1 = resolveStyle("style_s2", defs1);
  const resolvedFromDefs2 = resolveStyle("style_s2", defs2);

  assert.deepEqual(resolvedFromDefs1, resolvedFromDefs2, "Resolutions must be strictly deterministic");
});

test("Style Resolution - 11. Caching & targeted descendant invalidation", () => {
  const defs = createDefaultStyleDefinitions();
  const parent: DocumentStyle = {
    id: "style_parent",
    name: "Parent",
    type: "paragraph",
    basedOn: STYLE_NORMAL_ID,
    isBuiltIn: false,
    paragraph: { lineSpacing: "1.5" },
  };
  const child1: DocumentStyle = {
    id: "style_child_1",
    name: "Child 1",
    type: "paragraph",
    basedOn: "style_parent",
    isBuiltIn: false,
    character: { fontSize: 14 },
  };
  const grandchild: DocumentStyle = {
    id: "style_grandchild",
    name: "Grandchild",
    type: "paragraph",
    basedOn: "style_child_1",
    isBuiltIn: false,
    character: { bold: true },
  };
  const independent: DocumentStyle = {
    id: "style_independent",
    name: "Independent",
    type: "paragraph",
    basedOn: STYLE_NORMAL_ID,
    isBuiltIn: false,
    character: { italic: true },
  };

  defs.push(parent, child1, grandchild, independent);

  const engine = new StyleResolutionEngine(defs);

  // 1. Initial cache empty
  assert.equal(engine.getCacheSize(), 0);

  // 2. Query styles to populate cache
  engine.getResolvedStyle("style_parent");
  engine.getResolvedStyle("style_child_1");
  engine.getResolvedStyle("style_grandchild");
  engine.getResolvedStyle("style_independent");

  assert.equal(engine.getCacheSize(), 4);
  assert.equal(engine.hasCached("style_parent"), true);
  assert.equal(engine.hasCached("style_child_1"), true);
  assert.equal(engine.hasCached("style_grandchild"), true);
  assert.equal(engine.hasCached("style_independent"), true);

  // 3. Invalidate Child 1 (should invalidate Child 1 and Grandchild, but NOT Parent or Independent)
  const affected = engine.invalidateStyle("style_child_1");
  assert.deepEqual(affected.sort(), ["style_child_1", "style_grandchild"].sort());

  assert.equal(engine.hasCached("style_child_1"), false);
  assert.equal(engine.hasCached("style_grandchild"), false);
  assert.equal(engine.hasCached("style_parent"), true, "Parent cache must remain intact");
  assert.equal(engine.hasCached("style_independent"), true, "Independent cache must remain intact");
  assert.equal(engine.getCacheSize(), 2);

  // 4. Invalidate Parent (should invalidate Parent and any remaining descendants)
  const parentAffected = engine.invalidateStyle("style_parent");
  assert.ok(parentAffected.includes("style_parent"));
  assert.ok(parentAffected.includes("style_child_1"));
  assert.ok(parentAffected.includes("style_grandchild"));

  assert.equal(engine.hasCached("style_parent"), false);
  assert.equal(engine.hasCached("style_independent"), true, "Independent cache still untouched");

  // 5. Querying again recalculates and re-caches
  const reResolved = engine.getResolvedStyle("style_child_1");
  assert.equal(reResolved.character.fontSize, 14);
  assert.equal(engine.hasCached("style_child_1"), true);
});

test("Style Resolution - 12. Helpers: getStyleChildren and collectDescendants", () => {
  const defs = createDefaultStyleDefinitions();
  const root: DocumentStyle = {
    id: "style_root",
    name: "Root",
    type: "paragraph",
    basedOn: null,
    isBuiltIn: false,
  };
  const childA: DocumentStyle = {
    id: "style_child_a",
    name: "Child A",
    type: "paragraph",
    basedOn: "style_root",
    isBuiltIn: false,
  };
  const childB: DocumentStyle = {
    id: "style_child_b",
    name: "Child B",
    type: "paragraph",
    basedOn: "style_root",
    isBuiltIn: false,
  };
  const subChild: DocumentStyle = {
    id: "style_sub_child",
    name: "Sub Child",
    type: "paragraph",
    basedOn: "style_child_a",
    isBuiltIn: false,
  };

  defs.push(root, childA, childB, subChild);

  // Children of Root: Child A and Child B
  const rootChildren = getStyleChildren("style_root", defs);
  assert.equal(rootChildren.length, 2);
  assert.deepEqual(rootChildren.map((c) => c.id).sort(), ["style_child_a", "style_child_b"]);

  // Descendants of Root: Child A, Child B, Sub Child
  const rootDescendants = collectDescendants("style_root", defs);
  assert.equal(rootDescendants.length, 3);
  assert.deepEqual(rootDescendants.sort(), ["style_child_a", "style_child_b", "style_sub_child"]);

  // Descendants of Child A: Sub Child
  const childADescendants = collectDescendants("style_child_a", defs);
  assert.deepEqual(childADescendants, ["style_sub_child"]);

  // Descendants of Sub Child: empty
  const subDescendants = collectDescendants("style_sub_child", defs);
  assert.equal(subDescendants.length, 0);
});
