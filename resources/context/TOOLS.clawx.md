## LawClaw Tool Notes

### uv (Python)

- Inside LawClaw-started processes, `uv` is the default Python entrypoint. Prefer `uv run python <script>` and `uv pip install <package>`.
- Do NOT probe bare `python`, `python3`, or `pip` first. Avoid `where python`, `which python`, Windows Store aliases, or shell-specific trial commands just to discover Python.
- Bare `python` / `python3` only exist as a compatibility fallback for older skills. Prefer `uv` even when the fallback would work.

### Browser

- `browser` tool provides full automation (scraping, form filling, testing) via an isolated managed browser.
- Flow: `action="start"` → `action="snapshot"` (see page + get element refs like `e12`) → `action="act"` (click/type using refs).
- Open new tabs: `action="open"` with `targetUrl`.
- To just open a URL for the user to view, use `shell:openExternal` instead.
