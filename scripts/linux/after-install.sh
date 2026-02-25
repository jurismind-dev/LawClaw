#!/bin/bash

# Post-installation script for LawClaw on Linux

set -e

# Update desktop database
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database -q /usr/share/applications || true
fi

# Update icon cache
if command -v gtk-update-icon-cache &> /dev/null; then
    gtk-update-icon-cache -q /usr/share/icons/hicolor || true
fi

# Create symbolic link for CLI access (optional)
if [ -x /opt/ClawX/clawx ]; then
    ln -sf /opt/ClawX/clawx /usr/local/bin/clawx 2>/dev/null || true
fi

echo "LawClaw has been installed successfully."
