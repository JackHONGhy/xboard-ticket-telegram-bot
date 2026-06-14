#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/JackHONGhy/xboard-ticket-telegram-bot.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/xboard-ticket-telegram-bot}"
BRANCH="${BRANCH:-main}"

as_root_note() {
  if [ "$(id -u)" -ne 0 ] && [[ "$INSTALL_DIR" == /opt/* ]]; then
    echo "Please run as root, or set INSTALL_DIR to a writable path."
    echo "Example: INSTALL_DIR=\$HOME/xboard-ticket-telegram-bot bash install.sh"
    exit 1
  fi
}

install_base_packages() {
  if command -v git >/dev/null 2>&1 && command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return
  fi

  if [ "$(id -u)" -ne 0 ]; then
    echo "git/docker/docker compose are not fully available."
    echo "Install them first, or run this script as root on a supported Linux distribution."
    exit 1
  fi

  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y git curl ca-certificates docker.io docker-compose-plugin
    systemctl enable --now docker >/dev/null 2>&1 || true
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    dnf install -y git curl ca-certificates docker docker-compose-plugin
    systemctl enable --now docker >/dev/null 2>&1 || true
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    yum install -y git curl ca-certificates docker docker-compose-plugin
    systemctl enable --now docker >/dev/null 2>&1 || true
    return
  fi

  echo "Unsupported package manager. Please install git, docker, and docker compose manually."
  exit 1
}

clone_or_update() {
  mkdir -p "$(dirname "$INSTALL_DIR")"

  if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" fetch origin "$BRANCH"
    git -C "$INSTALL_DIR" checkout "$BRANCH"
    git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
    return
  fi

  if [ -e "$INSTALL_DIR" ] && [ "$(find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 | wc -l)" -gt 0 ]; then
    echo "$INSTALL_DIR exists and is not empty."
    echo "Move it away, remove it, or set INSTALL_DIR to another path."
    exit 1
  fi

  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
}

create_env() {
  cd "$INSTALL_DIR"

  if [ -f ".env" ]; then
    echo ".env already exists, keeping it unchanged."
    return
  fi

  cp .env.example .env
  chmod 600 .env
  echo "Created $INSTALL_DIR/.env from .env.example"
}

main() {
  as_root_note
  install_base_packages
  clone_or_update
  create_env

  cat <<EOF

Project is ready:
  $INSTALL_DIR

Next steps:
  cd $INSTALL_DIR
  nano .env
  docker compose up -d --build
  docker compose logs -f

Health check:
  curl http://127.0.0.1:3000/healthz

EOF
}

main "$@"
