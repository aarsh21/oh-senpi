export type HunkSession = {
  sessionId: string;
  repoRoot?: string;
  launchedAt?: string;
};

export type HyprlandClient = {
  address?: string;
  class?: string;
  initialClass?: string;
};

export type HunkReviewNote = {
  noteId: string;
  source: "user";
  filePath: string;
  hunkIndex?: number;
  oldRange?: [number, number];
  newRange?: [number, number];
  body: string;
  title?: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
};

export function parseCommandArguments(input: string) {
  const args: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;

  for (const character of input.trim()) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = undefined;
      } else {
        current += character;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += character;
    }
  }

  if (escaped) current += "\\";
  if (quote) throw new Error("Unclosed quote in Hunk arguments.");
  if (current) args.push(current);

  return args;
}

export function selectNewHunkWindow(
  clients: HyprlandClient[],
  existingAddresses: ReadonlySet<string>,
) {
  return clients.find((client) => {
    if (!client.address || existingAddresses.has(client.address)) return false;
    const appClass =
      `${client.class ?? ""} ${client.initialClass ?? ""}`.toLowerCase();
    return appClass.includes("org.omarchy.hunk");
  });
}

export function selectNewSession(
  sessions: HunkSession[],
  existingSessionIds: ReadonlySet<string>,
  repoRoot: string,
) {
  return sessions
    .filter(
      (session) =>
        session.repoRoot === repoRoot &&
        !existingSessionIds.has(session.sessionId),
    )
    .sort((left, right) =>
      (right.launchedAt ?? "").localeCompare(left.launchedAt ?? ""),
    )[0];
}

function formatRange(label: string, range: [number, number] | undefined) {
  if (!range) return undefined;
  return range[0] === range[1]
    ? `${label} line ${range[0]}`
    : `${label} lines ${range[0]}-${range[1]}`;
}

export function formatReviewPrompt(notes: HunkReviewNote[]) {
  const sections = notes.map((note, index) => {
    const locations = [
      note.hunkIndex === undefined ? undefined : `hunk ${note.hunkIndex + 1}`,
      formatRange("old", note.oldRange),
      formatRange("new", note.newRange),
    ].filter((location): location is string => Boolean(location));
    const location = locations.length > 0 ? ` (${locations.join(", ")})` : "";
    const title = note.title?.trim();
    const body = note.body.trim();

    return [
      `${index + 1}. \`${note.filePath}\`${location}`,
      title ? `   ${title}` : undefined,
      ...body.split("\n").map((line) => `   ${line}`),
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n");
  });

  return [
    "Apply the following review notes from my Hunk diff review.",
    "",
    "Inspect the referenced code, make the requested changes, and run the appropriate checks. Treat these notes as my review feedback. If a note is ambiguous or conflicts with the current code, ask me before making that change.",
    "",
    ...sections,
  ].join("\n");
}
