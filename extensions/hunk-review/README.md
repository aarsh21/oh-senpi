# Pi Hunk review workflow

Command-only Pi extension; it registers no model tools.

## Usage

1. Run `/diff` from Pi inside a Git repository.
2. Hunk opens fullscreen in an external Omarchy terminal.
3. Select a hunk or line and press `c` to create a review note.
4. Enter the feedback you want Pi to apply, then press `Ctrl+S` to save it.
5. Add as many notes as needed, then quit Hunk with `q`.
6. The extension converts the saved human notes into an actionable prompt and places it in Pi's editor.
7. Review or amend the prompt, then press Enter yourself.

Nothing is submitted automatically. Once Hunk closes, the extension also stops Hunk's idle daemon when no other Hunk sessions exist so its memory is released immediately.

Optional Hunk diff arguments are supported, for example:

```text
/diff --staged
/diff main...HEAD
/diff -- src/app.ts
```
