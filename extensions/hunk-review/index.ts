import { spawn } from "node:child_process";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  formatReviewPrompt,
  parseCommandArguments,
  selectNewHunkWindow,
  selectNewSession,
  type HunkReviewNote,
  type HunkSession,
  type HyprlandClient,
} from "./workflow.ts";

const SESSION_START_TIMEOUT_MS = 15_000;
const WINDOW_START_TIMEOUT_MS = 8_000;
const POLL_INTERVAL_MS = 400;
const COMMAND_TIMEOUT_MS = 4_000;

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseJsonRecord(output: string) {
  const parsed: unknown = JSON.parse(output);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Hunk returned an invalid JSON response.");
  }
  return parsed as Record<string, unknown>;
}

async function listSessions(pi: ExtensionAPI, cwd: string) {
  const result = await pi.exec("hunk", ["session", "list", "--json"], {
    cwd,
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "Could not list Hunk sessions.");
  }

  const sessions = parseJsonRecord(result.stdout).sessions;
  return Array.isArray(sessions) ? (sessions as HunkSession[]) : [];
}

async function listUserNotes(pi: ExtensionAPI, cwd: string, sessionId: string) {
  const result = await pi.exec(
    "hunk",
    ["session", "comment", "list", sessionId, "--type", "user", "--json"],
    { cwd, timeout: COMMAND_TIMEOUT_MS },
  );
  if (result.code !== 0) return undefined;

  const comments = parseJsonRecord(result.stdout).comments;
  return Array.isArray(comments) ? (comments as HunkReviewNote[]) : [];
}

