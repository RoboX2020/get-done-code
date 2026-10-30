// ============================================================================
// extension.ts - the VS Code extension's wiring. This is the file VS Code
// actually starts.
//
// WHAT "GET DONE" IS: a motivation extension. You set goals like "every 100
// lines written" or "every 20 saves", and each time you hit a goal the
// extension pops up the next image from your personal reward list (a puppy,
// a dream car, whatever keeps you going). A gift icon in the status bar
// shows your progress.
//
// THE THREE FILES:
//   src/core.ts       all the goal counting logic (pure functions, tested)
//   src/github.ts     the "one reward per day for GitHub contributions" goal
//   src/extension.ts  THIS FILE: listens to editor events, calls core.ts,
//                     and shows the reward popup
//
// HOW TO READ IT: activate() runs once when the extension loads. Inside it,
// each "ctx.subscriptions.push(...)" registers one listener (typed text,
// saved file, a command from the command palette). deactivate() does
// nothing - VS Code cleans up the listeners for us.
// ============================================================================

import * as vscode from 'vscode';
import { Criterion, State, emptyState, parseCriteria, linesAdded, addLines, addSave, addActive, applyGithub, nextImage, progressSummary, localDay, isHttpsImage } from './core';
import { contributionsToday } from './github';

const KEY = 'getDone.state';
let panel: vscode.WebviewPanel | undefined;

