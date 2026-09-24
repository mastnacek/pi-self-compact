/**
 * /self-compact command — info, manual compaction, confirmation toggle.
 * Completions follow the Trailing Space Contract (confirm is non-terminal).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SelfCompactState } from "../../shared/state.js";
import { saveConfig } from "../../shared/config.js";
import { executeCompaction } from "../compaction/engine.js";

export function registerSelfCompactCommand(pi: ExtensionAPI, state: SelfCompactState): void {
	pi.registerCommand("self-compact", {
		description: "Self-compact context manager commands (/self-compact [info|now|confirm <on/off>])",
		getArgumentCompletions: (prefix) => {
			const subcmds = [
				{ label: "info", value: "info" },
				{ label: "now", value: "now" },
				{ label: "confirm", value: "confirm " },
			];
			if (prefix.startsWith("confirm ")) {
				return [
					{ label: "on", value: "confirm on" },
					{ label: "off", value: "confirm off" },
				];
			}
			return subcmds.filter((s) => s.label.startsWith(prefix));
		},
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			const config = state.config;

			if (trimmed === "info" || !trimmed) {
				const usage = ctx.getContextUsage();
				const usageText =
					usage && usage.tokens !== null
						? `${usage.tokens.toLocaleString()} / ${usage.contextWindow.toLocaleString()} tokens (${usage.percent !== null ? Math.round(usage.percent) : "?"}%)`
						: "unknown";
				const statusMsg =
					`Context Usage: ${usageText}\n` +
					`Thresholds: Soft=${Math.round(config.softPercent * 100)}%, ` +
					`Warn=${Math.round(config.warnPercent * 100)}%, ` +
					`Force=${Math.round(config.forcePercent * 100)}%\n` +
					`User Confirmation: ${config.confirm ? "ON" : "OFF"}`;
				if (ctx.hasUI) ctx.ui.notify(statusMsg, "info");
				return;
			}

			if (trimmed.startsWith("confirm")) {
				const mode = trimmed.slice(7).trim();
				if (mode === "on") {
					config.confirm = true;
					saveConfig(config);
					if (ctx.hasUI) ctx.ui.notify("Interactive confirmation enabled.", "info");
				} else if (mode === "off") {
					config.confirm = false;
					saveConfig(config);
					if (ctx.hasUI) ctx.ui.notify("Interactive confirmation disabled (autonomous mode).", "info");
				} else {
					if (ctx.hasUI) ctx.ui.notify("Usage: /self-compact confirm <on|off>", "warning");
				}
				return;
			}

			if (trimmed === "now") {
				if (state.isRunning) {
					if (ctx.hasUI) ctx.ui.notify("Compaction is already running.", "warning");
					return;
				}
				if (ctx.isIdle()) {
					await executeCompaction(pi, state, ctx, {
						noteToSelf: "Manual compaction requested by user.",
					});
				} else {
					state.pending = { noteToSelf: "Manual compaction requested by user." };
					if (ctx.hasUI) ctx.ui.notify("Compaction queued; will execute once idle.", "info");
				}
			}
		},
	});
}
