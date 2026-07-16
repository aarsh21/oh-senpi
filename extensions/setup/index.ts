import { constants, existsSync, readFileSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const SETUP_PROMPT_VERSION = 1;
const INSTALL_TIMEOUT_MS = 3 * 60 * 1_000;

type DesktopEnvironment = "omarchy-hyprland" | "other";

interface SetupState {
  promptedVersion?: number;
  desktopEnvironment?: DesktopEnvironment;
}

interface DependencyStatus {
  label: string;
  available: boolean;
  detail: string;
}

function executableNames(command: string) {
  if (process.platform !== "win32") return [command];
  const extensions = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .filter(Boolean);
  return [command, ...extensions.map((extension) => `${command}${extension}`)];
}

async function commandExists(command: string) {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    for (const name of executableNames(command)) {
      try {
        await access(join(directory, name), constants.X_OK);
        return true;
      } catch {
        // Keep checking PATH candidates.
      }
    }
  }
  return false;
}

function clipboardCommands() {
  if (process.platform === "darwin") return ["pbcopy"];
  if (process.platform === "win32") return ["clip.exe"];
  return ["wl-copy", "xclip", "xsel", "pbcopy"];
}

async function hasClipboardCommand() {
  for (const command of clipboardCommands()) {
    if (await commandExists(command)) return true;
  }
  return false;
}

function setupStatePath() {
  return join(getAgentDir(), "oh-senpi", "setup.json");
}

async function readSetupState() {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(setupStatePath(), "utf8"),
    );
    return typeof parsed === "object" && parsed !== null
      ? (parsed as SetupState)
      : {};
  } catch {
    return {};
  }
}

