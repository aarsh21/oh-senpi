import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Cause, Data, Effect, Exit } from "effect";

class ClipboardError extends Data.TaggedError("ClipboardError")<{
  readonly message: string;
  readonly cause: Error;
}> {}

function textFromContent(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      if (!("type" in block)) return "";

      if (
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string"
      ) {
        return block.text;
      }

      if (block.type === "image") return "[image]";

      return "";
    })
    .filter(Boolean)
    .join("\n");
}

interface ClipboardCommand {
  command: string;
  args: string[];
}

function clipboardCommands() {
  if (process.platform === "darwin") {
    return [{ command: "pbcopy", args: [] }] satisfies ClipboardCommand[];
  }
  if (process.platform === "win32") {
    return [{ command: "clip.exe", args: [] }] satisfies ClipboardCommand[];
  }

  const wayland = { command: "wl-copy", args: [] };
  const xclip = { command: "xclip", args: ["-selection", "clipboard"] };
  const xsel = { command: "xsel", args: ["--clipboard", "--input"] };
  const pbcopy = { command: "pbcopy", args: [] };

  return process.env.WAYLAND_DISPLAY
    ? [wayland, xclip, xsel, pbcopy]
    : [xclip, xsel, wayland, pbcopy];
}

function writeClipboard(command: ClipboardCommand, text: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command.command, command.args);
    let stderr = "";
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", fail);
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          stderr.trim() || `${command.command} exited with code ${code}`,
        ),
      );
    });
    child.stdin.end(text);
  });
}

function copyToClipboard(text: string) {
  return Effect.tryPromise({
    try: async () => {
      const failures: string[] = [];
      for (const command of clipboardCommands()) {
        try {
          await writeClipboard(command, text);
          return;
        } catch (error) {
          failures.push(
            `${command.command}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      throw new Error(
        `No supported clipboard command succeeded (${failures.join("; ")}).`,
      );
    },
    catch: (error) => {
      const cause = error instanceof Error ? error : new Error(String(error));
      return new ClipboardError({ message: cause.message, cause });
    },
  });
}

async function runClipboardCopy(text: string, signal: AbortSignal | undefined) {
  const exit = await Effect.runPromiseExit(
    copyToClipboard(text),
    signal ? { signal } : undefined,
  );
  if (Exit.isSuccess(exit)) return;
  if (Cause.hasInterruptsOnly(exit.cause)) {
    throw new Error("Copy was cancelled.");
  }
  const [first] = Cause.prettyErrors(exit.cause);
  throw new Error(first?.message ?? Cause.pretty(exit.cause));
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("copy-all", {
    description:
      "Copy all previous user and assistant messages in this thread to the clipboard",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();

      const sections = ctx.sessionManager
        .getBranch()
        .filter((entry) => entry.type === "message")
        .map((entry) => entry.message)
        .filter(
          (message) => message.role === "user" || message.role === "assistant",
        )
        .map((message) => ({
          role: message.role,
          content: textFromContent(message.content).trim(),
        }))
        .filter(({ content }) => content)
        .map(({ role, content }) => `${role.toUpperCase()}:\n${content}`);

      if (sections.length === 0) {
        ctx.ui.notify("No user or assistant messages to copy", "info");
        return;
      }

      await runClipboardCopy(sections.join("\n\n---\n\n"), ctx.signal);
      ctx.ui.notify(`Copied ${sections.length} messages to clipboard`, "info");
    },
  });
}
