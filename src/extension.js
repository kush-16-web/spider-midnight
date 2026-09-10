const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { SpiderCompanionViewProvider, getHeaderTitleForHour, getHeaderTitleForPhase } = require('./spiderCompanion');

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

const FONT_PRESETS = {
  superhero: {
    family: "'Comic Mono', 'Courier New', 'Courier', monospace",
    weight: 'bold',
    size: 14,
    ligatures: false,
    lineHeight: 24
  },
  retro: {
    family: "'VT323', 'Press Start 2P', 'Courier New', monospace",
    weight: 'normal',
    size: 18,
    ligatures: false,
    lineHeight: 28
  },
  spiderman: {
    family: "'Comic Mono', monospace",
    weight: 'normal',
    size: 14,
    ligatures: false,
    lineHeight: 24
  }
};

const SPIDERMAN_SOLID_COLORS = {
  'editor.background': '#16191f',
  'sideBar.background': '#121418',
  'sideBarSectionHeader.background': '#0e1014',
  'sideBarSectionHeader.foreground': '#abb2bf',
  'activityBar.background': '#0e1014',
  'activityBarBadge.background': '#61afef',
  'activityBarBadge.foreground': '#0e1014',
  'badge.background': '#61afef',
  'badge.foreground': '#0e1014',
  'errorForeground': '#e05a5a',
  'titleBar.activeBackground': '#0e1014',
  'titleBar.inactiveBackground': '#0b0c10',
  'statusBar.background': '#0e1014',
  'panel.background': '#16191f',
  'panelTitle.activeForeground': '#ffffff',
  'panelTitle.activeBorder': '#e05a5a',
  'panelTitle.inactiveForeground': '#abb2bf',
  'panelSectionHeader.foreground': '#abb2bf',
  'terminal.background': '#16191f',
  'tab.activeBackground': '#16191f',
  'tab.activeForeground': '#ffffff',
  'tab.inactiveBackground': '#121418',
  'tab.inactiveForeground': '#abb2bf',
  'editorGroupHeader.tabsBackground': '#0e1014'
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

async function cleanAndApplyColorCustomizations(mode) {
  const workbench = vscode.workspace.getConfiguration('workbench');
  const existing = workbench.get('colorCustomizations') || {};
  const cleaned = {};

  // Clean any legacy broken rgba(...) or transparent values
  for (const [key, val] of Object.entries(existing)) {
    if (typeof val === 'string') {
      const lower = val.toLowerCase().trim();
      if (lower.startsWith('rgba(') || lower === '#ff0000' || lower === '#f00' || lower === 'red') {
        continue;
      }
    }
    cleaned[key] = val;
  }

  if (mode === 'spiderman') {
    Object.assign(cleaned, SPIDERMAN_SOLID_COLORS);
  } else {
    for (const key of Object.keys(SPIDERMAN_SOLID_COLORS)) {
      delete cleaned[key];
    }
  }

  await workbench.update('colorCustomizations', Object.keys(cleaned).length > 0 ? cleaned : undefined, true);
}

async function applyPreset(mode) {
  const workbench = vscode.workspace.getConfiguration('workbench');
  const editor = vscode.workspace.getConfiguration('editor');
  const ext = vscode.workspace.getConfiguration('antigravity');

  await workbench.update('colorTheme', THEMES[mode], true);
  await workbench.update('iconTheme', ICON_THEMES[mode], true);

  const preset = FONT_PRESETS[mode];
  await editor.update('fontFamily', preset.family, true);
  await editor.update('fontWeight', preset.weight, true);
  await editor.update('fontSize', preset.size, true);
  await editor.update('fontLigatures', preset.ligatures, true);
  await editor.update('lineHeight', preset.lineHeight, true);
  await ext.update('mode', mode, true);

  await cleanAndApplyColorCustomizations(mode);
}

function activate(context) {
  // Status Bar item for bottom tray ambient indicator & quick toggle
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'antigravity.spiderCompanion.toggle';

  const updateStatusBar = (title) => {
    const currentTitle = title || getHeaderTitleForHour(new Date().getHours());
    let icon = '🌙';
    if (currentTitle.includes('Morning')) icon = '🌅';
    else if (currentTitle.includes('Afternoon')) icon = '☀️';
    else if (currentTitle.includes('Evening')) icon = '🌇';
    statusBarItem.text = `${icon} ${currentTitle}`;
    statusBarItem.tooltip = `${currentTitle}: Click to focus ambient companion tray`;
  };

  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Status bar update interval every minute to sync with hour changes
  const statusTimer = setInterval(() => updateStatusBar(), 60000);
  context.subscriptions.push({ dispose: () => clearInterval(statusTimer) });

  // Register Interactive Ambient Webview Provider (Panel Tray only)
  const panelProvider = new SpiderCompanionViewProvider(context.extensionUri, (newTitle) => {
    updateStatusBar(newTitle);
  });

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

  const applyCurrentMode = async () => {
    const cfg = vscode.workspace.getConfiguration('antigravity');
    const raw = cfg.get('mode', 'spiderman');
    const mode = ['superhero', 'retro', 'spiderman'].includes(raw) ? raw : 'spiderman';
    await applyPreset(mode);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity.mode.superhero', async () => {
      await applyPreset('superhero');
      vscode.window.showInformationMessage('Superhero Mode active: Catppuccin Superhero palette + bold Comic Mono font.');
    }),
    vscode.commands.registerCommand('antigravity.mode.retro', async () => {
      await applyPreset('retro');
      vscode.window.showInformationMessage('Retro Game Mode active: Catppuccin Retro Arcade Macchiato palette + 8-bit pixel font.');
    }),
    vscode.commands.registerCommand('antigravity.mode.spiderman', async () => {
      await applyPreset('spiderman');
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
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('antigravity.mode')) {
        applyCurrentMode();
      }
    })
  );

  // Auto-install bundled fonts silently on startup
  installSystemFonts(context.extension).catch(() => {});

  applyCurrentMode();
}

function deactivate() {}

module.exports = { activate, deactivate };