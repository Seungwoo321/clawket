#!/bin/bash
# DEPRECATED: this plugin repo no longer orchestrates builds from sibling
# source repos. Each source repo owns its own release cadence and pushes
# build artifacts into this plugin repo via its own deploy script.
#
# Run, in each source repo, whenever its artifacts should be refreshed:
#
#   clawket/web         $ pnpm deploy:plugin
#   clawket/daemon/rust $ ./scripts/deploy-to-plugin.sh
#   clawket/cli         $ ./scripts/deploy-to-plugin.sh
#   clawket/mcp/rust    $ ./scripts/deploy-to-plugin.sh
#
# Each repo reads its own scripts/deploy-to-plugin.config.sh (gitignored)
# where CLAWKET_PLUGIN_DIR points at this plugin repo clone. See each repo's
# scripts/deploy-to-plugin.config.example for the template.
#
# Artifacts land at:
#   <plugin>/daemon/web/           (web/dist contents)
#   <plugin>/bin/clawketd          (daemon release binary)
#   <plugin>/bin/clawket           (CLI release binary)
#   <plugin>/bin/clawket-mcp-rs    (MCP Rust release binary)

echo "scripts/build.sh is deprecated."
echo "Run deploy-to-plugin.sh from each source repo instead (see comments)."
exit 0
