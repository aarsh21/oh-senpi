#!/usr/bin/env bash
set -euo pipefail

hook="$HOME/.config/omarchy/hooks/theme-set"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
generator="$script_dir/generate-omarchy-theme.py"
start_marker="# BEGIN OH-SENPI PI THEME"
end_marker="# END OH-SENPI PI THEME"

if [[ ! -d "$HOME/.config/omarchy" ]]; then
  printf 'Omarchy was not found at %s\n' "$HOME/.config/omarchy" >&2
  exit 1
fi

mkdir -p "$(dirname -- "$hook")"
touch "$hook"

if grep -Fq "$start_marker" "$hook"; then
  printf 'Oh Senpi is already present in %s\n' "$hook"
else
  quoted_generator="$(printf '%q' "$generator")"
  cat >>"$hook" <<EOF

$start_marker
python3 $quoted_generator
$end_marker
EOF
  chmod +x "$hook"
  printf 'Installed Oh Senpi theme hook in %s\n' "$hook"
fi

python3 "$generator"
printf 'Select the "omarchy-live" theme in Pi with /settings.\n'
