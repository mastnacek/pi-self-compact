import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ThresholdConfig {
	/** Soft notice percent (e.g. 50% or 0.5) */
	softPercent: number;
	/** Warning notice percent (e.g. 70% or 0.7) */
	warnPercent: number;
	/** Force cutoff percent (e.g. 85% or 0.85) */
	forcePercent: number;
	/** Whether interactive confirmation is required before compacting */
	confirm: boolean;
	/** Custom compaction instructions if not provided by model */
	defaultCompactionPrompt?: string;
}

export const DEFAULT_CONFIG: ThresholdConfig = {
	softPercent: 0.60,
	warnPercent: 0.75,
	forcePercent: 0.85,
	confirm: true,
};

const CONFIG_DIR = join(homedir(), ".pi", "agent");
const CONFIG_FILE = join(CONFIG_DIR, "pi-self-compact.json");

export function loadConfig(): ThresholdConfig {
	try {
		if (existsSync(CONFIG_FILE)) {
			const raw = readFileSync(CONFIG_FILE, "utf8");
			return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
		}
	} catch {
		// fallback to defaults on read error
	}
	return { ...DEFAULT_CONFIG };
}

export function saveConfig(cfg: ThresholdConfig): void {
	try {
		if (!existsSync(CONFIG_DIR)) {
			mkdirSync(CONFIG_DIR, { recursive: true });
		}
		writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
	} catch {
		// silent error fallback
	}
}
