/**
 * Application Menu Configuration
 * Creates the native application menu for macOS/Windows/Linux
 */
import { Menu, shell, BrowserWindow } from 'electron';

/**
 * Create application menu
 */
export function createMenu(): void {
  const isMac = process.platform === 'darwin';
  
  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: '劳有钳',
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: '偏好设置...',
                accelerator: 'Cmd+,',
                click: () => {
                  const win = BrowserWindow.getFocusedWindow();
                  win?.webContents.send('navigate', '/settings');
                },
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    
    // File menu
    {
      label: '文件',
      submenu: [
        {
          label: '新建对话',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('navigate', '/chat');
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    
    // Edit menu
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' as const },
              { role: 'delete' as const },
              { role: 'selectAll' as const },
            ]
          : [
              { role: 'delete' as const },
              { type: 'separator' as const },
              { role: 'selectAll' as const },
            ]),
      ],
    },
    
    // View menu
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    
    // Navigate menu
    {
      label: '导航',
      submenu: [
        {
          label: '仪表盘',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('navigate', '/');
          },
        },
        {
          label: '聊天',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('navigate', '/chat');
          },
        },
        {
          label: '频道',
          accelerator: 'CmdOrCtrl+3',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('navigate', '/channels');
          },
        },
        {
          label: '技能',
          accelerator: 'CmdOrCtrl+4',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('navigate', '/skills');
          },
        },
        {
          label: '定时任务',
          accelerator: 'CmdOrCtrl+5',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('navigate', '/cron');
          },
        },
        {
          label: '设置',
          accelerator: isMac ? 'Cmd+,' : 'Ctrl+,',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('navigate', '/settings');
          },
        },
      ],
    },
    
    // Window menu
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },
    
    // Help menu
    {
      role: 'help',
      submenu: [
        {
          label: '使用文档',
          click: async () => {
            await shell.openExternal('https://claw-x.com');
          },
        },
        {
          label: '反馈问题',
          click: async () => {
            await shell.openExternal('https://github.com/ValueCell-ai/ClawX/issues');
          },
        },
        { type: 'separator' },
        {
          label: 'OpenClaw 文档',
          click: async () => {
            await shell.openExternal('https://docs.openclaw.ai');
          },
        },
      ],
    },
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
