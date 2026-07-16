import { watch } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

type HyprlandClient = {
  address?: string;
  class?: string;
  initialClass?: string;
  title?: string;
  initialTitle?: string;
  floating?: boolean;
};

function isPromptWindow(client: HyprlandClient): boolean {
  const appClass =
    `${client.class ?? ""} ${client.initialClass ?? ""}`.toLowerCase();
  const title =
    `${client.title ?? ""} ${client.initialTitle ?? ""}`.toLowerCase();
  return appClass.includes("zed") && title.includes("pi-prompt.md");
}

async function findPromptWindow(
  pi: ExtensionAPI,
): Promise<HyprlandClient | undefined> {
  const result = await pi.exec("hyprctl", ["clients", "-j"]);
  if (result.code !== 0) return undefined;
  const clients = JSON.parse(result.stdout) as HyprlandClient[];
  return clients.find(isPromptWindow);
}

async function floatPromptWindow(pi: ExtensionAPI): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const promptWindow = await findPromptWindow(pi);
      if (promptWindow?.address) {
        const commands = [
          ...(promptWindow.floating
            ? []
            : [`dispatch togglefloating address:${promptWindow.address}`]),
          `dispatch resizeactive exact 1100 800 address:${promptWindow.address}`,
          `dispatch centerwindow address:${promptWindow.address}`,
          `dispatch alterzorder top address:${promptWindow.address}`,
        ];
        await pi.exec("hyprctl", ["--batch", commands.join("; ")]);
        return;
      }
    } catch {
      // Zed may still be creating the window; retry briefly.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function closePromptWindow(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): Promise<void> {
  // Zed has no CLI command for closing a window. Because this system uses
  // Hyprland, close the dedicated prompt window through the compositor.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const promptWindow = await findPromptWindow(pi);
      if (promptWindow?.address) {
        const closeResult = await pi.exec("hyprctl", [
          "dispatch",
          "closewindow",
          `address:${promptWindow.address}`,
        ]);
        if (closeResult.code === 0) return;
      }
    } catch {
      // Retry if Hyprland returned incomplete JSON while its client list changed.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  ctx.ui.notify(
    "Prompt saved, but the Zed window could not be closed automatically.",
    "warning",
  );
}

export default function zedPrompt(pi: ExtensionAPI) {
  let editing = false;

  pi.registerShortcut("ctrl+e", {
    description: "Write and send a prompt from Zed",
    handler: async (ctx) => {
      if (editing) {
        ctx.ui.notify("A Zed prompt is already open.", "warning");
        return;
      }

      editing = true;
      let directory: string | undefined;

      try {
        directory = await mkdtemp(join(tmpdir(), "pi-zed-prompt-"));
        const promptPath = join(directory, "pi-prompt.md");
        await writeFile(promptPath, ctx.ui.getEditorText(), "utf8");
        ctx.ui.notify(
          "Save in Zed to close the window and send the prompt.",
          "info",
        );

        let saveHandled = false;
        let saveTimer: ReturnType<typeof setTimeout> | undefined;
        const fileWatcher = watch(promptPath, () => {
          if (saveHandled) return;
          saveHandled = true;
          // Let Zed finish writing before asking Hyprland to close its window.
          saveTimer = setTimeout(() => void closePromptWindow(pi, ctx), 150);
        });

        const zedProcess = pi.exec("zeditor", ["--new", "--wait", promptPath]);
        void floatPromptWindow(pi);
        const result = await zedProcess;
        fileWatcher.close();
        if (saveTimer) clearTimeout(saveTimer);
        if (result.code !== 0) {
          const detail = result.stderr.trim();
          ctx.ui.notify(
            detail
              ? `Zed exited without sending: ${detail}`
              : "Zed exited without sending the prompt.",
            "error",
          );
          return;
        }

        const prompt = (await readFile(promptPath, "utf8")).replace(/\n$/, "");
        if (!prompt.trim()) return;

        // Mirror normal submission: put the edited text into Pi, send it, then
        // clear the editor so it cannot accidentally be submitted twice.
        ctx.ui.setEditorText(prompt);
        pi.sendUserMessage(
          prompt,
          ctx.isIdle() ? undefined : { deliverAs: "followUp" },
        );
        ctx.ui.setEditorText("");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Could not edit the prompt in Zed: ${message}`, "error");
      } finally {
        editing = false;
        if (directory) {
          await rm(directory, { recursive: true, force: true });
        }
      }
    },
  });
}
