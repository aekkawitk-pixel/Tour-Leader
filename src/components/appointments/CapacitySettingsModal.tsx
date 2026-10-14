'use client';

/**
 * ตั้งค่าจำนวนเจ้าหน้าที่ต่อคิวเคลียร์เงิน — ค่าปกติ (ทุกวัน) + กำหนดรายวัน (พีค / มีคนลา)
 * ช่องเวลาหนึ่งรับนัดได้เท่าจำนวนคนในคิวนั้น · 0 คน = วันนั้นคิวนี้ไม่รับนัด
 * ลดจำนวนคนแล้วนัดเดิมเกิน → ขึ้นเตือนในเมนูนัดหมาย (เวลาซ้อน) ให้เลื่อนเอง
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { formatDate, toISODate } from '@/lib/format';
import { LANE_LABEL, type ClearLane } from '@/lib/logic/appointmentSlots';
import { loadClearCapacity, saveClearCapacity, type ClearCapacitySettings } from '@/services/clearCapacityStore';

const LANES: ClearLane[] = ['japan', 'other'];
const clamp = (v: string) => Math.max(0, Math.min(9, Math.floor(Number(v) || 0)));

export function CapacitySettingsModal({ onClose }: { onClose: () => void }) {
  const today = toISODate(new Date());
  const [s, setS] = useState<ClearCapacitySettings>(() => {
    const cur = loadClearCapacity();
    // วันที่ผ่านไปแล้วไม่ต้องแสดง/เก็บต่อ
    return { ...cur, byDate: Object.fromEntries(Object.entries(cur.byDate).filter(([d]) => d >= today)) };
  });
  const [newDate, setNewDate] = useState('');
  const dates = Object.keys(s.byDate).sort();

  const setDefault = (lane: ClearLane, v: string) => setS((x) => ({ ...x, default: { ...x.default, [lane]: clamp(v) } }));
  const setDay = (date: string, lane: ClearLane, v: string) =>
    setS((x) => ({ ...x, byDate: { ...x.byDate, [date]: { ...x.byDate[date], [lane]: clamp(v) } } }));
  const removeDay = (date: string) => setS((x) => {
    const byDate = { ...x.byDate };
    delete byDate[date];
    return { ...x, byDate };
  });
  const addDay = () => {
    if (!newDate || s.byDate[newDate]) return;
    setS((x) => ({ ...x, byDate: { ...x.byDate, [newDate]: { ...x.default } } }));
    setNewDate('');
  };

  const num = (value: number, onChange: (v: string) => void, label: string) => (
    <input
      type="number"
      min={0}
      max={9}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-16 rounded-md border zego-border-color px-2 py-1 text-center text-sm tabular-nums"
    />
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="จำนวนเจ้าหน้าที่ต่อคิว"
      description="ช่องเวลาหนึ่งรับนัดได้เท่าจำนวนคนในคิว — 2 คน = ช่อง 09:00 รับได้ 2 กรุ๊ป · 0 คน = วันนั้นคิวนี้ไม่รับนัด"
      footer={(
        <div className="flex w-full justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={() => { saveClearCapacity(s); onClose(); }}>บันทึก</Button>
        </div>
      )}
    >
      <div className="space-y-5 text-sm">
        <section>
          <h3 className="mb-2 font-semibold zego-text">ค่าปกติ (ทุกวัน)</h3>
          <div className="flex flex-wrap gap-4">
            {LANES.map((l) => (
              <label key={l} className="flex items-center gap-2">
                <span className="zego-text-secondary">คิว{LANE_LABEL[l]}</span>
                {num(s.default[l], (v) => setDefault(l, v), `ค่าปกติคิว${LANE_LABEL[l]}`)}
                <span className="zego-text-tertiary">คน</span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-1 font-semibold zego-text">กำหนดรายวัน</h3>
          <p className="mb-2 text-xs zego-text-tertiary">วันที่คนมากกว่าปกติ (พีค) หรือมีคนลา — ทับค่าปกติเฉพาะวันนั้น</p>
          {dates.length === 0 ? (
            <p className="rounded-lg border border-dashed zego-border-color px-3 py-2 text-xs zego-text-tertiary">ยังไม่มีวันที่กำหนดพิเศษ — ใช้ค่าปกติทุกวัน</p>
          ) : (
            <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color">
              {dates.map((d) => (
                <li key={d} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <span className="w-24 font-medium tabular-nums zego-text">{formatDate(d)}</span>
                  {LANES.map((l) => (
                    <label key={l} className="flex items-center gap-1.5">
                      <span className="text-xs zego-text-secondary">{LANE_LABEL[l]}</span>
                      {num(s.byDate[d][l] ?? s.default[l], (v) => setDay(d, l, v), `${formatDate(d)} คิว${LANE_LABEL[l]}`)}
                    </label>
                  ))}
                  <button type="button" onClick={() => removeDay(d)} className="ml-auto text-xs font-medium text-rose-700 hover:underline">ลบ</button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center gap-2">
            <input type="date" min={today} value={newDate} onChange={(e) => setNewDate(e.target.value)} aria-label="วันที่ที่จะกำหนด" className="rounded-md border zego-border-color px-2 py-1 text-sm" />
            <Button variant="secondary" size="sm" disabled={!newDate || !!s.byDate[newDate]} onClick={addDay}>
              <Icon name="plus" className="h-4 w-4" />
              เพิ่มวัน
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
