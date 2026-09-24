import type { AgentToolResult, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig, saveConfig, type ThresholdConfig } from "./config.ts";
import { renderContextBar } from "./context-bar.ts";

const TOOL_SELF_COMPACT = "self_compact";
const TOOL_VIEW_CONTEXT = "view_context";
const STATUS_KEY = "self-compact";

interface PendingCompaction {
	noteToSelf?: string;
	instructions?: string;
	resume?: string;
}

export default function selfCompactExtension(pi: ExtensionAPI): void {
	const config: ThresholdConfig = loadConfig();
	let pending: PendingCompaction | undefined;
	let isRunning = false;
	const unsubscribers: Array<() => void> = [];

	const track = (result: unknown): void => {
		if (typeof result === "function") {
			unsubscribers.push(result as () => void);
		}
	};

	function ifLive(cb: () => void): void {
		try {
			cb();
		} catch {
			// Session closed or inactive
		}
	}

	function updateStatus(ctx: ExtensionContext): void {
		ifLive(() => {
			if (!ctx.hasUI) return;
			const usage = ctx.getContextUsage();
			if (!usage || usage.percent === null) {
				ctx.ui.setStatus(STATUS_KEY, undefined);
				return;
			}
			const bar = renderContextBar(
				usage.percent,
				config.softPercent * 100,
				config.warnPercent * 100,
				config.forcePercent * 100,
			);
			ctx.ui.setStatus(STATUS_KEY, bar);
		});
	}

	function formatUsageSummary(ctx: ExtensionContext): string {
		const usage = ctx.getContextUsage();
		if (!usage || usage.tokens === null) return "Context usage unknown";
		const pct = usage.percent !== null ? `${Math.round(usage.percent)}%` : "?%";
		return `${usage.tokens.toLocaleString()} / ${usage.contextWindow.toLocaleString()} tokens (${pct})`;
	}

	function deliverHandoff(text: string): void {
		setTimeout(() => {
			try {
				pi.sendUserMessage(text);
			} catch {
				// Session closed
			}
		}, 10);
	}

	async function executeCompaction(ctx: ExtensionContext, req: PendingCompaction): Promise<void> {
		isRunning = true;
		ifLive(() => {
			if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, "compacting...");
		});

		try {
			await new Promise<void>((resolve) => {
				const customInstructions =
					req.instructions ||
					config.defaultCompactionPrompt ||
					"Summarize earlier conversation thoroughly, preserving file names, architectural decisions, and current goals.";

				ctx.compact({
					customInstructions,
					onComplete: (result) => {
						const after =
							result.estimatedTokensAfter !== undefined
								? `~${result.estimatedTokensAfter.toLocaleString()}`
								: "unknown";
						ifLive(() => {
							if (ctx.hasUI) {
								ctx.ui.notify(
									`Compacted context: ${result.tokensBefore.toLocaleString()} -> ${after} tokens.`,
									"info",
								);
							}
						});

						if (req.noteToSelf || req.resume) {
							const handoffBody = [
								`[self-compact · Handoff Note]`,
								`Context has been compacted into a summary. Memory of raw execution history is cleared.`,
								req.noteToSelf ? `\n### Note to Self:\n${req.noteToSelf}` : "",
								req.resume ? `\n### Resume Action:\n${req.resume}` : "",
								`\nProceed with the next steps outlined in your note without re-doing completed work.`,
							]
								.filter(Boolean)
								.join("\n");

							deliverHandoff(handoffBody);
						}
						resolve();
					},
					onError: (error) => {
						ifLive(() => {
							if (ctx.hasUI) ctx.ui.notify(`Compaction failed: ${error.message}`, "error");
						});
						resolve();
					},
				});
			});
		} finally {
			isRunning = false;
			updateStatus(ctx);
		}
	}

	// 1. Tool: self_compact
	pi.registerTool({
		name: TOOL_SELF_COMPACT,
		label: "Self Compact",
		description:
			"Autonomously compact session memory when approaching context limits or reaching a natural milestone. " +
			"Provide `note_to_self` with current task status, deliverables done, and exact next actions to resume. " +
			"Once compaction completes, the note is delivered back to you verbatim to start the next turn.",
		parameters: Type.Object({
			note_to_self: Type.String({
				description:
					"Structured handoff note for the next cycle: what goal you are pursuing, what is done, and immediate next action.",
			}),
			instructions: Type.Optional(
				Type.String({
					description:
						"Specific directives for the compaction summarizer (what details/decisions to preserve).",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<AgentToolResult<unknown>> {
			if (isRunning) {
				return {
					content: [{ type: "text", text: "Compaction is already in progress." }],
					details: { queued: false, reason: "already-running" },
				};
			}
			if (pending) {
				return {
					content: [{ type: "text", text: "Compaction is already queued for turn settlement." }],
					details: { queued: false, reason: "already-queued" },
				};
			}

			// Interactive user confirmation if configured and UI is present
			if (config.confirm && ctx.hasUI) {
				const choice = await ctx.ui.select(
					`Agent requested self-compaction (${formatUsageSummary(ctx)}). Approve?`,
					["Yes, compact now", "No, skip compaction"],
				);
				if (choice !== "Yes, compact now") {
					return {
						content: [
							{
								type: "text",
								text: "User rejected compaction request. Continue working with current context.",
							},
						],
						details: { queued: false, reason: "user-rejected" },
					};
				}
			}

			pending = {
				noteToSelf: params.note_to_self.trim(),
				instructions: params.instructions?.trim(),
			};

			return {
				content: [
					{
						type: "text",
						text:
							`Compaction queued. It will execute as soon as this turn finishes (${formatUsageSummary(ctx)}).\n` +
							`Finish your response immediately without invoking more tools. Your note_to_self will be handed back to you.`,
					},
				],
				details: { queued: true, noteToSelf: params.note_to_self },
			};
		},
	});

	// 2. Tool: view_context
	pi.registerTool({
		name: TOOL_VIEW_CONTEXT,
		label: "View Context Usage",
		description:
			"Check current token usage, context percentage, and active compaction thresholds as JSON.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx): Promise<AgentToolResult<unknown>> {
			const usage = ctx.getContextUsage();
			const info = {
				tokens: usage?.tokens ?? null,
				contextWindow: usage?.contextWindow ?? null,
				percent: usage?.percent ?? null,
				thresholds: {
					softNotice: `${Math.round(config.softPercent * 100)}%`,
					warningNotice: `${Math.round(config.warnPercent * 100)}%`,
					forceCutoff: `${Math.round(config.forcePercent * 100)}%`,
				},
				confirmRequired: config.confirm,
			};
			return {
				content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
				details: info,
			};
		},
	});

	// 3. Hook: tool_call intercept (hard limit enforcement)
	track(
		pi.on("tool_call", async (event, ctx) => {
			const toolName = event.toolName;
			if (toolName === TOOL_SELF_COMPACT || toolName === TOOL_VIEW_CONTEXT) {
				return;
			}

			const usage = ctx.getContextUsage();
			if (!usage || usage.percent === null) return;

			const currentRatio = usage.percent / 100;
			if (currentRatio >= config.forcePercent) {
				return {
					block: true,
					reason:
						`[self-compact · Hard Cutoff Breached] Context usage (${Math.round(usage.percent)}%) exceeds hard limit (${Math.round(config.forcePercent * 100)}%). ` +
						`All tools except 'self_compact' and 'view_context' are blocked to prevent context explosion and price doubling. ` +
						`You MUST call 'self_compact' with a note_to_self immediately.`,
				};
			}
		}),
	);

	// 4. Hook: turn_start (notice & warning guidance)
	track(
		pi.on("turn_start", async (_event, ctx) => {
			updateStatus(ctx);
		}),
	);

	// 5. Hook: agent_settled (run queued compaction)
	track(
		pi.on("agent_settled", async (_event, ctx) => {
			if (!pending || isRunning) return;
			const req = pending;
			pending = undefined;
			await executeCompaction(ctx, req);
		}),
	);

	// 6. Command: /self-compact
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
			if (trimmed === "info" || !trimmed) {
				const usage = formatUsageSummary(ctx);
				const statusMsg =
					`Context Usage: ${usage}\n` +
					`Thresholds: Soft=${Math.round(config.softPercent * 100)}%, ` +
					`Warn=${Math.round(config.warnPercent * 100)}%, ` +
					`Force=${Math.round(config.forcePercent * 100)}%\n` +
					`User Confirmation: ${config.confirm ? "ON" : "OFF"}`;
				if (ctx.hasUI) {
					ctx.ui.notify(statusMsg, "info");
				}
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
				if (isRunning) {
					if (ctx.hasUI) ctx.ui.notify("Compaction is already running.", "warning");
					return;
				}
				pending = {
					noteToSelf: "Manual compaction requested by user.",
				};
				if (ctx.isIdle()) {
					const req = pending;
					pending = undefined;
					await executeCompaction(ctx, req);
				} else {
					if (ctx.hasUI) ctx.ui.notify("Compaction queued; will execute once idle.", "info");
				}
			}
		},
	});

	// 7. Cleanup
	pi.on("session_shutdown", async (_event, ctx) => {
		while (unsubscribers.length > 0) {
			try {
				unsubscribers.pop()?.();
			} catch {
				// ignore
			}
		}
		pending = undefined;
		isRunning = false;
		ifLive(() => {
			if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
		});
	});
}
