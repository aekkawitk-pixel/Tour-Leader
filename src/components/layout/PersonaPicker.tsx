'use client';

/**
 * เลือกหัวหน้าทัวร์ / เจ้าหน้าที่ส่งกรุ๊ป "คนใดก็ได้" จากทะเบียน เพื่อทดลองใช้งานในนามคนนั้น (Demo)
 * อยู่ในเมนูสลับบทบาทที่ Header · ค้นด้วยชื่อ ชื่อเล่น หรือรหัส (TL-… / SOS-…)
 * ผู้ใช้ที่สร้างขึ้นเป็นผู้ใช้ชั่วคราว (id ขึ้นต้น PERSONA_ID_PREFIX) — ไม่เพิ่มเข้ารายชื่อผู้ใช้ของระบบ
 */

import { useMemo, useState } from 'react';
import { useDemo, PERSONA_ID_PREFIX } from '@/store/DemoStore';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/Primitives';
import { leaderDisplayName } from '@/lib/logic/leaderExpertise';
import { sendOffStaffName } from '@/lib/logic/sendOffStaff';
import { loadSendOffStaff } from '@/services/sendOffStaffStore';
import type { DemoUser } from '@/types';

type Kind = 'leader' | 'sendoff';

interface Option { refId: string; name: string; sub: string; user: DemoUser }

const MAX_SHOWN = 30;

export function PersonaPicker({ onPicked }: { onPicked: () => void }) {
  const { leaders, currentUser, setPersona, setUserById, users } = useDemo();
  const [kind, setKind] = useState<Kind | null>(null);
  const [q, setQ] = useState('');

  const options = useMemo<Option[]>(() => {
    if (kind === 'leader') {
      return leaders
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((l) => {
          const name = `${l.firstName} ${l.lastName}`.trim() || l.id;
          return {
            refId: l.id,
            name: leaderDisplayName(l),
            sub: l.id,
            user: { id: `${PERSONA_ID_PREFIX}TL:${l.id}`, name, role: 'leader', position: `หัวหน้าทัวร์ (${l.id})`, leaderId: l.id, active: true },
          };
        });
    }
    if (kind === 'sendoff') {
      return loadSendOffStaff()
        .filter((s) => s.status !== 'disabled')
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((s) => {
          const name = sendOffStaffName(s);
          return {
            refId: s.id,
            name,
            sub: s.status === 'suspended' ? `${s.id} · ระงับชั่วคราว` : s.id,
            user: { id: `${PERSONA_ID_PREFIX}SOS:${s.id}`, name, role: 'sendoff', position: `เจ้าหน้าที่ส่งกรุ๊ป (${s.id})`, sendOffStaffId: s.id, active: true },
          };
        });
    }
    return [];
  }, [kind, leaders]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? options.filter((o) => `${o.name} ${o.sub}`.toLowerCase().includes(t)) : options;
    return list.slice(0, MAX_SHOWN);
  }, [options, q]);
  const total = q.trim() ? options.filter((o) => `${o.name} ${o.sub}`.toLowerCase().includes(q.trim().toLowerCase())).length : options.length;

  const isCurrent = (o: Option) =>
    (kind === 'leader' && currentUser.role === 'leader' && currentUser.leaderId === o.refId)
    || (kind === 'sendoff' && currentUser.role === 'sendoff' && currentUser.sendOffStaffId === o.refId);

  const pick = (o: Option) => {
    // คนที่มีผู้ใช้ Demo ประจำอยู่แล้ว (เช่น TL-000001 / SOS-001) ใช้ผู้ใช้เดิม — ชื่อ/ตำแหน่งตรงกับที่ตั้งไว้
    const existing = users.find((u) => u.active && (kind === 'leader' ? u.role === 'leader' && u.leaderId === o.refId : u.role === 'sendoff' && u.sendOffStaffId === o.refId));
    if (existing) setUserById(existing.id);
    else setPersona(o.user);
    setKind(null);
    setQ('');
    onPicked();
  };

  const tab = (k: Kind, label: string) => (
    <button
      type="button"
      onClick={() => { setKind((cur) => (cur === k ? null : k)); setQ(''); }}
      aria-expanded={kind === k}
      className={cx(
        'flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1 text-xs font-medium',
        kind === k ? 'zego-selected-border zego-selected-tint zego-text' : 'zego-border-color zego-text-secondary zego-hover-surface',
      )}
    >
      <Icon name="search" className="h-3.5 w-3.5" />{label}
    </button>
  );

  return (
    <div className="zego-divider-top px-4 py-2">
      <p className="zego-text-disabled mb-1.5 text-[11px] font-semibold uppercase tracking-wide">เลือกคนอื่นจากทะเบียน</p>
      <div className="flex gap-1.5">
        {tab('leader', 'หัวหน้าทัวร์')}
        {tab('sendoff', 'เจ้าหน้าที่ส่งกรุ๊ป')}
      </div>

      {kind && (
        <div className="mt-2">
          <input
            type="search"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={kind === 'leader' ? 'ค้นชื่อ ชื่อเล่น หรือรหัส TL-…' : 'ค้นชื่อ ชื่อเล่น หรือรหัส SOS-…'}
            aria-label={kind === 'leader' ? 'ค้นหาหัวหน้าทัวร์' : 'ค้นหาเจ้าหน้าที่ส่งกรุ๊ป'}
            className="zego-input w-full text-sm"
          />
          <ul className="mt-1.5 max-h-56 space-y-0.5 overflow-y-auto" role="listbox">
            {shown.length === 0 ? (
              <li className="px-2 py-2 text-center text-xs zego-text-tertiary">ไม่พบรายชื่อ</li>
            ) : shown.map((o) => {
              const active = isCurrent(o);
              return (
                <li key={o.refId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => pick(o)}
                    className={cx('zego-menu-item w-full justify-between', active && 'zego-menu-item--selected')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{o.name}</span>
                      <span className="zego-text-tertiary block truncate text-xs">{o.sub}</span>
                    </span>
                    {active && <Icon name="check" className="zego-text-info h-4 w-4 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {total > shown.length && (
            <p className="mt-1 text-[11px] zego-text-tertiary">แสดง {shown.length} จาก {total} คน — พิมพ์ค้นหาเพื่อหาคนที่ต้องการ</p>
          )}
        </div>
      )}
    </div>
  );
}
