import { useEffect, useState } from "react";
import {
  isPermissionGranted,
  requestPermission
} from "@tauri-apps/plugin-notification";
import { api, inTauri } from "../api/timers";
import type { AppSettings } from "../lib/types";

interface Props {
  onClose: () => void;
  /** 导入成功后回调（刷新列表） */
  onDataChanged: () => void;
}

/** 设置弹窗：通知权限/总开关/测试通知/诊断 + 关闭行为 + 开机自启 + 数据导入/导出 */
export default function SettingsModal({ onClose, onDataChanged }: Props) {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [dataMsg, setDataMsg] = useState<string | null>(null);
  const [dataBusy, setDataBusy] = useState(false);

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [diag, setDiag] = useState<string | null>(null);

  useEffect(() => {
    void api()
      .getAutostart()
      .then(setAutostart)
      .catch(() => setAutostart(null));
    void api()
      .getAppSettings()
      .then(setSettings)
      .catch(() => setSettings(null));
    if (!inTauri()) {
      setGranted(null);
      return;
    }
    void isPermissionGranted()
      .then(setGranted)
      .catch(() => setGranted(null));
  }, []);

  const askPermission = async () => {
    try {
      const r = await requestPermission();
      setGranted(r === "granted");
    } catch {
      setGranted(null);
    }
  };

  const saveSettings = async (next: AppSettings) => {
    setSettings(next);
    try {
      await api().setAppSettings(next);
    } catch (e) {
      setDataMsg(`设置保存失败：${String(e)}`);
    }
  };

  const testNotify = async () => {
    setTesting(true);
    setDiag(null);
    try {
      const r = await api().testNotification();
      setDiag(r);
    } catch (e) {
      setDiag(`测试通知触发失败：${String(e)}`);
    } finally {
      setTesting(false);
    }
  };

  const runDiag = async () => {
    try {
      const r = await api().checkNotificationSupport();
      setDiag(r);
    } catch (e) {
      setDiag(`诊断失败：${String(e)}`);
    }
  };

  const toggleNotifications = () => {
    if (!settings) return;
    void saveSettings({ ...settings, notificationsEnabled: !settings.notificationsEnabled });
  };

  const setBehavior = (b: AppSettings["closeBehavior"]) => {
    if (!settings) return;
    void saveSettings({ ...settings, closeBehavior: b });
  };

  const setConfirmExit = (v: boolean) => {
    if (!settings) return;
    void saveSettings({ ...settings, closeConfirmExit: v });
  };

  const toggleAutostart = async () => {
    const next = !(autostart ?? false);
    try {
      await api().setAutostart(next);
      setAutostart(next);
    } catch (e) {
      setDataMsg(`自启设置失败：${String(e)}`);
    }
  };

  const doExport = async () => {
    setDataBusy(true);
    setDataMsg(null);
    try {
      const path = await api().exportTimers();
      if (path) setDataMsg(`已导出：${path}`);
    } catch (e) {
      setDataMsg(`导出失败：${String(e)}`);
    } finally {
      setDataBusy(false);
    }
  };

  const doImport = async () => {
    setDataBusy(true);
    setDataMsg(null);
    try {
      const count = await api().importTimers();
      if (count !== null) {
        setDataMsg(`已导入 ${count} 个计时器`);
        onDataChanged();
      }
    } catch (e) {
      setDataMsg(`导入失败：${String(e)}`);
    } finally {
      setDataBusy(false);
    }
  };

  const notifWarn = settings?.notificationsEnabled && inTauri() && granted === false;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>设置</h2>

        {/* 通知总开关（项 1） */}
        <div className="settings-row">
          <span>通知总开关</span>
          {settings === null ? (
            <span className="muted">加载中…</span>
          ) : (
            <button
              className={`switch ${settings.notificationsEnabled ? "switch-on" : ""}`}
              role="switch"
              aria-checked={settings.notificationsEnabled}
              onClick={toggleNotifications}
            >
              <span className="switch-knob" />
            </button>
          )}
        </div>

        <div className="settings-row">
          <span>系统通知权限</span>
          {inTauri() ? (
            granted ? (
              <span className="badge-ok">已授权</span>
            ) : (
              <button className="btn btn-primary" onClick={() => void askPermission()}>
                请求授权
              </button>
            )
          ) : (
            <span className="muted">浏览器预览模式（桌面应用中生效）</span>
          )}
        </div>

        {notifWarn && (
          <div className="settings-msg" style={{ color: "var(--danger, #e5484d)" }}>
            通知总开关已开，但系统通知权限未授权——请先在上方「请求授权」，否则不会弹出通知。
          </div>
        )}

        <div className="settings-row">
          <span>测试通知</span>
          <button
            className="btn"
            disabled={!inTauri() || testing}
            onClick={() => void testNotify()}
          >
            发送测试通知
          </button>
        </div>
        <div className="settings-row">
          <span>通知诊断（Windows）</span>
          <button className="btn" disabled={!inTauri()} onClick={() => void runDiag()}>
            运行诊断
          </button>
        </div>

        {diag && <div className="settings-msg">{diag}</div>}

        {/* 关闭窗口行为（项 5） */}
        <div
          style={{
            marginTop: 12,
            borderTop: "1px solid var(--border)",
            paddingTop: 12
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>关闭窗口行为</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <input
              type="radio"
              name="closeBehavior"
              checked={settings?.closeBehavior !== "exit"}
              onChange={() => setBehavior("tray")}
            />
            <span>最小化到托盘（不退出软件，通知继续）</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <input
              type="radio"
              name="closeBehavior"
              checked={settings?.closeBehavior === "exit"}
              onChange={() => setBehavior("exit")}
            />
            <span>退出程序</span>
          </label>
          {settings?.closeBehavior === "exit" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 24 }}>
              <input
                type="checkbox"
                checked={settings.closeConfirmExit}
                onChange={e => setConfirmExit(e.target.checked)}
              />
              <span>退出前不再确认（勾选后关闭直接退出，不弹确认框）</span>
            </label>
          )}
        </div>

        <div className="settings-row">
          <span>开机自启（托盘常驻，保证通知不遗漏）</span>
          {autostart === null ? (
            <span className="muted">不可用</span>
          ) : (
            <button
              className={`switch ${autostart ? "switch-on" : ""}`}
              role="switch"
              aria-checked={autostart}
              onClick={() => void toggleAutostart()}
            >
              <span className="switch-knob" />
            </button>
          )}
        </div>

        <div className="settings-row">
          <span>数据备份 / 恢复</span>
          <span className="settings-actions">
            <button className="btn" disabled={dataBusy} onClick={() => void doExport()}>
              导出 JSON
            </button>
            <button className="btn" disabled={dataBusy} onClick={() => void doImport()}>
              导入 JSON
            </button>
          </span>
        </div>

        {dataMsg && <div className="settings-msg">{dataMsg}</div>}

        <div className="settings-note">
          <p>· 关闭窗口默认最小化到托盘（不退出）；选择「退出程序」且未勾选「不再确认」时，关闭会弹一次确认。</p>
          <p>· 安装版（开始菜单启动）通知才可弹出：Windows 设置 &gt; 系统 &gt; 通知 &gt; 游戏体力恢复计时器 需开启，并关闭专注助手拦截。</p>
          <p>· 数据保存在本机应用数据目录（timers.json / settings.json），完全离线可用。</p>
          <p>· 导入按 id 合并：同 id 覆盖，新 id 追加；非法文件整体拒绝。</p>
          <p>· 退出请使用托盘菜单「退出」，或关闭窗口按所选行为执行。</p>
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
