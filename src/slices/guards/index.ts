/**
 * Guards — pure rule functions for threshold enforcement. No session state.
 */

import type { ThresholdConfig } from "../../shared/config.js";

/** Tools always allowed, even at the hard cutoff. */
export const EXEMPT_TOOLS = new Set(["self_compact", "view_context"]);

export interface CutoffCheck {
	blocked: boolean;
	reason?: string;
}

/**
 * Hard-cutoff rule: above forcePercent every tool except the exempt set is
 * blocked so the agent cannot burn more context and must self-compact.
 */
export function checkHardCutoff(
	toolName: string,
	percent: number | null,
	config: ThresholdConfig,
): CutoffCheck {
	if (percent === null || EXEMPT_TOOLS.has(toolName)) return { blocked: false };
	const ratio = percent / 100;
	if (ratio < config.forcePercent) return { blocked: false };
	return {
		blocked: true,
		reason:
			`[self-compact · Hard Cutoff Breached] Context usage (${Math.round(percent)}%) exceeds hard limit (${Math.round(config.forcePercent * 100)}%). ` +
			`All tools except 'self_compact' and 'view_context' are blocked to prevent context explosion and price doubling. ` +
			`You MUST call 'self_compact' with a note_to_self immediately.`,
	};
}
