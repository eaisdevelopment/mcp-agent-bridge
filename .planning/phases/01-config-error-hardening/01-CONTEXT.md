# Phase 1: Configuration and Error Hardening - Context

**Gathered:** 2026-02-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Centralized config module and bulletproof error handling across all async paths. All runtime behavior is configurable via environment variables, and no error condition crashes the server process. This phase does NOT add new tools or features — it hardens the existing prototype's configuration and error handling.

</domain>

<decisions>
## Implementation Decisions

### Config naming & defaults
- Claude's discretion on prefix style (flat CC_BRIDGE_* vs namespaced sub-groups) — pick whichever is cleaner for the project's size
- State directory default is OS-dependent: use the user's home directory with a `cloud_code_bridge` subfolder (e.g. ~/cloud_code_bridge on macOS/Linux, %USERPROFILE%\cloud_code_bridge on Windows)
- User can override the state directory via env var or on first run (interactive prompt — see Startup section)
- Claude's discretion on whether to support a config file alongside env vars
- Per-message character limit: **no limit by default**, but configurable via env var (CC_BRIDGE_CHAR_LIMIT or similar)

### Error messaging style
- Errors include both a machine-readable error code AND a descriptive message (e.g. `CLI_NOT_FOUND: claude not found on PATH. Install Claude Code or set CC_BRIDGE_CLAUDE_PATH`)
- Corrupted state file triggers auto-recovery: back up the corrupt file, create fresh state, log a warning, continue operating
- Error messages include actionable fix suggestions when possible (not just "what went wrong" but "how to fix it")
- Timeout errors include the timeout value used (e.g. "CLI timed out after 30000ms. Increase CC_BRIDGE_TIMEOUT_MS if needed")

### Log output design
- Dual logging: human-readable text to one file, structured JSON to another file
- Log files stored in the state directory (e.g. ~/cloud_code_bridge/logs/)
- Claude's discretion on default log level
- Claude's discretion on stderr behavior (whether it follows log level or stays minimal)

### Startup validation
- Claude's discretion on whether missing `claude` CLI causes a warning-and-continue or refuse-to-start
- State directory is auto-created (with parents) if it doesn't exist
- Write access is validated at startup (test file creation) — fail early with clear message if not writable
- First run includes an interactive prompt asking the user where to store data (with OS-appropriate default offered)

### Claude's Discretion
- Config prefix style (flat vs namespaced)
- Whether to support config file alongside env vars
- Default log level
- Stderr behavior relative to log level
- Missing CLI startup behavior (warn vs refuse)

</decisions>

<specifics>
## Specific Ideas

- "The directory for state must default depends on the OS — the main home directory in sub-folder cloud_code_bridge"
- First-run experience should be interactive — ask the user where to store data rather than silently picking a default
- Error messages should feel helpful, not just diagnostic — include fix suggestions

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-config-error-hardening*
*Context gathered: 2026-02-09*
