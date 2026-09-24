/**
 * pi-self-compact — self-compacting context manager for the Pi coding agent.
 *
 * The agent watches its own context window and compacts itself with a
 * structured note_to_self handoff. Composition root ONLY: creates the
 * SelfCompactState kernel and wires slices onto Pi events. No business logic
 * lives here:
 * - guard rules (hard cutoff)      → src/slices/guards
 * - event translation              → src/slices/pipeline
 * - /self-compact command          → src/slices/commands
 * - model tools (self_compact,
 *   view_context)                  → src/slices/tools
 * - compaction engine + context bar → src/slices/compaction
 * - session state + config         → src/shared
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./src/shared/config.js";
import { createSelfCompactState } from "./src/shared/state.js";
import { registerPipeline } from "./src/slices/pipeline/index.js";
import { registerModelTools } from "./src/slices/tools/index.js";
import { registerSelfCompactCommand } from "./src/slices/commands/index.js";

export default function selfCompactExtension(pi: ExtensionAPI): void {
	const state = createSelfCompactState(pi);

	// Session init: reload the cascading config
	// (defaults <- ~/.pi/agent/ <- <cwd>/.pi/), which the constructor cannot do
	// because no cwd exists at extension-load time.
	state.track(
		pi.on("session_start", async (_event, ctx) => {
			state.config = loadConfig(ctx.cwd);
		}),
	);

	registerPipeline(pi, state);
	registerModelTools(pi, state);
	registerSelfCompactCommand(pi, state);

	// Cleanup: drain listeners, clear queue and statusline.
	pi.on("session_shutdown", async (_event, ctx) => {
		while (state.unsubscribers.length > 0) {
			try {
				state.unsubscribers.pop()?.();
			} catch {
				// ignore
			}
		}
		state.pending = undefined;
		state.isRunning = false;
		state.ifLive(() => {
			if (ctx.hasUI) ctx.ui.setStatus("self-compact", undefined);
		});
	});
}