async function writeSetupState(state: SetupState) {
  const path = setupStatePath();
  await mkdir(join(getAgentDir(), "oh-senpi"), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function omarchyThemeHookInstalled() {
  const hookPath = join(homedir(), ".config", "omarchy", "hooks", "theme-set");
  if (!existsSync(hookPath)) return false;
  try {
    return readFileSync(hookPath, "utf8").includes("# BEGIN OH-SENPI PI THEME");
  } catch {
    return false;
  }
}

function installHint(id: string) {
  if (id === "clipboard") {
    if (process.platform === "darwin") return "pbcopy is included with macOS.";
    if (process.platform === "win32")
      return "clip.exe is included with Windows.";
    if (process.env.WAYLAND_DISPLAY) {
      return "Install wl-clipboard (Omarchy/Arch: omarchy-pkg-add wl-clipboard; Debian/Ubuntu: sudo apt install wl-clipboard).";
    }
    return "Install xclip or xsel (Arch: sudo pacman -S xclip; Debian/Ubuntu: sudo apt install xclip).";
  }
  if (id === "zed") {
    return process.platform === "darwin"
      ? "macOS Zed + AeroSpace integration is planned; see TODO.md."
      : "Install Zed and ensure the zeditor command is on PATH.";
  }
  if (id === "windowing") {
    return process.platform === "darwin"
      ? "macOS + AeroSpace support is planned; see TODO.md."
      : "Hunk Review needs Omarchy's omarchy-launch-tui and Hyprland's hyprctl.";
  }
  if (id === "gh")
    return "Install and authenticate GitHub CLI (gh auth login) for PR lookup and private GitHub fetching.";
  if (id === "claude")
    return "Install and authenticate Claude Code to use the Claude subagent backend.";
  if (id === "codex")
    return "Install and authenticate Codex CLI to use the Codex subagent backend.";
  if (id === "video")
    return "Install ffmpeg and yt-dlp for Web Access video frame extraction.";
  return "";
}

async function dependencyStatuses() {
  const [
    hunk,
    clipboard,
    zed,
    hyprctl,
    omarchyLauncher,
    git,
    gh,
    claude,
    codex,
    ffmpeg,
    ytDlp,
  ] = await Promise.all([
    commandExists("hunk"),
    hasClipboardCommand(),
    commandExists("zeditor"),
    commandExists("hyprctl"),
    commandExists("omarchy-launch-tui"),
    commandExists("git"),
    commandExists("gh"),
    commandExists("claude"),
    commandExists("codex"),
    commandExists("ffmpeg"),
    commandExists("yt-dlp"),
  ]);

  const hyprlandIntegration = hyprctl && omarchyLauncher;
  return {
    hunk,
    clipboard,
    zed,
    hyprlandIntegration,
    statuses: [
      {
        label: "Hunk Diff",
        available: hunk,
        detail: hunk ? "hunk command found" : "needed by /diff",
      },
      {
        label: "Clipboard",
        available: clipboard,
        detail: clipboard ? "copy command found" : "needed by /copy-all",
      },
      {
        label: "Git",
        available: git,
        detail: git ? "git command found" : "needed by Git Info and /diff",
      },
      {
        label: "Hyprland + Omarchy launcher",
        available: hyprlandIntegration,
        detail: hyprlandIntegration
          ? "Hunk/Zed window integration available"
          : installHint("windowing"),
      },
      {
        label: "Zed CLI",
        available: zed,
        detail: zed ? "zeditor command found" : installHint("zed"),
      },
      {
        label: "GitHub CLI",
        available: gh,
        detail: gh ? "gh command found" : installHint("gh"),
      },
      {
        label: "Claude Code",
        available: claude,
        detail: claude ? "Claude subagents available" : installHint("claude"),
      },
      {
        label: "Codex CLI",
        available: codex,
        detail: codex ? "Codex subagents available" : installHint("codex"),
      },
      {
        label: "Video helpers",
        available: ffmpeg && ytDlp,
        detail:
          ffmpeg && ytDlp ? "ffmpeg and yt-dlp found" : installHint("video"),
      },
    ] satisfies DependencyStatus[],
  };
}

function formatStatuses(statuses: DependencyStatus[]) {
  return statuses
    .map(
      ({ label, available, detail }) =>
        `${available ? "✓" : "○"} ${label}: ${detail}`,
    )
    .join("\n");
}

async function installHunk(pi: ExtensionAPI, ctx: ExtensionContext) {
  if (!(await commandExists("npm"))) {
    ctx.ui.notify(
      "npm was not found. Install Hunk manually with: npm install -g hunkdiff",
      "error",
    );
    return false;
  }

  ctx.ui.setStatus("oh-senpi-setup", "installing Hunk Diff");
  try {
    const result = await pi.exec("npm", ["install", "-g", "hunkdiff"], {
      cwd: ctx.cwd,
      timeout: INSTALL_TIMEOUT_MS,
    });
    if (result.code !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim();
      ctx.ui.notify(
        `Hunk installation failed${detail ? `: ${detail}` : ". Run npm install -g hunkdiff manually."}`,
        "error",
      );
      return false;
    }
    ctx.ui.notify("Hunk Diff installed successfully.", "info");
    return true;
  } finally {
    ctx.ui.setStatus("oh-senpi-setup", undefined);
  }
}

async function selectDesktopEnvironment(ctx: ExtensionContext) {
  const omarchyDetected =
    existsSync(join(homedir(), ".config", "omarchy")) &&
    (await commandExists("hyprctl"));
  const omarchyLabel = omarchyDetected
    ? "Omarchy + Hyprland (detected)"
    : "Omarchy + Hyprland";
  const choice = await ctx.ui.select(
    "Which desktop environment are you using? Desktop integrations currently support only Omarchy + Hyprland.",
    [omarchyLabel, "Something else"],
  );
  return choice === omarchyLabel ? "omarchy-hyprland" : "other";
}

async function installOmarchyThemeHook(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
) {
  const installer = fileURLToPath(
    new URL("../../scripts/install-omarchy-hook.sh", import.meta.url),
  );
  const result = await pi.exec("bash", [installer], {
    cwd: ctx.cwd,
    timeout: 30_000,
  });
  if (result.code !== 0) {
    ctx.ui.notify(
      result.stderr.trim() || "Could not install the Omarchy theme hook.",
      "error",
    );
    return;
  }
  ctx.ui.notify(
    "Installed the live Omarchy theme. Run /reload, then select omarchy-live in /settings.",
    "info",
  );
}

async function runSetup(pi: ExtensionAPI, ctx: ExtensionContext) {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("Oh Senpi setup requires Pi's interactive TUI.", "warning");
    return undefined;
  }

  const desktopEnvironment = await selectDesktopEnvironment(ctx);
  const usesOmarchy = desktopEnvironment === "omarchy-hyprland";
  let report = await dependencyStatuses();

  if (usesOmarchy && !report.hunk) {
    const choice = await ctx.ui.select(
      "Hunk Diff is missing. Install it now?",
      ["Install with npm", "Skip for now"],
    );
    if (choice === "Install with npm" && (await installHunk(pi, ctx))) {
      report = await dependencyStatuses();
    }
  }

  if (!report.clipboard) {
    ctx.ui.notify(installHint("clipboard"), "warning");
  }

  if (usesOmarchy) {
    if (!report.hyprlandIntegration) {
      ctx.ui.notify(installHint("windowing"), "warning");
    }
    if (!omarchyThemeHookInstalled()) {
      const themeChoice = await ctx.ui.select(
        "Enable Oh Senpi's live Omarchy theme synchronization?",
        ["Enable live theme", "Skip theming"],
      );
      if (themeChoice === "Enable live theme") {
        await installOmarchyThemeHook(pi, ctx);
      }
    }
  } else {
    ctx.ui.notify(
      process.platform === "darwin"
        ? "macOS + AeroSpace support for Zed Prompt, Hunk Review, and theming is planned but not implemented yet."
        : "Skipping Omarchy theming and desktop integrations. Disable Hunk Review, Zed Prompt, and the Omarchy theme in pi config.",
      "info",
    );
  }

  const statuses = usesOmarchy
    ? report.statuses
    : report.statuses.filter(
        ({ label }) =>
          label !== "Hunk Diff" &&
          label !== "Hyprland + Omarchy launcher" &&
          label !== "Zed CLI",
      );
  ctx.ui.notify(formatStatuses(statuses), "info");
  return desktopEnvironment;
}

export default function setup(pi: ExtensionAPI) {
  pi.registerCommand("senpi-setup", {
    description: "Check and configure optional Oh Senpi dependencies",
    handler: async (_args, ctx) => {
      const desktopEnvironment = await runSetup(pi, ctx);
      await writeSetupState({
        promptedVersion: SETUP_PROMPT_VERSION,
        desktopEnvironment,
      });
    },
  });

  pi.on("session_start", async (event, ctx) => {
    if (event.reason !== "startup" || ctx.mode !== "tui") return;
    const state = await readSetupState();
    if ((state.promptedVersion ?? 0) >= SETUP_PROMPT_VERSION) return;

    const choice = await ctx.ui.select(
      "Oh Senpi can check optional dependencies such as Hunk Diff, clipboard helpers, Zed, and subagent CLIs.",
      ["Review dependencies now", "Skip — I can run /senpi-setup later"],
    );
    const desktopEnvironment =
      choice === "Review dependencies now"
        ? await runSetup(pi, ctx)
        : undefined;
    await writeSetupState({
      promptedVersion: SETUP_PROMPT_VERSION,
      desktopEnvironment,
    });
  });
}
