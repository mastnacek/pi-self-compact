/**
 * /self-compact command — info, manual compaction, confirmation toggle.
 * Completions follow the Trailing Space Contract (confirm is non-terminal) and
 * support the `--global` prefix for the config cascade.
 */

import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { ThresholdConfig } from "../../shared/config.js";
import { saveConfig } from "../../shared/config.js";
import type { SelfCompactState } from "../../shared/state.js";
import { executeCompaction } from "../compaction/engine.js";

/** One completion row; `value` replaces the whole argument string. */
interface Row {
	label: string;
	value: string;
	description?: string;
}

const CONFIRM_VALUES: readonly Row[] = [
	{ label: "on", value: "confirm on", description: "Ask before compacting" },
	{ label: "off", value: "confirm off", description: "Compact autonomously" },
];

const SUBCOMMANDS: readonly Row[] = [
	{ label: "info", value: "info", description: "Show context usage and thresholds" },
	{ label: "now", value: "now", description: "Compact the context immediately" },
	{
		label: "confirm",
		value: "confirm ",
		description: "Toggle interactive confirmation (on | off)",
	},
	{
		label: "--global",
		value: "--global ",
		description: "Save the following setting globally (~/.pi/agent/)",
	},
];

const GLOBAL_ROW: Row = {
	label: "--global",
	value: "--global ",
	description: "Save the following setting globally (~/.pi/agent/)",
};

/** Usage summary shared by the info banner. */
function describeUsage(ctx: ExtensionCommandContext): string {
	const usage = ctx.getContextUsage();
	if (!usage || usage.tokens === null) return "unknown";
	const pct = usage.percent !== null ? `${Math.round(usage.percent)}%` : "?%";
	return `${usage.tokens.toLocaleString()} / ${usage.contextWindow.toLocaleString()} tokens (${pct})`;
}

function describeThresholds(config: ThresholdConfig): string {
	const pct = (v: number) => Math.round(v * 100);
	return (
		`Thresholds: Soft=${pct(config.softPercent)}%, ` +
		`Warn=${pct(config.warnPercent)}%, Force=${pct(config.forcePercent)}%`
	);
}

/** Completion rows for everything after `/self-compact `. */
function completions(prefix: string): Row[] | null {
	const trimmed = prefix.trimStart();

	const clean = (cleanPrefix: string): Row[] | null => {
		const tokens = cleanPrefix.split(/\s+/).filter(Boolean);
		const head = (tokens[0] ?? "").toLowerCase();

		// Second level: a fully typed `confirm` already expands, because Tab
		// closes the picker and cannot re-open it.
		if (head === "confirm") {
			const typed = (tokens[1] ?? "").toLowerCase();
			const opts = CONFIRM_VALUES.filter((row) => row.label.startsWith(typed));
			return opts.length > 0 ? opts : null;
		}

		const items = SUBCOMMANDS.filter((row) => row.label.startsWith(head));
		return items.length > 0 ? items : null;
	};

	if (!trimmed.startsWith("--global")) return clean(trimmed);

	const afterGlobal = trimmed.slice(8).trimStart();
	const hasTrailingSpace = trimmed.length > 8 || /\s$/.test(prefix);
	if (!hasTrailingSpace && afterGlobal === "") return [GLOBAL_ROW];

	const sub = clean(afterGlobal);
	if (!sub) return null;
	const remapped: Row[] = [];
	for (const row of sub) {
		if (row.label === "--global") continue;
		remapped.push({
			label: row.label,
			value: `--global ${row.value}`,
			description: row.description,
		});
	}
	return remapped.length > 0 ? remapped : null;
}

/** `/self-compact confirm <on|off> [--global]`. */
function handleConfirm(
	state: SelfCompactState,
	arg: string,
	ctx: ExtensionCommandContext,
	isGlobal: boolean,
): void {
	const config = state.config;
	const scope = isGlobal ? "globally" : "for this project";

	if (arg !== "on" && arg !== "off") {
		if (ctx.hasUI) {
			ctx.ui.notify("Usage: /self-compact confirm <on|off> [--global]", "warning");
		}
		return;
	}

	config.confirm = arg === "on";
	saveConfig(config, isGlobal, ctx.cwd);
	if (!ctx.hasUI) return;
	ctx.ui.notify(
		arg === "on"
			? `Interactive confirmation enabled (saved ${scope}).`
			: `Interactive confirmation disabled (autonomous mode, saved ${scope}).`,
		"info",
	);
}

async function handleNow(
	pi: ExtensionAPI,
	state: SelfCompactState,
	ctx: ExtensionCommandContext,
): Promise<void> {
	if (state.isRunning) {
		if (ctx.hasUI) ctx.ui.notify("Compaction is already running.", "warning");
		return;
	}
	if (ctx.isIdle()) {
		await executeCompaction(pi, state, ctx, {
			noteToSelf: "Manual compaction requested by user.",
		});
		return;
	}
	state.pending = { noteToSelf: "Manual compaction requested by user." };
	if (ctx.hasUI) ctx.ui.notify("Compaction queued; will execute once idle.", "info");
}

export function registerSelfCompactCommand(pi: ExtensionAPI, state: SelfCompactState): void {
	pi.registerCommand("self-compact", {
		description:
			"Self-compact context manager commands (/self-compact [info|now|confirm <on/off>] [--global])",
		getArgumentCompletions: completions,

		handler: async (args, ctx) => {
			const rawTokens = args.trim().split(/\s+/).filter(Boolean);
			const isGlobal = rawTokens.some((t) => t.toLowerCase() === "--global");
			const tokens = rawTokens.filter((t) => t.toLowerCase() !== "--global");
			const sub = (tokens[0] ?? "info").toLowerCase();
			const config = state.config;

			if (sub === "confirm") {
				handleConfirm(state, (tokens[1] ?? "").toLowerCase(), ctx, isGlobal);
				return;
			}

			if (sub === "now") {
				await handleNow(pi, state, ctx);
				return;
			}

			if (sub !== "info") {
				if (ctx.hasUI) {
					ctx.ui.notify(`Unknown subcommand "${sub}". Use: /self-compact info`, "warning");
				}
				return;
			}

			const statusMsg =
				`Context Usage: ${describeUsage(ctx)}\n` +
				`${describeThresholds(config)}\n` +
				`User Confirmation: ${config.confirm ? "ON" : "OFF"}\n` +
				"Settings scope: `--global` writes ~/.pi/agent/, otherwise <cwd>/.pi/.";
			if (ctx.hasUI) ctx.ui.notify(statusMsg, "info");
		},
	});
}
