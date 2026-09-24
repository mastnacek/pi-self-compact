/**
 * `/self-compact` menu tests — lock the trailing-space contract, lazy parameter
 * expansion, and the `--global` prefix added by the config-cascade work.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { registerSelfCompactCommand } from "../src/slices/commands/index.js";

/** Capture the registered command definition from a minimal fake pi. */
function captureCommand() {
  let def = null;
  const pi = {
    registerCommand(name, commandDef) {
      if (name === "self-compact") def = commandDef;
    },
  };
  // Only `state.config` is read by the completions path.
  registerSelfCompactCommand(pi, {
    config: { softPercent: 0.6, warnPercent: 0.75, forcePercent: 0.85, confirm: true },
  });
  return def;
}

test("root completions include --global and keep non-terminal rows spaced", () => {
  const def = captureCommand();
  assert.ok(def, "self-compact command was not registered");

  const items = def.getArgumentCompletions("") ?? [];
  const byLabel = new Map(items.map((i) => [i.label, i]));

  assert.ok(byLabel.has("--global"), "--global must be offered");
  assert.equal(byLabel.get("--global").value, "--global ");
  assert.equal(byLabel.get("confirm").value, "confirm ", "confirm is non-terminal");
  assert.equal(byLabel.get("info").value, "info", "info is terminal");
  assert.equal(byLabel.get("now").value, "now", "now is terminal");
});

test("a fully typed `confirm` already expands to on|off", () => {
  const def = captureCommand();
  const items = def.getArgumentCompletions("confirm") ?? [];
  assert.deepEqual(
    items.map((i) => i.value),
    ["confirm on", "confirm off"],
  );
});

test("--global prefix preserves child completions", () => {
  const def = captureCommand();

  const level1 = def.getArgumentCompletions("--global ") ?? [];
  const values = level1.map((i) => i.value);
  assert.ok(values.includes("--global confirm "), `got ${JSON.stringify(values)}`);
  assert.ok(values.includes("--global info"));
  assert.ok(
    !values.some((v) => v.startsWith("--global --global")),
    "must not nest --global",
  );

  const level2 = def.getArgumentCompletions("--global confirm ") ?? [];
  assert.deepEqual(
    level2.map((i) => i.value),
    ["--global confirm on", "--global confirm off"],
  );
});
