import { useEffect, useState } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification
} from "@tauri-apps/plugin-notification";
import { api, inTauri } from "../api/timers";

interface Props {
  onClose: () => void;
  /** 导入成功后回调（刷新列表） */
  onDataChanged: () => void;
}

/** 设置弹窗：通知权限 + 测试通知 + 开机自启 + 数据导入/导出 */
export default function SettingsModal({ onClose, onDataChanged }: Props) {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [dataMsg, setDataMsg] = useState<string | null>(null);
  const [dataBusy, setDataBusy] = useState(false);

  useEffect(() => {
    void api()
      .getAutostart()
      .then(setAutostart)
      .catch(() => setAutostart(null));
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

  const testNotify = async () => {
    setTesting(true);
    try {
      sendNotification({ title: "游戏体力计时器", body: "测试通知：通知功能正常。" });
    } finally {
      setTesting(false);
    }
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

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>设置</h2>

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

        <div className="settings-row">
          <span>测试通知</span>
          <button
            className="btn"
            disabled={!inTauri() || !granted || testing}
            onClick={() => void testNotify()}
          >
            发送测试通知
          </button>
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
          <p>· 应用最小化到系统托盘时通知仍然生效；关闭窗口不会退出。</p>
          <p>· 数据保存在本机应用数据目录（timers.json），完全离线可用。</p>
          <p>· 导入按 id 合并：同 id 覆盖，新 id 追加；非法文件整体拒绝。</p>
          <p>· 退出请使用托盘菜单「退出」。</p>
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