async function listHyprlandClients(pi: ExtensionAPI, cwd: string) {
  const result = await pi.exec("hyprctl", ["clients", "-j"], {
    cwd,
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (result.code !== 0) return [];

  const parsed: unknown = JSON.parse(result.stdout);
  return Array.isArray(parsed) ? (parsed as HyprlandClient[]) : [];
}

async function fullscreenNewHunkWindow(
  pi: ExtensionAPI,
  cwd: string,
  existingAddresses: ReadonlySet<string>,
) {
  const deadline = Date.now() + WINDOW_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const window = selectNewHunkWindow(
      await listHyprlandClients(pi, cwd),
      existingAddresses,
    );
    if (window?.address) {
      const result = await pi.exec(
        "hyprctl",
        [
          "--batch",
          `dispatch focuswindow address:${window.address}; dispatch fullscreen 1`,
        ],
        { cwd, timeout: COMMAND_TIMEOUT_MS },
      );
      return result.code === 0;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

async function stopIdleHunkDaemon(pi: ExtensionAPI, cwd: string) {
  const host = process.env.HUNK_MCP_HOST?.trim() || "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") return;

  const configuredPort = Number.parseInt(process.env.HUNK_MCP_PORT ?? "", 10);
  const port =
    Number.isInteger(configuredPort) && configuredPort > 0
      ? configuredPort
      : 47_657;

  // Hunk normally retains its Bun daemon for an idle minute. A single daemon
  // uses roughly 100–120 MB here, so release it as soon as this workflow is the
  // last session instead of accumulating that cost between repeated reviews.
  try {
    const response = await fetch(`http://${host}:${port}/health`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return;

    const health: unknown = await response.json();
    if (typeof health !== "object" || health === null) return;
    const record = health as Record<string, unknown>;
    if (record.sessions !== 0 || record.pendingCommands !== 0) return;
    if (!Number.isInteger(record.pid) || (record.pid as number) <= 1) return;

    const pid = record.pid as number;
    const command = await pi.exec("ps", ["-p", String(pid), "-o", "args="], {
      cwd,
      timeout: COMMAND_TIMEOUT_MS,
    });
    if (
      command.code !== 0 ||
      !/(?:^|\/)hunk(?:\s|$).*\bdaemon\s+serve\b/.test(command.stdout.trim())
    ) {
      return;
    }

    process.kill(pid, "SIGTERM");
  } catch {
    // The daemon may have already completed its own idle shutdown.
  }
}

async function resolveRepoRoot(pi: ExtensionAPI, cwd: string) {
  const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (result.code !== 0) return undefined;
  return result.stdout.trim() || undefined;
}

function launchHunk(cwd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      "omarchy-launch-tui",
      ["hunk", "diff", "--agent-notes", ...args],
      {
        cwd,
        detached: true,
        stdio: "ignore",
      },
    );

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function mergeWithEditor(ctx: ExtensionCommandContext, prompt: string) {
  const existing = ctx.ui.getEditorText().trim();
  const isCommandText = /^\/(?:h?diff)(?:\s|$)/.test(existing);
  return existing && !isCommandText ? `${existing}\n\n${prompt}` : prompt;
}

export default function hunkReview(pi: ExtensionAPI) {
  let workflowGeneration = 0;
  let workflowActive = false;

  pi.on("session_shutdown", () => {
    workflowGeneration += 1;
    workflowActive = false;
  });

  const runReview = async (rawArgs: string, ctx: ExtensionCommandContext) => {
    if (ctx.mode !== "tui") {
      ctx.ui.notify(
        "The Hunk review workflow requires Pi's interactive TUI.",
        "warning",
      );
      return;
    }
    if (!ctx.isIdle()) {
      ctx.ui.notify(
        "Wait for the agent to finish before opening Hunk.",
        "warning",
      );
      return;
    }
    if (workflowActive) {
      ctx.ui.notify("A Hunk review workflow is already active.", "warning");
      return;
    }

    let hunkArgs: string[];
    try {
      hunkArgs = parseCommandArguments(rawArgs);
    } catch (error) {
      ctx.ui.notify(
        error instanceof Error ? error.message : String(error),
        "error",
      );
      return;
    }

    const repoRoot = await resolveRepoRoot(pi, ctx.cwd);
    if (!repoRoot) {
      ctx.ui.notify(
        "Open Pi inside a Git repository before using /diff.",
        "warning",
      );
      return;
    }

    workflowActive = true;
    const generation = ++workflowGeneration;
    ctx.ui.setStatus("hunk-review", "waiting for Hunk review");

    try {
      const [existingSessions, existingWindows] = await Promise.all([
        listSessions(pi, repoRoot),
        listHyprlandClients(pi, repoRoot),
      ]);
      const existingIds = new Set(
        existingSessions.map((session) => session.sessionId),
      );
      const existingWindowAddresses = new Set(
        existingWindows.flatMap((window) =>
          window.address ? [window.address] : [],
        ),
      );

      await launchHunk(repoRoot, hunkArgs);
      const fullscreenApplied = await fullscreenNewHunkWindow(
        pi,
        repoRoot,
        existingWindowAddresses,
      );
      if (!fullscreenApplied) {
        ctx.ui.notify(
          "Hunk opened, but its terminal could not be switched to fullscreen.",
          "warning",
        );
      }
      ctx.ui.notify(
        "Hunk opened. Press c to add a note, Ctrl+S to save it, then close Hunk to return your notes to Pi.",
        "info",
      );

      const deadline = Date.now() + SESSION_START_TIMEOUT_MS;
      let session: HunkSession | undefined;
      while (Date.now() < deadline && generation === workflowGeneration) {
        session = selectNewSession(
          await listSessions(pi, repoRoot),
          existingIds,
          repoRoot,
        );
        if (session) break;
        await sleep(POLL_INTERVAL_MS);
      }

      if (!session || generation !== workflowGeneration) {
        if (generation === workflowGeneration) {
          ctx.ui.notify(
            "Hunk did not register a review session. It may have exited because there are no changes.",
            "warning",
          );
        }
        return;
      }

      let latestNotes: HunkReviewNote[] = [];
      while (generation === workflowGeneration) {
        const notes = await listUserNotes(pi, repoRoot, session.sessionId);
        if (notes) latestNotes = notes;

        const sessions = await listSessions(pi, repoRoot);
        if (!sessions.some((item) => item.sessionId === session.sessionId)) {
          break;
        }
        await sleep(POLL_INTERVAL_MS);
      }

      if (generation !== workflowGeneration) return;
      if (latestNotes.length === 0) {
        ctx.ui.notify("Hunk closed without any saved review notes.", "info");
        return;
      }

      const prompt = formatReviewPrompt(latestNotes);
      ctx.ui.setEditorText(mergeWithEditor(ctx, prompt));
      ctx.ui.notify(
        `Imported ${latestNotes.length} Hunk review note${latestNotes.length === 1 ? "" : "s"}. Review the prompt and press Enter.`,
        "info",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Hunk review failed: ${message}`, "error");
    } finally {
      await stopIdleHunkDaemon(pi, repoRoot);
      if (generation === workflowGeneration) {
        workflowActive = false;
        ctx.ui.setStatus("hunk-review", undefined);
      }
    }
  };

  pi.registerCommand("diff", {
    description:
      "Review changes in Hunk and import your notes into the Pi editor",
    handler: runReview,
  });
}
