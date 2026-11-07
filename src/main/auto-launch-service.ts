import { app } from "electron";

export class AutoLaunchService {
  isSupported(): boolean {
    return process.platform === "win32" && app.isPackaged;
  }

  isEnabled(): boolean {
    if (!this.isSupported()) return false;
    return app.getLoginItemSettings().openAtLogin;
  }

  setEnabled(enabled: boolean) {
    if (!this.isSupported()) {
      throw new Error("开发版不写入 Windows 开机自启；请在安装版中使用");
    }
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
    });
  }
}
