/**
 * self_compact tool — agent-initiated compaction with user confirmation
 * (interactive sessions) and note_to_self handoff queueing.
 */

import type { AgentToolResult, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { SelfCompactState } from "../../shared/state.js";
import { saveConfig } from "../../shared/config.js";

function formatUsageSummary(ctx: ExtensionContext): string {
	const usage = ctx.getContextUsage();
	if (!usage || usage.tokens === null) return "Context usage unknown";
	const pct = usage.percent !== null ? `${Math.round(usage.percent)}%` : "?%";
	return `${usage.tokens.toLocaleString()} / ${usage.contextWindow.toLocaleString()} tokens (${pct})`;
}

export function registerSelfCompactTool(pi: ExtensionAPI, state: SelfCompactState): void {
	pi.registerTool({
		name: "self_compact",
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
			if (state.isRunning) {
				return {
					content: [{ type: "text", text: "Compaction is already in progress." }],
					details: { queued: false, reason: "already-running" },
				};
			}
			if (state.pending) {
				return {
					content: [{ type: "text", text: "Compaction is already queued for turn settlement." }],
					details: { queued: false, reason: "already-queued" },
				};
			}

			// Interactive user confirmation if configured and UI is present
			if (state.config.confirm && ctx.hasUI) {
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

			state.pending = {
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

	// confirm toggle shares config mutation with the command slice
	(state as SelfCompactState & { __saveConfig?: () => void }).__saveConfig = () => saveConfig(state.config);
}
