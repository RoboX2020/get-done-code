import * as vscode from 'vscode';
import { Criterion, State, emptyState, parseCriteria, linesAdded, addLines, addSave, addActive, applyGithub, nextImage, progressSummary, localDay, isHttpsImage } from './core';
import { contributionsToday } from './github';

const KEY = 'getDone.state';
let panel: vscode.WebviewPanel | undefined;

export function activate(ctx: vscode.ExtensionContext) {
  const api = { getState: () => state, panelOpen: () => !!panel, lastRewardUrl: '' };
  const cfg = () => vscode.workspace.getConfiguration('getDone');
  const criteria = (): Criterion[] => parseCriteria(cfg().get('criteria'));
  const images = (): string[] => cfg().get<string[]>('rewardImages') ?? [];
  let state: State = { ...emptyState(), ...(ctx.globalState.get<State>(KEY) ?? {}) };
  const save = () => ctx.globalState.update(KEY, state);

  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  bar.command = 'getDone.showProgress';
  const refresh = () => { bar.text = `$(gift) ${progressSummary(state, criteria())}`; bar.tooltip = 'Get Done: click for progress'; bar.show(); };
  refresh();
  ctx.subscriptions.push(bar);

  const reward = (count: number) => {
    for (let i = 0; i < count; i++) {
      const url = nextImage(state, images());
      if (!url) {
        vscode.window.showInformationMessage('Goal hit! Add a reward image link to see your reward.', 'Add image').then(a => a && vscode.commands.executeCommand('getDone.addImage'));
        break;
      }
      api.lastRewardUrl = url;
      show(ctx, url, state.rewardsEarned);
    }
    save(); refresh();
  };

  // Lines written
  ctx.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
    if (e.document.uri.scheme !== 'file' || e.reason !== undefined) return; // skip undo/redo
    let n = 0;
    for (const c of e.contentChanges) n += linesAdded(c.text, c.range.end.line - c.range.start.line);
    if (n > 0) reward(addLines(state, criteria(), n)); else refresh();
    markActive();
  }));
  ctx.subscriptions.push(vscode.workspace.onDidSaveTextDocument(d => { if (d.uri.scheme === 'file') reward(addSave(state, criteria())); }));

  // Active typing minutes (counts a 1-minute window after each edit, at most once per window)
  let lastActive = 0;
  const markActive = () => {
    const now = Date.now();
    if (lastActive && now - lastActive < 60000) { const got = addActive(state, criteria(), now - lastActive); lastActive = now; if (got) reward(got); }
    else lastActive = now;
  };

  // GitHub mode
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
  const schedule = () => {
    if (timer) clearInterval(timer);
    const mins = Math.max(5, cfg().get<number>('githubPollMinutes') ?? 15);
    if (criteria().some(c => c.type === 'github')) { checkGithub(false); timer = setInterval(() => checkGithub(false), mins * 60000); }
  };
  schedule();
  ctx.subscriptions.push({ dispose: () => timer && clearInterval(timer) });
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('getDone')) { schedule(); refresh(); } }));

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
  return api;
}

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

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
