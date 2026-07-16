#!/usr/bin/env python3
"""Generate a Pi theme from the active Omarchy colors.toml palette."""

import json
import os
from pathlib import Path
import sys
import tomllib

COLORS_PATH = Path.home() / ".config/omarchy/current/theme/colors.toml"
OUTPUT_PATH = Path.home() / ".pi/agent/themes/omarchy-live.json"


def rgb(value: str) -> tuple[int, int, int]:
    value = str(value).strip().lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def hex_color(parts: tuple[float, float, float]) -> str:
    values = tuple(max(0, min(255, round(part))) for part in parts)
    return "#%02x%02x%02x" % values


def mix(left: str, right: str, amount: float) -> str:
    left_rgb = rgb(left)
    right_rgb = rgb(right)
    return hex_color(
        tuple(
            left_part + (right_part - left_part) * amount
            for left_part, right_part in zip(left_rgb, right_rgb)
        )
    )


def main() -> None:
    colors_path = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else COLORS_PATH
    output_path = Path(sys.argv[2]).expanduser() if len(sys.argv) > 2 else OUTPUT_PATH

    if not colors_path.is_file():
        raise SystemExit(f"Omarchy palette not found: {colors_path}")

    with colors_path.open("rb") as palette_file:
        colors = tomllib.load(palette_file)

    def color(name: str, fallback: str) -> str:
        return str(colors.get(name, fallback))

    background = color("background", color("bg", color("color0", "#000000")))
    foreground = color("foreground", color("fg", color("color7", "#ffffff")))
    accent = color("accent", color("cursor", color("color4", foreground)))
    muted = color("muted", color("dark_fg", mix(background, foreground, 0.48)))
    dim = color("dark_fg", mix(background, foreground, 0.62))
    red = color("red", color("color1", "#ff6666"))
    green = color("green", color("color2", "#66cc88"))
    yellow = color("yellow", color("color3", "#ddbb66"))
    blue = color("blue", color("color4", accent))
    magenta = color("magenta", color("color5", accent))
    cyan = color("cyan", color("color6", accent))
    orange = color("orange", yellow)
    bright_blue = color("bright_blue", color("color12", accent))
    bright_magenta = color("bright_magenta", color("color13", magenta))
    bright_cyan = color("bright_cyan", color("color14", cyan))
    panel = color("lighter_bg", mix(background, foreground, 0.10))

    theme = {
        "$schema": "https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
        "name": "omarchy-live",
        "vars": {
            "bg": background,
            "fg": foreground,
            "panel": panel,
            "accent": accent,
            "muted": muted,
            "dim": dim,
            "red": red,
            "green": green,
            "yellow": yellow,
            "blue": blue,
            "magenta": magenta,
            "cyan": cyan,
            "orange": orange,
            "brightBlue": bright_blue,
            "brightMagenta": bright_magenta,
            "brightCyan": bright_cyan,
            "selectedBg": mix(background, accent, 0.24),
            "userMessageBg": mix(background, accent, 0.12),
            "customMessageBg": mix(background, magenta, 0.14),
            "pendingBg": mix(background, foreground, 0.07),
            "successBg": mix(background, green, 0.10),
            "errorBg": mix(background, red, 0.10),
        },
        "colors": {
            "accent": "accent",
            "border": "muted",
            "borderAccent": "brightBlue",
            "borderMuted": "panel",
            "success": "green",
            "error": "red",
            "warning": "yellow",
            "muted": "muted",
            "dim": "dim",
            "text": "fg",
            "thinkingText": "dim",
            "selectedBg": "selectedBg",
            "userMessageBg": "userMessageBg",
            "userMessageText": "fg",
            "customMessageBg": "customMessageBg",
            "customMessageText": "fg",
            "customMessageLabel": "magenta",
            "toolPendingBg": "pendingBg",
            "toolSuccessBg": "successBg",
            "toolErrorBg": "errorBg",
            "toolTitle": "accent",
            "toolOutput": "fg",
            "mdHeading": "accent",
            "mdLink": "blue",
            "mdLinkUrl": "cyan",
            "mdCode": "green",
            "mdCodeBlock": "fg",
            "mdCodeBlockBorder": "muted",
            "mdQuote": "dim",
            "mdQuoteBorder": "magenta",
            "mdHr": "muted",
            "mdListBullet": "cyan",
            "toolDiffAdded": "green",
            "toolDiffRemoved": "red",
            "toolDiffContext": "dim",
            "syntaxComment": "muted",
            "syntaxKeyword": "brightMagenta",
            "syntaxFunction": "blue",
            "syntaxVariable": "fg",
            "syntaxString": "green",
            "syntaxNumber": "orange",
            "syntaxType": "yellow",
            "syntaxOperator": "brightBlue",
            "syntaxPunctuation": "dim",
            "thinkingOff": "muted",
            "thinkingMinimal": "dim",
            "thinkingLow": "blue",
            "thinkingMedium": "accent",
            "thinkingHigh": "magenta",
            "thinkingXhigh": "brightMagenta",
            "thinkingMax": "brightCyan",
            "bashMode": "green",
        },
        "export": {
            "pageBg": background,
            "cardBg": panel,
            "infoBg": mix(background, accent, 0.12),
        },
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_name(f".{output_path.name}.tmp")
    temporary.write_text(json.dumps(theme, indent=2) + "\n", encoding="utf-8")
    if output_path.exists():
        os.chmod(temporary, output_path.stat().st_mode)
    os.replace(temporary, output_path)
    print(f"Generated {output_path}")


if __name__ == "__main__":
    main()
