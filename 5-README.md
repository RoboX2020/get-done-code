# Get Done for Code

Set your own coding goals. Hit one and a reward image you picked unlocks.
Works in VS Code, Cursor and Antigravity (all VS Code based), one package.

## Goals (`getDone.criteria` in settings)
```json
"getDone.criteria": [
  { "type": "lines", "every": 100 },
  { "type": "saves", "every": 10 },
  { "type": "minutes", "every": 30 },
  { "type": "github" }
]
```
- `lines`: every N new lines typed (undo/redo ignored, huge pastes capped at 200 per change)
- `saves`: every N file saves
- `minutes`: every N minutes of active typing
- `github`: one reward per day you make a GitHub contribution (uses VS Code's built-in GitHub sign-in, read:user only; checked every `getDone.githubPollMinutes`)

## Rewards
Add your own https image links with the command `Get Done: Add Reward Image Link` or in `getDone.rewardImages`. They show one at a time, in order, and cycle. Nothing is bundled or hosted. Images load straight from your links.

## Privacy
Counts stay on your machine. Only the GitHub goal makes a network call (GitHub's API, for your own contribution count). No code or file contents are read or sent.

## Install for testing
```
npm install && npm test && npx vsce package
```
Then Extensions view, `...` menu, "Install from VSIX..." in VS Code, Cursor or Antigravity. Or `code --install-extension get-done-code-0.1.0.vsix` (`cursor` / `antigravity` CLIs work the same if installed).
