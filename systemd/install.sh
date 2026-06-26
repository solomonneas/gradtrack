#!/usr/bin/env bash
# Install gradtrack user systemd units (optional weekly refresh timer).
# Run once: bash <path-to-gradtrack>/systemd/install.sh
#
# This installs only the weekly refresh timer, which runs `gradtrack sync` +
# `gradtrack build`. To view the resulting static site, serve site/dist with
# any static file server, or run `gradtrack serve` for the Astro dev server on
# http://localhost:4321.
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
DST_DIR="$HOME/.config/systemd/user"
mkdir -p "$DST_DIR"
install -m 0644 "$SRC_DIR/gradtrack.service" "$DST_DIR/gradtrack.service"
install -m 0644 "$SRC_DIR/gradtrack.timer"   "$DST_DIR/gradtrack.timer"

systemctl --user daemon-reload
systemctl --user enable --now gradtrack.timer

echo "Installed. Next trigger:"
systemctl --user list-timers gradtrack.timer
echo
echo "Note: edit WorkingDirectory in gradtrack.service to match your clone path,"
echo "then re-run this script."
