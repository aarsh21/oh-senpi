import assert from "node:assert/strict";
import test from "node:test";
import {
  formatReviewPrompt,
  parseCommandArguments,
  selectNewHunkWindow,
  selectNewSession,
  type HunkReviewNote,
} from "./workflow.ts";

test("parses optional Hunk diff arguments without invoking a shell", () => {
  assert.deepEqual(parseCommandArguments("--staged -- src/'hello world.ts'"), [
    "--staged",
    "--",
    "src/hello world.ts",
  ]);
  assert.deepEqual(parseCommandArguments('main...HEAD -- "src/app.ts"'), [
    "main...HEAD",
    "--",
    "src/app.ts",
  ]);
  assert.throws(() => parseCommandArguments("'unfinished"), /Unclosed quote/);
});

test("selects the newly opened Omarchy Hunk window", () => {
  const selected = selectNewHunkWindow(
    [
      { address: "0x1", class: "org.omarchy.hunk" },
      { address: "0x2", class: "org.omarchy.hunk" },
      { address: "0x3", class: "com.mitchellh.ghostty" },
    ],
    new Set(["0x1"]),
  );

  assert.equal(selected?.address, "0x2");
});

test("selects only a newly opened session for the current repo", () => {
  const selected = selectNewSession(
    [
      { sessionId: "old", repoRoot: "/repo", launchedAt: "2026-01-01" },
      { sessionId: "other", repoRoot: "/other", launchedAt: "2026-01-03" },
      { sessionId: "new", repoRoot: "/repo", launchedAt: "2026-01-02" },
    ],
    new Set(["old"]),
    "/repo",
  );

  assert.equal(selected?.sessionId, "new");
});

test("formats saved Hunk notes as a ready-to-submit Pi prompt", () => {
  const notes: HunkReviewNote[] = [
    {
      noteId: "user:1",
      source: "user",
      filePath: "src/auth.ts",
      hunkIndex: 1,
      newRange: [42, 45],
      body: "Validate expiry before caching.\nAdd a regression test.",
    },
  ];

  const prompt = formatReviewPrompt(notes);
  assert.match(prompt, /Apply the following review notes/);
  assert.match(prompt, /`src\/auth\.ts` \(hunk 2, new lines 42-45\)/);
  assert.match(prompt, /Validate expiry before caching/);
  assert.match(prompt, /Add a regression test/);
});
