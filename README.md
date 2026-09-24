# pi-self-compact

Self-compacting context manager for Pi coding agent (`@earendil-works/pi-coding-agent`).

Empowers long-running autonomous agents to watch their own context window, respect token/cost thresholds, and self-compact with structured handoff notes (`note_to_self`).

Inspired by Indie Dev Dan's *"Self-optimizing agents: Effective context and cost management"* and implementations by `disler/self-compact-pi-agent` and `saiday/pi-self-compact`.

## Features

1. **`self_compact` Tool (`note_to_self`)**:
   - The agent decides when to compact itself at logical subtask boundaries.
   - Saves a structured `note_to_self` handoff (goals, what's done, next actions).
   - Once compacted, the handoff note is delivered directly to the agent as the next prompt to seamlessly resume work.
   - Interactive user confirmation mode: ask user before compacting or run fully autonomous.
2. **`view_context` Tool**:
   - Returns live token count, percentage, threshold limits, and status as JSON without polluting transcript.
3. **3-Tier Context Thresholds**:
   - **Soft Notice (`~`)**: Informs agent context is filling up; recommend compacting at next stopping point.
   - **Stern Warning (`!`)**: Warning that memory cutoff is approaching.
   - **Hard Cutoff (`|`)**: Blocks non-compaction tools until the agent self-compacts to prevent token explosions and pricing tier doublings.
4. **Context Bar UI**:
   - Status bar widget displaying current token usage against the window and threshold markers.
5. **Commands**:
   - `/self-compact` - Manually trigger compaction with optional instructions.
   - `/self-compact info` - Show current thresholds, token counts, and configuration.
   - `/self-compact confirm [on|off]` - Toggle interactive user confirmation.
