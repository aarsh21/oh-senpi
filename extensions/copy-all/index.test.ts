import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { writeClipboard } from "./index.ts";

test(
  "clipboard commands do not wait for a daemon that inherits stdout",
  { skip: process.platform === "win32" },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "oh-senpi-clipboard-"));
    const command = join(directory, "forking-clipboard");
    await writeFile(
      command,
      "#!/bin/sh\ncat >/dev/null\n(sleep 2) &\nexit 0\n",
      "utf8",
    );
    await chmod(command, 0o755);

    try {
      const startedAt = Date.now();
      await writeClipboard({ command, args: [] }, "copied text");
      assert.ok(
        Date.now() - startedAt < 1_000,
        "clipboard write waited for the detached clipboard owner",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
