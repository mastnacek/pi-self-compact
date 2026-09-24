/**
 * Compaction slice — the engine that compacts context and delivers the
 * note_to_self handoff, plus the pure context-bar renderer. Barrel module.
 */

export { executeCompaction, updateStatus } from "./engine.js";
export { renderContextBar } from "./context-bar.js";
