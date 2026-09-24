/**
 * SelfCompactState — session-scoped kernel shared by the composition root and
 * all slices. Owns the mutable closure state that used to live inside the
 * extension factory (pending compaction, running flag, listeners).
 *
 * Every session creates one state via `createSelfCompactState()`; nothing here
 * is global, so concurrent/mocked extension registrations stay isolated.
 */

import { loadConfig, type ThresholdConfig } from "./config.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface PendingCompaction {
	noteToSelf?: string;
	instructions?: string;
	resume?: string;
}

export interface SelfCompactState {
	// --- lifecycle plumbing ---
	unsubscribers: Array<() => void>;
	/** Retain a `pi.on()` return value; older engine typings declare it void. */
	track(result: unknown): void;

	// --- config ---
	config: ThresholdConfig;

	// --- live session state ---
	pending: PendingCompaction | undefined;
	isRunning: boolean;

	// --- helpers ---
	ifLive(cb: () => void): void;
}

export function createSelfCompactState(_pi: ExtensionAPI): SelfCompactState {
	const unsubscribers: Array<() => void> = [];
	const track = (result: unknown): void => {
		if (typeof result === "function") unsubscribers.push(result as () => void);
	};
	const ifLive = (cb: () => void): void => {
		try {
			cb();
		} catch {
			// Session closed or inactive
		}
	};

	return {
		unsubscribers,
		track,
		config: loadConfig(),
		pending: undefined,
		isRunning: false,
		ifLive,
	};
}
