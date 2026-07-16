import { accessSync, constants, existsSync } from "node:fs";
import { delimiter, join } from "node:path";

function commandExists(command) {
  const names =
    process.platform === "win32"
      ? [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`]
      : [command];
  return (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .some((directory) =>
      names.some((name) => {
        try {
          accessSync(join(directory, name), constants.X_OK);
          return true;
        } catch {
          return false;
        }
      }),
    );
}

const omarchy = existsSync(join(process.env.HOME ?? "", ".config", "omarchy"));
const hyprland = commandExists("hyprctl");
const hunk = commandExists("hunk");
const clipboard = ["pbcopy", "wl-copy", "xclip", "xsel", "clip.exe"].some(
  commandExists,
);

console.log("\nOh Senpi installed.");
console.log(
  "  Pi will offer an optional dependency check on first interactive startup.",
);
console.log("  You can run /senpi-setup at any time.");
if (!hunk) {
  console.log(
    "  ○ Hunk Diff is missing (the setup wizard can install hunkdiff with npm). ",
  );
}
if (!clipboard) {
  console.log("  ○ No supported clipboard command was found for /copy-all.");
}
if (!omarchy || !hyprland) {
  console.log(
    "  Note: Hunk Review, Zed Prompt, and live theme integration currently require Omarchy + Hyprland.",
  );
  console.log("  macOS + AeroSpace support is planned.");
}
console.log("");
