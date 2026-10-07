/* diff-viewer — unified-diff viewer with optional inline GitHub comments and
   finding-agnostic line annotations. Public surface: the DiffViewer component
   + the DiffCommentApi/DiffAnnotationApi contracts. */
export { DiffViewer } from "./DiffViewer";
export type { DiffTarget } from "./target";
export { TARGET_HIGHLIGHT_MS } from "./target";
export type { DiffCommentApi } from "./comments";
export type { DiffAnnotationApi, DiffLineAnnotation } from "./annotations";
