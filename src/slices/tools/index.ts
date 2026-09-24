/**
 * Model-facing tools (self_compact / view_context). Pure registration
 * dispatch — tool implementations live in sibling files so each stays under
 * the plugin's per-file line limit.
 */

import type { AgentToolResult, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { SelfCompactState } from "../../shared/state.js";
import { registerSelfCompactTool } from "./compact-tool.js";

export function registerModelTools(pi: ExtensionAPI, state: SelfCompactState): void {
	registerSelfCompactTool(pi, state);
	registerViewContextTool(pi, state);
}

function registerViewContextTool(pi: ExtensionAPI, state: SelfCompactState): void {
	pi.registerTool({
		name: "view_context",
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
					softNotice: `${Math.round(state.config.softPercent * 100)}%`,
					warningNotice: `${Math.round(state.config.warnPercent * 100)}%`,
					forceCutoff: `${Math.round(state.config.forcePercent * 100)}%`,
				},
				confirmRequired: state.config.confirm,
			};
			return {
				content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
				details: info,
			};
		},
	});
}
