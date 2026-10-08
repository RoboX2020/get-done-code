import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
  const extensionTestsPath = path.resolve(__dirname, './suite');
  const workspace = path.resolve(extensionDevelopmentPath, 'test-workspace');
  await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs: [workspace, '--disable-extensions', '--disable-workspace-trust'] });
}
main().catch(e => { console.error(e); process.exit(1); });
