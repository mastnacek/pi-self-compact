import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

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
export const GLOBAL_CONFIG_FILE = join(CONFIG_DIR, "pi-self-compact.json");

/** Project override: <cwd>/.pi/pi-self-compact.json (wins over the global file). */
export function projectConfigPath(cwd: string): string {
	return join(cwd, ".pi", "pi-self-compact.json");
}

function readLayer(path: string): Partial<ThresholdConfig> {
	try {
		if (existsSync(path)) {
			return JSON.parse(readFileSync(path, "utf8")) as Partial<ThresholdConfig>;
		}
	} catch {
		// Corrupt layer — fall through to the next one.
	}
	return {};
}

/**
 * Effective config with the mandatory cascade:
 * defaults <- ~/.pi/agent/pi-self-compact.json <- <cwd>/.pi/pi-self-compact.json.
 * Without a cwd only the global layer applies.
 */
export function loadConfig(cwd?: string): ThresholdConfig {
	const merged = {
		...DEFAULT_CONFIG,
		...readLayer(GLOBAL_CONFIG_FILE),
		...(cwd ? readLayer(projectConfigPath(cwd)) : {}),
	};
	return merged;
}

/**
 * Persist the config: `--global` (isGlobal) writes ~/.pi/agent/, otherwise the
 * project file under <cwd>/.pi/. Without a cwd the global file is the target.
 */
export function saveConfig(cfg: ThresholdConfig, isGlobal = false, cwd?: string): void {
	const target = isGlobal || !cwd ? GLOBAL_CONFIG_FILE : projectConfigPath(cwd);
	try {
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, JSON.stringify(cfg, null, 2), "utf8");
	} catch {
		// silent error fallback
	}
}
