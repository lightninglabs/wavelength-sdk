---
name: walletdk-cli
description: Automate the WalletDK wallet daemon with the darepocli command line tool. Use when scripting wallet operations, writing shell automation against darepod, parsing darepocli JSON output, or handling its exit codes. Triggers include "darepocli", "walletdk cli", "wallet daemon cli", and "script a walletdk wallet".
---

# darepocli automation

`darepocli` is the command line client for the wallet daemon. The CLI slice
of the docs has one page per top-level command with subcommands as sections.

Docs index: https://dadocs.lightning.engineering/llms.txt. Start at
https://dadocs.lightning.engineering/cli.md for global flags, config file,
TLS and auth flags, JSON output mode, and exit codes.

## Critical rules

- Use JSON output mode for any scripted parsing; never scrape the
  human-readable table output.
- Check exit codes as documented on the CLI index page; do not assume 0 or
  1 covers all cases.
- Each command page names the RPC it invokes; when a command's flags are
  unclear, read the corresponding RPC page from the API slice for the field
  semantics.
- Commands and flags come from the docs pages, not from memory; the tool is
  pre-release and its surface moves.
- `darepocli mcp serve` runs a local MCP server exposing the daemon's RPCs
  as tools over stdio: https://dadocs.lightning.engineering/cli/mcp.md.

## Command map

Fetch the CLI section of llms.txt for the current command list, then the
page for the command you need (for example
https://dadocs.lightning.engineering/cli/send.md).
