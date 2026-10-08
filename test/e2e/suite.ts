import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function run(): Promise<void> {
  const ext = vscode.extensions.getExtension('robox2020.get-done-code')!;
  assert.ok(ext, 'extension found');
  const api: any = await ext.activate();
  assert.ok(ext.isActive, 'extension active');

  const cmds = await vscode.commands.getCommands(true);
  for (const c of ['getDone.showProgress', 'getDone.addImage', 'getDone.previewReward', 'getDone.checkGithub', 'getDone.reset']) assert.ok(cmds.includes(c), `command ${c} registered`);

  const cfg = vscode.workspace.getConfiguration('getDone');
  await cfg.update('criteria', [{ type: 'lines', every: 5 }, { type: 'saves', every: 2 }], vscode.ConfigurationTarget.Global);
  await cfg.update('rewardImages', ['https://example.com/a.png', 'https://example.com/b.png'], vscode.ConfigurationTarget.Global);
  await vscode.commands.executeCommand('getDone.reset');
  assert.strictEqual(api.getState().rewardsEarned, 0);

  const file = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, 'scratch.txt');
  fs.writeFileSync(file, '');
  const doc = await vscode.workspace.openTextDocument(file);
  const ed = await vscode.window.showTextDocument(doc);

  // 3 new lines: no reward yet
  await ed.edit(b => b.insert(new vscode.Position(0, 0), 'a\nb\nc\n'));
  await sleep(300);
  assert.strictEqual(api.getState().lines, 3, 'lines counted');
  assert.strictEqual(api.getState().rewardsEarned, 0);
  assert.ok(!api.panelOpen());

  // 3 more: crosses 5 -> reward 1, first image, panel opens
  await ed.edit(b => b.insert(new vscode.Position(0, 0), 'd\ne\nf\n'));
  await sleep(500);
  assert.strictEqual(api.getState().rewardsEarned, 1, 'first reward');
  assert.strictEqual(api.getState().lines, 1, 'remainder carried');
  assert.strictEqual(api.lastRewardUrl, 'https://example.com/a.png');
  assert.ok(api.panelOpen(), 'reward panel opened');

  // saves goal: 2 saves -> reward 2 with second image
  await doc.save(); await ed.edit(b => b.insert(new vscode.Position(0, 0), 'x')); await doc.save();
  await sleep(500);
  assert.strictEqual(api.getState().rewardsEarned, 2, 'save reward');
  assert.strictEqual(api.lastRewardUrl, 'https://example.com/b.png');

  // undo must not count
  const before = api.getState().lines;
  await vscode.commands.executeCommand('undo');
  await sleep(300);
  assert.strictEqual(api.getState().lines, before, 'undo ignored');

  // preview and progress commands run without throwing
  await vscode.commands.executeCommand('getDone.previewReward');
  await Promise.race([vscode.commands.executeCommand('getDone.showProgress'), sleep(500)]); // info toast never resolves unless dismissed

  // github goal without sign-in must not throw or reward
  await cfg.update('criteria', [{ type: 'github' }], vscode.ConfigurationTarget.Global);
  await sleep(300);
  await vscode.commands.executeCommand('getDone.reset');
  assert.strictEqual(api.getState().rewardsEarned, 0);

  fs.unlinkSync(file);
  await cfg.update('criteria', undefined, vscode.ConfigurationTarget.Global);
  await cfg.update('rewardImages', undefined, vscode.ConfigurationTarget.Global);
  console.log('E2E PASS');
}
