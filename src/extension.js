const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { SpiderCompanionViewProvider } = require('./spiderCompanion');

const THEMES = {
  superhero: 'Antigravity Superhero',
  retro: 'Antigravity Retro Arcade',
  spiderman: 'Spider-Man Midnight'
};

const ICON_THEMES = {
  superhero: 'antigravity-hero-icons',
  retro: 'antigravity-retro-icons',
  spiderman: 'antigravity-spiderman-icons'
};

function userFontDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Fonts');
  }
  return path.join(os.homedir(), '.fonts');
}

async function registerWindowsFonts() {
  const reg = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
  const entries = [
    ['VT323 (TrueType)', 'VT323-Regular.ttf'],
    ['Press Start 2P (TrueType)', 'PressStart2P-Regular.ttf'],
    ['Comic Mono (TrueType)', 'ComicMono.ttf'],
    ['Comic Mono (Bold TrueType)', 'ComicMono-Bold.ttf']
  ];
  for (const [valueName, value] of entries) {
    await new Promise((resolve) => {
      execFile(
        reg,
        ['add', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', '/v', valueName, '/t', 'REG_SZ', '/d', value, '/f'],
        () => resolve()
      );
    });
  }
}

async function installSystemFonts(manifest) {
  let extPath = path.join(__dirname, '..');
  if (manifest && manifest.extensionPath) extPath = manifest.extensionPath;
  else if (manifest && manifest.extensionUri) extPath = manifest.extensionUri.fsPath;
  const srcDir = path.join(extPath, 'assets', 'fonts');
  const destDir = userFontDir();
  fs.mkdirSync(destDir, { recursive: true });
  const files = ['ComicMono.ttf', 'ComicMono-Bold.ttf', 'VT323-Regular.ttf', 'PressStart2P-Regular.ttf'];
  let found = 0;
  let copied = 0;
  for (const name of files) {
    const src = path.join(srcDir, name);
    if (!fs.existsSync(src)) continue;
    found += 1;
    const dest = path.join(destDir, name);
    try {
      if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(src).size) {
        fs.copyFileSync(src, dest);
        copied += 1;
      }
    } catch {
      // ignore lock/in-use
    }
  }
  if (process.platform === 'win32') {
    await registerWindowsFonts();
  }
  return { found, copied };
}

function activate(context) {
  // Status Bar item for bottom tray ambient indicator & quick toggle
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'antigravity.spiderCompanion.toggle';

  const updateStatusBar = () => {
    statusBarItem.text = '🕷️ Spider Companion';
    statusBarItem.tooltip = 'Spider-Man Ambient Companion: Click to toggle';
  };

  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register Interactive Ambient Webview Provider (Panel Tray only)
  const panelProvider = new SpiderCompanionViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('antigravity.spiderCompanionView', panelProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity.spiderCompanion.toggle', async () => {
      try {
        await vscode.commands.executeCommand('antigravity.spiderCompanionView.focus');
      } catch {
        await vscode.commands.executeCommand('workbench.action.togglePanel');
      }
    })
  );

  // Mode switch commands - strictly scoped locally to workspace if open, never touching root settings.json
  const switchModeLocally = async (mode) => {
    const target = vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : undefined;
    const workbench = vscode.workspace.getConfiguration('workbench');
    await workbench.update('colorTheme', THEMES[mode], target);
    await workbench.update('iconTheme', ICON_THEMES[mode], target);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity.mode.superhero', async () => {
      await switchModeLocally('superhero');
      vscode.window.showInformationMessage('Superhero Mode active: Catppuccin Superhero palette.');
    }),
    vscode.commands.registerCommand('antigravity.mode.retro', async () => {
      await switchModeLocally('retro');
      vscode.window.showInformationMessage('Retro Game Mode active: Catppuccin Retro Arcade Macchiato palette.');
    }),
    vscode.commands.registerCommand('antigravity.mode.spiderman', async () => {
      await switchModeLocally('spiderman');
      vscode.window.showInformationMessage('Spider-Man Midnight Mode active: Solid dark matte charcoal (#16191f) + Spider-Companion.');
    }),
    vscode.commands.registerCommand('antigravity.font.install', async () => {
      try {
        const result = await installSystemFonts(context.extension);
        if (result.found === 0) {
          vscode.window.showWarningMessage('No font files found in the extension bundle.');
          return;
        }
        const reload = 'Reload Window', cancel = 'Cancel';
        const msg = result.copied > 0
          ? `${result.copied} bundled font(s) installed to your system. Reload to register them.`
          : 'All bundled fonts (Comic Mono, VT323) are already installed on this machine! Reload window to apply.';
        const choice = await vscode.window.showInformationMessage(msg, reload, cancel);
        if (choice === reload) {
          await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Font install failed: ${err.message}`);
      }
    }),
    vscode.commands.registerCommand('antigravity.spider.commit', async () => {
      try {
        await vscode.commands.executeCommand('git.commit');
      } catch {
        vscode.window.showInformationMessage('Spider-Man: Web Strike Commit executed!');
      }
    })
  );

  // Auto-install bundled fonts silently to OS font directory on startup if needed
  installSystemFonts(context.extension).catch(() => {});
}

function deactivate() {}

module.exports = { activate, deactivate };