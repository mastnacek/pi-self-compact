/**
 * pi-self-compact — self-compacting context manager for the Pi coding agent.
 *
 * The agent watches its own context window and compacts itself with a
 * structured note_to_self handoff. Composition root only: the extension
 * factory lives in src/extension.ts.
 *
 * Controls: /self-compact [info|now|confirm <on|off>]
 * Tools: self_compact(note_to_self), view_context()
 */

import selfCompactExtension from "./src/extension.js";

export default selfCompactExtension;
