# Oh Senpi

A curated monorepo of Pi extensions, multi-agent tools, UI customizations, skills, and themes maintained by [@aarsh21](https://github.com/aarsh21).

> Pi packages execute code with your full user permissions. Review the source before installing.

## Install

The command you were thinking of is `pi install`:

```sh
pi install git:github.com/aarsh21/oh-senpi
```

Restart Pi, or run `/reload` in an existing session. Open the package manager to enable or disable individual resources:

```sh
pi config
```

Use `Tab` in `pi config` to switch between global and project-local settings. To install the package only for one project, run:

```sh
pi install -l git:github.com/aarsh21/oh-senpi
```

Update or remove it with:

```sh
pi update --extension git:github.com/aarsh21/oh-senpi
pi remove git:github.com/aarsh21/oh-senpi
```

For reproducible installs, append a release tag, for example `@v0.1.0`.

## Included resources

| Resource                       | What it adds                                                                         | Extra requirements                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Web Access**                 | `web_search`, page/PDF/GitHub/video fetching, search curator, and provider fallbacks | Search-provider credentials are optional; OpenAI search can reuse Pi Codex login. `ffmpeg` and `yt-dlp` are optional for video frames. |
| **Web Search Only**            | Keeps only `web_search`, forces OpenAI, and disables the browser curator             | Enable together with Web Access. Authenticate through Pi's OpenAI/Codex `/login` or configure an OpenAI key.                           |
| **Ask User**                   | `ask_user` multiple-choice tool with a custom-answer editor                          | Interactive Pi TUI.                                                                                                                    |
| **Background Terminals**       | `bg_start`, `bg_status`, `bg_list`, `bg_kill`, and `/ps`                             | No Omarchy/Hyprland dependency. Uses `/bin/sh` on Unix and `cmd.exe` on Windows.                                                       |
| **Copy All**                   | `/copy-all` copies the current user/assistant thread                                 | `pbcopy` on macOS, `wl-copy` on Wayland, `xclip`/`xsel` on X11, or `clip.exe` on Windows.                                              |
| **Git Info**                   | Branch, dirty-file and pull-request status plus `/lg` and `/pr`                      | `git`; `gh` is optional and required only for pull-request lookup.                                                                     |
| **Hunk Review**                | `/diff` opens Hunk and imports review notes into Pi                                  | **Omarchy + Hyprland required**, plus `hunk`, `hyprctl`, and `omarchy-launch-tui`.                                                     |
| **Model Info**                 | Model, thinking, context, cost, and token-speed state for the custom dashboard       | No external dependency.                                                                                                                |
| **Subagents**                  | Pi, Claude Code, and Codex background subagents plus `/subagents`                    | Pi backend works in-process. Claude backend needs Claude Code auth; Codex backend needs the `codex` CLI and auth.                      |
| **UI Customization**           | Custom Pi header/footer with model and Git dashboard information                     | No Omarchy/Hyprland dependency; best used with Git Info and Model Info.                                                                |
| **Workflows**                  | Sandboxed, model-authored multi-agent `workflow` tool and `/workflows` dashboard     | A Node runtime with permission-model support; no Omarchy/Hyprland dependency.                                                          |
| **Zed Prompt**                 | `Ctrl+E` opens the current prompt in Zed, then sends it when saved                   | **Hyprland required** and Zed's `zeditor` CLI. Omarchy itself is not required.                                                         |
| **Background Terminals skill** | Guidance for operating the background-terminal tools                                 | Enable with the matching extension.                                                                                                    |
| **Subagents skill**            | Harness/model guidance for the subagent tools                                        | Enable with the matching extension.                                                                                                    |
| **Themes**                     | `github-dark-default` and an Omarchy palette snapshot                                | Static themes work anywhere. Live Omarchy syncing is optional and described below.                                                     |

## Web Access modes

Both Web Access and Web Search Only are enabled by the package manifest. This reproduces the author's current setup: only `web_search` remains active, calls use OpenAI, and the browser curator is skipped.

- **Search only:** keep both extensions enabled.
- **Full web access:** disable **Web Search Only** in `pi config`; keep **Web Access** enabled.
- **No web tools:** disable both.

Optional provider configuration lives at `~/.pi/web-search.json`. An OpenAI-only example is available at [`config/web-search.openai-only.example.json`](config/web-search.openai-only.example.json). Full configuration and provider details are documented in [`extensions/web-access/README.md`](extensions/web-access/README.md).

The vendored Web Access implementation is based on the MIT-licensed [`nicobailon/pi-web-access`](https://github.com/nicobailon/pi-web-access). Its original copyright and license are preserved; see [Third-party notices](THIRD_PARTY_NOTICES.md).

## Enable only selected extensions

`pi install` installs this repository as one package. Use `pi config` to toggle each extension, skill, or theme independently.

For a declarative allowlist, replace the string entry in `~/.pi/agent/settings.json` with an object. This example loads only Ask User:

```json
{
  "packages": [
    {
      "source": "git:github.com/aarsh21/oh-senpi",
      "extensions": ["extensions/ask-user/index.ts"],
      "skills": [],
      "themes": []
    }
  ]
}
```

Filters narrow the resources declared in [`package.json`](package.json). Add more manifest paths to the arrays as needed.

## Omarchy live theme (optional)

Most of Oh Senpi does **not** require Omarchy or Hyprland. Only Hunk Review requires both; Zed Prompt requires Hyprland; live theme synchronization requires Omarchy.

The included `omarchy` theme is a portable snapshot. On an Omarchy system, install the optional hook to regenerate an `omarchy-live` Pi theme whenever Omarchy changes themes:

```sh
repo="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/git/github.com/aarsh21/oh-senpi"
"$repo/scripts/install-omarchy-hook.sh"
```

Then select `omarchy-live` in Pi via `/settings`. The hook reads `~/.config/omarchy/current/theme/colors.toml` and writes `~/.pi/agent/themes/omarchy-live.json`. It requires Python 3.11+ for `tomllib`.

## Development

```sh
git clone https://github.com/aarsh21/oh-senpi.git
cd oh-senpi
npm install
npm test
npm run lint
```

Minimum supported Pi version: **0.80.8**. Runtime dependencies are installed automatically by `pi install`.

## Security notes

Oh Senpi is intentionally powerful. Background Terminals can run arbitrary shell commands. Workflow children and Pi subagents receive normal agent tools. The Claude backend uses Claude Code's permission-bypass mode, and the Codex backend starts with approval disabled and danger-full-access sandboxing. Web Access can optionally read browser cookies only when you explicitly enable that feature.

Review the source, enable only the resources you trust, and run Pi inside an appropriate container or sandbox when working with untrusted repositories.

## License

Oh Senpi's original code is available under the [MIT License](LICENSE). Vendored third-party code remains under its original license and attribution.
