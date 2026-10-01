'use client';

/**
 * เมนู "เจ้าหน้าที่ส่งกรุ๊ป" — ทะเบียนเจ้าหน้าที่ + ตรวจว่าใครไปส่งเที่ยวบินไหนได้
 *
 * กติกาเวลาอยู่ใน lib/logic/sendOffStaff.ts ทั้งหมด หน้านี้แค่แสดงผล
 * จึงเปลี่ยนเกณฑ์ (เช่นชั่วโมงที่ต้องไปก่อน) ได้ที่จุดเดียวโดยไม่ต้องแก้หน้าจอ
 *
 * คลิกชื่อ → เปิดหน้าโปรไฟล์เต็มหน้าจอ (/send-off-staff/[id]) ซึ่งมีข้อมูลครบ 5 ด้าน
 * (ข้อมูลส่วนตัว/เอกสารประจำตัว/เอกสารการเงิน/ตารางงาน/สถานะ-การลา) — หน้านี้แค่เป็นทะเบียนรายชื่อ
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { Button, Callout, Card, cx, EmptyState, PageHeader, Pill, StatusBadge } from '@/components/ui/Primitives';
import { SearchBox } from '@/components/ui/FormField';
import { SegmentedControl, Tabs } from '@/components/ui/Tabs';
import { SendOffRulesForm } from '@/components/staff/SendOffRulesForm';
import { EMPTY_SEND_OFF_STAFF, SendOffStaffFormDrawer } from '@/components/staff/SendOffStaffFormDrawer';
import { loadSendOffRules } from '@/services/sendOffRulesStore';
import { DEFAULT_SEND_OFF_RULES, formatHours, type SendOffRules } from '@/lib/logic/sendOffRules';
import { formatThaiId } from '@/lib/format';
import { can } from '@/lib/permissions';
import { StorageWriteError } from '@/services/browserStorage';
import {
  canSendOffByStatus,
  SEND_OFF_STAFF_STATUS, SEND_OFF_STAFF_TYPE, SEND_OFF_STAFF_TYPE_ORDER,
  sendOffStaffName, type SendOffStaff, type SendOffStaffType,
} from '@/lib/logic/sendOffStaff';
import { loadSendOffStaff, nextSendOffStaffId, upsertSendOffStaff } from '@/services/sendOffStaffStore';

export function SendOffStaffView() {
  const router = useRouter();
  const { currentUser } = useDemo();
  const canManage = can(currentUser.role, 'leader.edit');
  /** แท็บ — รายชื่อ กับ เงื่อนไขการจัด อยู่เมนูเดียวกัน เพราะเงื่อนไขใช้กับคนกลุ่มนี้เท่านั้น */
  const [tab, setTab] = useState<'list' | 'rules'>('list');
  /** เงื่อนไขที่ตั้งไว้ — ใช้แสดงตัวเลขในคำอธิบายให้ตรงกับที่ระบบใช้จริง */
  const [rules, setRules] = useState<SendOffRules>(DEFAULT_SEND_OFF_RULES);

  const [staff, setStaff] = useState<SendOffStaff[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | SendOffStaffType>('all');
  const [editing, setEditing] = useState<SendOffStaff | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* อ่าน localStorage ได้เฉพาะฝั่ง client → โหลดใน effect เพื่อไม่ให้ HTML ฝั่ง server ต่างกัน */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStaff(loadSendOffStaff());
    setRules(loadSendOffRules());
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (typeFilter !== 'all' && s.staffType !== typeFilter) return false;
      if (!q) return true;
      return [sendOffStaffName(s), s.idCard.idNumber, s.phone, s.id].join(' ').toLowerCase().includes(q);
    });
  }, [staff, search, typeFilter]);

  /* นับเฉพาะคนที่เลือกไปส่งกรุ๊ปได้จริง — คนที่ถูกระงับหรือปิดไม่ควรถูกนับรวมจนดูเหมือนมีคนพอ */
  const counts = useMemo(() => ({
    permanent: staff.filter((s) => canSendOffByStatus(s.status) && s.staffType === 'permanent').length,
    employee: staff.filter((s) => canSendOffByStatus(s.status) && s.staffType === 'employee').length,
  }), [staff]);

  const save = (next: SendOffStaff) => {
    try {
      setStaff(upsertSendOffStaff(next));
      setEditing(null);
      setError(null);
    } catch (e) {
      setError(e instanceof StorageWriteError ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="เจ้าหน้าที่ส่งกรุ๊ป"
        description={`ทะเบียนเจ้าหน้าที่และเวลาที่ไปส่งได้ · ต้องถึงสนามบินก่อนเครื่องออก ${formatHours(rules.leadHours)}`}
        actions={canManage && tab === 'list' && (
          <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing(EMPTY_SEND_OFF_STAFF(nextSendOffStaffId(staff)))}>
            เพิ่มเจ้าหน้าที่
          </Button>
        )}
      />

      <Tabs
        items={[
          { key: 'list', label: 'รายชื่อ', badge: staff.length },
          { key: 'rules', label: 'เงื่อนไขการจัด' },
        ]}
        value={tab}
        onChange={(k) => setTab(k as 'list' | 'rules')}
      />

      {error && <Callout tone="red" title="ทำรายการไม่สำเร็จ"><p className="text-sm">{error}</p></Callout>}

      {tab === 'rules' && <SendOffRulesForm />}

      {/* อธิบายกติกาให้ชัดตั้งแต่แรก — ตัวเลขทุกตัวอ่านจากค่าที่ตั้งไว้ ไม่พิมพ์ค้างไว้ */}
      {tab === 'list' && (
      <Callout tone="blue" title="เกณฑ์เวลาไปส่งกรุ๊ป">
        <ul className="mt-1 space-y-0.5 text-sm">
          <li>เวลาที่ต้องถึงสนามบิน = เวลาเครื่องออกจากไทย − {formatHours(rules.leadHours)}</li>
          <li>
            <strong>{SEND_OFF_STAFF_TYPE.permanent.label}</strong> — {SEND_OFF_STAFF_TYPE.permanent.note}
          </li>
          <li>
            <strong>{SEND_OFF_STAFF_TYPE.employee.label}</strong> — {SEND_OFF_STAFF_TYPE.employee.note}
          </li>
          <li>
            สนามบินเดียวกันต้องห่างกันเกิน {formatHours(rules.sameAirportGapHours)} (นับเวลาเช็คอิน) ·
            คนละสนามบินต้องห่างกันเกิน {formatHours(rules.crossAirportGapHours)} (นับเวลาเครื่องออก)
          </li>
          <li>
            <strong>วันหยุด</strong> (เสาร์-อาทิตย์ และวันหยุดที่ตั้งไว้ในเมนูวันหยุด) — ประเภทพนักงานไม่ติดงานประจำ จัดได้ทุกช่วงเวลาเท่าประเภทประจำ
          </li>
          <li className="zego-text-secondary">
            เกณฑ์เวลางานเช็คทั้งช่วงที่ต้องอยู่กับกรุ๊ป — ตั้งแต่ <strong>เวลานัด</strong> (ที่ต้องถึงสนามบิน) จนถึง <strong>เวลาบิน</strong> (เครื่องออก) — ทับซ้อนกับเวลางานแม้บางส่วนก็ติด · ตัวอย่าง: วันทำงาน เครื่องออก 19:00 → ต้องถึง 16:00 ซึ่งช่วง 16:00–19:00 ทับซ้อนกับเวลางาน {rules.employeeWorkStart}–{rules.employeeWorkEnd} ประเภทพนักงานจึงไปไม่ได้ ·
            ถ้าวันนั้นเป็นวันหยุด จัดได้ตามปกติ
          </li>
        </ul>
      </Callout>
      )}

      {tab === 'list' && (
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <div className="min-w-[12rem] flex-1">
            <SearchBox value={search} onChange={setSearch} label="ค้นหาเจ้าหน้าที่" placeholder="ค้นหาชื่อ เลขบัตร หรือเบอร์โทร" />
          </div>
          <SegmentedControl
            label="ประเภทเจ้าหน้าที่"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: 'all', label: `ทั้งหมด (${counts.permanent + counts.employee})` },
              ...SEND_OFF_STAFF_TYPE_ORDER.map((t) => ({ value: t, label: `${SEND_OFF_STAFF_TYPE[t].label} (${counts[t]})` })),
            ]}
          />
        </div>

        {shown.length === 0 ? (
          <EmptyState icon="users" title="ไม่พบเจ้าหน้าที่ตามเงื่อนไข" description="ลองแก้คำค้นหรือเปลี่ยนประเภทที่เลือก" />
        ) : (
          <ul className="zego-divider-top divide-y divide-[var(--zego-border)]">
            {shown.map((s) => (
              <li key={s.id} className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5', !canSendOffByStatus(s.status) && 'zego-surface-soft-bg')}>
                {/* กดที่ชื่อเพื่อเปิดหน้าโปรไฟล์เต็ม (ข้อมูลส่วนตัว/เอกสารประจำตัว/การเงิน/ตารางงาน/สถานะ-การลา) */}
                <button
                  type="button"
                  onClick={() => router.push(`/send-off-staff/${s.id}`)}
                  aria-label={`ดูโปรไฟล์ของ ${sendOffStaffName(s)}`}
                  className="zego-hover-surface min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={cx('truncate text-sm font-medium', canSendOffByStatus(s.status) ? 'zego-text' : 'zego-text-tertiary')}>
                      {sendOffStaffName(s)}
                    </span>
                    <Pill tone={SEND_OFF_STAFF_TYPE[s.staffType].tone}>{SEND_OFF_STAFF_TYPE[s.staffType].label}</Pill>
                    <StatusBadge meta={SEND_OFF_STAFF_STATUS[s.status]} size="sm" />
                  </span>
                  <span className="zego-text-tertiary mt-0.5 flex flex-wrap gap-x-3 text-xs">
                    <span className="font-mono">{s.id}</span>
                    <span className="font-mono">{formatThaiId(s.idCard.idNumber) || 'ยังไม่ระบุเลขบัตร'}</span>
                    {s.phone && <span>{s.phone}</span>}
                    {s.note && <span className="truncate">{s.note}</span>}
                  </span>
                </button>
                {canManage && (
                  <span className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>แก้ไข</Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      )}

      {editing && <SendOffStaffFormDrawer key={editing.id} initial={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}
