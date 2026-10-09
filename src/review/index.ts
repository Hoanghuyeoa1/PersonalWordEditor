/**
 * Review Engine Module - Personal Word Editor (Phase 5.1 Architecture)
 *
 * Entry point xuất khẩu toàn bộ hệ thống Review Engine:
 * - Types: ReviewGroup, ReviewItemType, ReviewItemDescriptor, States
 * - Services: ProofingService, CommentService, TrackChangesService, StatisticsService, Registry
 * - Commands: openDocumentStatisticsCommand, toggleTrackChangesCommand, dispatchReviewCommand
 * - Hooks: useReviewCommands
 * - Components: ReviewRibbonButton, DocumentStatisticsModal
 */

export * from "./types/reviewTypes.ts";
export * from "./services/reviewRegistry.ts";
export * from "./proofing/proofingTypes.ts";
export * from "./proofing/proofingService.ts";
export * from "./proofing/spellCheckerEngine.ts";
export * from "./proofing/spellCheckExtension.ts";
export * from "./proofing/dictionary/userDictionaryService.ts";
export * from "./proofing/dictionary/englishDictionary.ts";
export * from "./proofing/dictionary/vietnameseDictionary.ts";
export * from "./proofing/grammar/grammarCheckerEngine.ts";
export * from "./proofing/grammar/localGrammarProvider.ts";
export * from "./proofing/grammar/grammarRules.ts";
export * from "./comments/commentService.ts";
export * from "./trackChanges/trackChangesService.ts";
export * from "./trackChanges/trackChangeExtension.ts";
export * from "./trackChanges/formattingDiffService.ts";
export * from "./statistics/statisticsService.ts";
export * from "./commands/reviewCommands.ts";
export * from "./hooks/useReviewCommands.ts";
export * from "./utils/reviewUtils.ts";
export * from "./components/ReviewRibbonButton.tsx";
export * from "./components/DocumentStatisticsModal.tsx";
export * from "./proofing/components/SpellingContextMenu.tsx";
