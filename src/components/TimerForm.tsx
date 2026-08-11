import { useEffect, useState } from "react";
import { COLOR_POOL, GAME_PRESETS } from "../lib/presets";
import type { NewTimer, StaminaTimer } from "../lib/types";

interface Props {
  /** 传入则为编辑模式，否则为新建 */
  initial?: StaminaTimer | null;
  onSubmit: (input: NewTimer, id?: string) => Promise<void>;
  onClose: () => void;
}

interface FormState {
  name: string;
  minutesPerPoint: string;
  maxStamina: string;
  currentStamina: string;
  notifyOnFull: boolean;
  notifyEveryN: string;
  color: string;
}

/** 新建/编辑计时器弹窗：含游戏预设下拉 */
export default function TimerForm({ initial, onSubmit, onClose }: Props) {
  const editing = Boolean(initial);
  const [form, setForm] = useState<FormState>({
    name: "",
    minutesPerPoint: "6",
    maxStamina: "240",
    currentStamina: "0",
    notifyOnFull: true,
    notifyEveryN: "0",
    color: COLOR_POOL[0]
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name,
        minutesPerPoint: String(initial.recoverMsPerPoint / 60_000),
        maxStamina: String(initial.maxStamina),
        currentStamina: String(initial.currentStamina),
        notifyOnFull: initial.notifyOnFull,
        notifyEveryN: String(initial.notifyEveryN),
        color: initial.color
      });
    }
  }, [initial]);

  const applyPreset = (label: string) => {
    const p = GAME_PRESETS.find(p => p.label === label);
    if (!p) return;
    setForm(f => ({
      ...f,
      name: p.label,
      minutesPerPoint: String(p.minutesPerPoint),
      maxStamina: String(p.maxStamina),
      color: p.color
    }));
  };

  const submit = async () => {
    const minutes = Number(form.minutesPerPoint);
    const max = Number(form.maxStamina);
    const current = Number(form.currentStamina);
    const everyN = Number(form.notifyEveryN);

    if (!form.name.trim() || form.name.trim().length > 50) return setError("名称不能为空且不超过 50 字");
    if (!(minutes > 0)) return setError("每点恢复时间必须大于 0");
    if (!(max >= 1)) return setError("体力上限必须 >= 1");
    if (!(current >= 0 && current <= max)) return setError(`当前体力必须在 0-${max} 之间`);
    if (!(everyN >= 0)) return setError("每 N 点提醒不能为负");

    const input: NewTimer = {
      name: form.name.trim(),
      recoverMsPerPoint: minutes * 60_000,
      maxStamina: max,
      currentStamina: current,
      notifyOnFull: form.notifyOnFull,
      notifyEveryN: everyN,
      color: form.color
    };

    setBusy(true);
    setError(null);
    try {
      await onSubmit(input, initial?.id);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<FormState>) => setForm(f => ({ ...f, ...patch }));

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{editing ? "编辑计时器" : "添加游戏"}</h2>

        <label className="field">
          <span>游戏预设</span>
          <select defaultValue="" onChange={e => applyPreset(e.target.value)}>
            <option value="" disabled>
              选择预设快速填充…
            </option>
            {GAME_PRESETS.map(p => (
              <option key={p.label} value={p.label}>
                {p.label}（{p.resourceName} {p.maxStamina} 上限 / {p.minutesPerPoint}min/点）
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>名称</span>
          <input
            value={form.name}
            maxLength={50}
            placeholder="如：绝区零"
            onChange={e => set({ name: e.target.value })}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>每点恢复（分钟）</span>
            <input
              type="number"
              min={0.1}
              step={0.5}
              value={form.minutesPerPoint}
              onChange={e => set({ minutesPerPoint: e.target.value })}
            />
          </label>
          <label className="field">
            <span>体力上限</span>
            <input
              type="number"
              min={1}
              value={form.maxStamina}
              onChange={e => set({ maxStamina: e.target.value })}
            />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>当前体力</span>
            <input
              type="number"
              min={0}
              value={form.currentStamina}
              onChange={e => set({ currentStamina: e.target.value })}
            />
          </label>
          <label className="field">
            <span>每 N 点提醒（0=关）</span>
            <input
              type="number"
              min={0}
              value={form.notifyEveryN}
              onChange={e => set({ notifyEveryN: e.target.value })}
            />
          </label>
        </div>

        <label className="field field-inline">
          <input
            type="checkbox"
            checked={form.notifyOnFull}
            onChange={e => set({ notifyOnFull: e.target.checked })}
          />
          <span>体力回满时通知</span>
        </label>

        <div className="field">
          <span>卡片配色</span>
          <div className="swatches">
            {COLOR_POOL.map(c => (
              <button
                key={c}
                className={`swatch ${form.color === c ? "swatch-active" : ""}`}
                style={{ background: c }}
                onClick={() => set({ color: c })}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            {editing ? "保存" : "添加"}
          </button>
        </div>
      </div>
    </div>
  );
}
