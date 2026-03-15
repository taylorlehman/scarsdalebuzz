#!/usr/bin/env bash
# sbadmin install script - agent-friendly
# Usage: ./scripts/install.sh [path-to-scarsdalebuzz-repo]
# Default: parent of this script's directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="${1:-$(cd "$CLI_DIR/.." && pwd)}"

echo "INSTALL_SBADMIN: repo_root=$REPO_ROOT cli_dir=$CLI_DIR"

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "INSTALL_SBADMIN_ERROR: Node.js not found. Install Node.js 18+ first."
  exit 2
fi

NODE_VERSION=$(node -v | sed 's/^v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ] 2>/dev/null; then
  echo "INSTALL_SBADMIN_ERROR: Node.js 18+ required (found $(node -v))"
  exit 2
fi

# Install dependencies
cd "$CLI_DIR"
npm install

# Verify
if node bin/sbadmin.js --help &>/dev/null; then
  echo "INSTALL_SBADMIN: success"
  echo "INSTALL_SBADMIN: run with: node $CLI_DIR/bin/sbadmin.js"
  exit 0
else
  echo "INSTALL_SBADMIN_ERROR: sbadmin --help failed"
  exit 2
fi
