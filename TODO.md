# Roadmap / TODO

## macOS + AeroSpace desktop integration

Tracked in [GitHub issue #1](https://github.com/aarsh21/oh-senpi/issues/1).

Desktop-specific integrations currently support **Omarchy + Hyprland only**. The portable extensions—including Ask User, Background Terminals, Copy All, Git Info, Model Info, Web Access, Subagents, and Workflows—do not depend on Omarchy.

Planned macOS work:

- [ ] Introduce a window-manager abstraction shared by Zed Prompt and Hunk Review.
- [ ] Add an AeroSpace adapter for window discovery, focus, layout, and close operations.
- [ ] Support macOS Zed CLI and application paths.
- [ ] Add a macOS terminal launcher for Hunk Review instead of `omarchy-launch-tui`.
- [ ] Add macOS-compatible live theme synchronization.
- [ ] Add macOS and AeroSpace setup detection and tests.
- [ ] Update `/senpi-setup` to offer these integrations when support lands.

Until then, `/senpi-setup` asks whether the user runs Omarchy + Hyprland. For other environments it skips theme setup and explains which desktop integrations should be disabled through `pi config`.
