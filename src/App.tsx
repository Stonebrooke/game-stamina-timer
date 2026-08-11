import { useEffect, useState } from "react";
import OverviewBar from "./components/OverviewBar";
import RecoveryTimeline from "./components/RecoveryTimeline";
import SettingsModal from "./components/SettingsModal";
import TimerForm from "./components/TimerForm";
import TimerGrid from "./components/TimerGrid";
import type { NewTimer, StaminaTimer } from "./lib/types";
import { useTimers } from "./store/useTimers";

export default function App() {
  // 架构审查 ②：用 selector 精确订阅，App 不再订阅 now，
  // 1s tick 不再触发整树 reconcile（仅时间相关叶子组件各自订阅 now）。
  const timers = useTimers(s => s.timers);
  const loading = useTimers(s => s.loading);
  const error = useTimers(s => s.error);
  const load = useTimers(s => s.load);
  const add = useTimers(s => s.add);
  const update = useTimers(s => s.update);
  const remove = useTimers(s => s.remove);
  const anchor = useTimers(s => s.anchor);
  const tick = useTimers(s => s.tick);
  const clearError = useTimers(s => s.clearError);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaminaTimer | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleting, setDeleting] = useState<StaminaTimer | null>(null);

  // 首屏加载
  useEffect(() => {
    void load();
  }, [load]);

  // 1s tick：仅 UI 刷新；通知判定在 Rust 后端线程（P1-1）
  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tick]);

  // 从托盘切回前台时立即刷新 UI（降级方案，避免可见性节流后的空白）
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [tick]);

  const submitForm = async (input: NewTimer, id?: string) => {
    if (id && editing) {
      await update({ ...editing, ...input });
    } else {
      await add(input);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>游戏体力计时器</h1>
        <div className="header-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            + 添加游戏
          </button>
          <button className="btn" onClick={() => setSettingsOpen(true)}>
            设置
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>操作失败：{error}</span>
          <button className="btn" onClick={clearError}>
            知道了
          </button>
        </div>
      )}

      <OverviewBar timers={timers} />

      {!loading && <RecoveryTimeline timers={timers} />}

      <main className="app-main">
        {loading ? (
          <div className="grid">
            {[0, 1, 2].map(i => (
              <div key={i} className="card card-skeleton" />
            ))}
          </div>
        ) : (
          <TimerGrid
            timers={timers}
            onAdd={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            onEdit={t => {
              setEditing(t);
              setFormOpen(true);
            }}
            onDelete={t => setDeleting(t)}
            onAnchor={anchor}
          />
        )}
      </main>

      {formOpen && (
        <TimerForm
          initial={editing}
          onSubmit={submitForm}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onDataChanged={() => void load()} />
      )}

      {deleting && (
        <div className="modal-mask" onClick={() => setDeleting(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h2>删除计时器</h2>
            <p>
              确定删除「{deleting.name}」吗？删除后不可恢复。
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setDeleting(null)}>
                取消
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  void remove(deleting.id).finally(() => setDeleting(null));
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