// Entry point: VS Code calls this once when the extension activates.
// Everything below sets up one piece: settings, saved progress, the status
// bar gift icon, the reward popper, the event listeners, and the commands.
export function activate(ctx: vscode.ExtensionContext) {
  // Shortcuts for reading the user's settings ("getDone.criteria" = the
  // goals, "getDone.rewardImages" = the list of reward image links).
  const cfg = () => vscode.workspace.getConfiguration('getDone');
  const criteria = (): Criterion[] => parseCriteria(cfg().get('criteria'));
  const images = (): string[] => cfg().get<string[]>('rewardImages') ?? [];
  // Progress survives restarts: it lives in VS Code's globalState storage
  // under one key. On startup we merge the saved progress over a fresh state.
  let state: State = { ...emptyState(), ...(ctx.globalState.get<State>(KEY) ?? {}) };
  const save = () => ctx.globalState.update(KEY, state);

  // The little gift icon at the bottom-right of the window. Clicking it
  // shows the progress summary. refresh() redraws it from current state.
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  bar.command = 'getDone.showProgress';
  const refresh = () => { bar.text = `$(gift) ${progressSummary(state, criteria())}`; bar.tooltip = 'Get Done: click for progress'; bar.show(); };
  refresh();
  ctx.subscriptions.push(bar);

  // The moment of joy: called with the number of rewards just earned
  // (you can earn several at once, e.g. after a big paste-free typing run).
  // Shows one popup per earned reward; if no reward images are configured,
  // nudges the user to add one instead.
  const reward = (count: number) => {
    for (let i = 0; i < count; i++) {
      const url = nextImage(state, images());
      if (!url) {
        vscode.window.showInformationMessage('Goal hit! Add a reward image link to see your reward.', 'Add image').then(a => a && vscode.commands.executeCommand('getDone.addImage'));
        break;
      }
      show(ctx, url, state.rewardsEarned);
    }
    save(); refresh();
  };

  // Lines written
  // Listener 1: you typed something. Count genuinely new lines (undo/redo
  // and pure deletions do not count; core.linesAdded decides) and maybe
  // earn a reward.
  ctx.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
    if (e.document.uri.scheme !== 'file' || e.reason !== undefined) return; // skip undo/redo
    let n = 0;
    for (const c of e.contentChanges) n += linesAdded(c.text, c.range.end.line - c.range.start.line);
    if (n > 0) reward(addLines(state, criteria(), n)); else refresh();
    markActive();
  }));
  // Listener 2: you saved a file. Maybe earn a save-goal reward.
  ctx.subscriptions.push(vscode.workspace.onDidSaveTextDocument(d => { if (d.uri.scheme === 'file') reward(addSave(state, criteria())); }));

  // Active typing minutes (counts a 1-minute window after each edit, at most once per window)
  let lastActive = 0;
  // Listener 3 helper: active-minutes goal. Every burst of typing extends
  // your "active" time; full minutes add up toward the minutes goal.
  const markActive = () => {
    const now = Date.now();
    if (lastActive && now - lastActive < 60000) { const got = addActive(state, criteria(), now - lastActive); lastActive = now; if (got) reward(got); }
    else lastActive = now;
  };

  // GitHub mode
  // The GitHub goal: one reward per day if you made at least one GitHub
  // contribution today. checkGithub asks GitHub's API (via github.ts) and
  // applies it; it runs on a timer, and immediately when the user runs the
  // "Check GitHub" command (manual=true, which is also allowed to trigger
  // the GitHub sign-in prompt).
  let timer: NodeJS.Timeout | undefined;
  const checkGithub = async (manual = false) => {
    if (!criteria().some(c => c.type === 'github')) { if (manual) vscode.window.showInformationMessage('No github goal in getDone.criteria.'); return; }
    try {
      const session = await vscode.authentication.getSession('github', ['read:user'], { createIfNone: manual });
      if (!session) return;
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const n = await contributionsToday(session.accessToken, start.toISOString(), now.toISOString());
      const earned = applyGithub(state, criteria(), localDay(now), n);
      if (earned) reward(earned);
      else if (manual) vscode.window.showInformationMessage(n > 0 ? 'Today\'s GitHub reward already unlocked.' : 'No GitHub contributions yet today.');
      refresh();
    } catch (err) { if (manual) vscode.window.showErrorMessage(`GitHub check failed: ${(err as Error).message}`); }
  };
  // (Re)start the GitHub polling timer - every githubPollMinutes minutes,
  // but only if a github goal exists. Called on startup and whenever the
  // settings change.
  const schedule = () => {
    if (timer) clearInterval(timer);
    const mins = Math.max(5, cfg().get<number>('githubPollMinutes') ?? 15);
    if (criteria().some(c => c.type === 'github')) { checkGithub(false); timer = setInterval(() => checkGithub(false), mins * 60000); }
  };
  schedule();
  ctx.subscriptions.push({ dispose: () => timer && clearInterval(timer) });
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('getDone')) { schedule(); refresh(); } }));

  // The five commands the user can run from the Command Palette:
  // show progress, add a reward image, preview the next reward, check
  // GitHub now, and reset all progress.
  ctx.subscriptions.push(
    vscode.commands.registerCommand('getDone.showProgress', () => vscode.window.showInformationMessage(`Get Done: ${progressSummary(state, criteria())} (rewards earned: ${state.rewardsEarned})`)),
    vscode.commands.registerCommand('getDone.addImage', async () => {
      const url = (await vscode.window.showInputBox({ prompt: 'Reward image link (https)', validateInput: v => isHttpsImage(v) ? undefined : 'Must be an https link' }))?.trim();
      if (!url) return;
      await cfg().update('rewardImages', [...images(), url], vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage('Reward image added.');
    }),
    vscode.commands.registerCommand('getDone.previewReward', () => {
      const url = images().filter(isHttpsImage)[state.rewardIndex % Math.max(1, images().filter(isHttpsImage).length)];
      if (url) show(ctx, url, state.rewardsEarned + 1, true); else vscode.window.showInformationMessage('Add a reward image first.');
    }),
    vscode.commands.registerCommand('getDone.checkGithub', () => checkGithub(true)),
    vscode.commands.registerCommand('getDone.reset', async () => { state = emptyState(); await save(); refresh(); })
  );
}

// Makes a string safe to drop into HTML (so an image link cannot inject
// markup into the popup).
function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// Opens (or reuses) the "Reward unlocked" popup panel beside your code and
// fills it with the reward image. The webview is locked down
// (enableScripts: false, tight Content-Security-Policy) so the remote image
// link cannot run any code.
function show(ctx: vscode.ExtensionContext, url: string, n: number, preview = false) {
  if (!panel) {
    panel = vscode.window.createWebviewPanel('getDoneReward', 'Reward unlocked', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: false });
    panel.onDidDispose(() => { panel = undefined; }, null, ctx.subscriptions);
  }
  panel.title = preview ? 'Reward preview' : `Reward #${n} unlocked`;
  panel.webview.html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; style-src 'unsafe-inline';">
<style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:var(--vscode-editor-background);color:var(--vscode-foreground);font-family:var(--vscode-font-family)}
img{max-width:92vw;max-height:80vh;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.4)}h1{font-size:20px}</style></head>
<body><h1>${preview ? 'Preview' : 'Goal hit! Reward #' + n}</h1><img src="${esc(url)}" alt="reward"></body></html>`;
  panel.reveal(vscode.ViewColumn.Beside, true);
}

export function deactivate() {}
