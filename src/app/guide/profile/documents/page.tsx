'use client';

/**
 * เอกสารประจำตัว — /guide/profile/documents — หนังสือเดินทาง/วีซ่า
 * (บัตรหัวหน้าทัวร์/บัตรประชาชน ย้ายไปเป็นตัวเลือกชื่อเอกสารในแท็บ "เอกสารอื่น ๆ" แล้ว)
 *
 * แก้ไขได้เองแล้ว — ใช้ component เดียวกับฝั่งผู้จัดตรง ๆ (LeaderPassportTab, LeaderDocumentsCard)
 * ทุกตัวดึงข้อมูล/สิทธิ์เองผ่าน useDemo() + can() ไม่ต้องส่ง prop เพิ่ม แค่ leader ก็พอ
 * (โครงเดียวกับแท็บ "เอกสารประจำตัว" ในหน้าผู้จัด src/app/leaders/[id]/page.tsx)
 *
 * ⚠️ ก่อนหน้านี้ role 'leader' ไม่มีสิทธิ์ passport.* เลย (ดู src/lib/permissions.ts) จึงต้อง
 * เพิ่มให้ก่อนหัวข้อนี้จะแก้ไขได้จริง — ให้เท่ากับ coordinator ยกเว้น "ลบถาวร" (passport.delete)
 * ที่ยังสงวนไว้ให้ผู้จัดเท่านั้น เพราะลบแล้วประวัติหายและย้อนกลับไม่ได้
 * ปลอดภัยเพราะ /leaders/[id] (หน้าที่ component พวกนี้เคยใช้ดูของ "คนอื่น") ถูกกันด้วย
 * canViewPath ที่ AppShell อยู่แล้ว — role leader เข้าหน้านั้นไม่ได้เลยไม่ว่ากรณีใด
 *
 * ธีม v3: ด้านบนเป็นภาพรวมสถานะเอกสารทั้งหมด (กล่องเตือนทอง · segmented ทั้งหมด/ต้องตรวจ/ใช้ได้ · แถวพร้อมป้ายสี)
 * "ต้องตรวจ" ใช้เกณฑ์เดียวกับกระดิ่งเอกสารและหน้าหลัก (listDocumentExpiryAlerts) ตัวเลขจึงตรงกันทุกจุด
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { useLeaderDocumentsView } from '@/lib/useLeaderDocuments';
import { listDocumentExpiryAlerts, type DocumentExpiryAlert } from '@/lib/logic/documentExpiryAlerts';
import { formatDate } from '@/lib/format';
import { LeaderPassportTab } from '@/components/leaders/LeaderPassportTab';
import {
  IDENTITY_DOC_KINDS,
  LeaderDocumentsCard,
} from '@/components/leaders/documents/LeaderDocumentsCard';
import { Card, EmptyState, cx } from '@/components/ui/Primitives';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { DocumentKind } from '@/types';
import { ProfileBackHeader } from '../ProfileBackHeader';

type Filter = 'all' | 'check' | 'ok';

const KIND_ICON: Partial<Record<DocumentKind, IconName>> = {
  passport: 'passport',
  visa: 'passport',
  national_id: 'idCard',
  license: 'shield',
};

/** สถานะต่อเอกสาร → สีไอคอน/ป้าย (แดง หมดอายุ · ทอง ใกล้หมดอายุ · เขียว ใช้ได้ · เทา ไม่มีวันหมดอายุ) */
function docState(alert: DocumentExpiryAlert | undefined, expiresAt: string | null) {
  if (alert?.severity === 'expired') return { tile: 'red', chip: 'zego-chip--red', label: 'หมดอายุแล้ว' } as const;
  if (alert?.severity === 'soon') return { tile: 'gold', chip: 'zego-chip--gold', label: 'ใกล้หมดอายุ' } as const;
  if (!expiresAt) return { tile: 'green', chip: 'zego-chip--neutral', label: 'ไม่มีวันหมดอายุ' } as const;
  return { tile: 'green', chip: 'zego-chip--green', label: 'ใช้ได้' } as const;
}

export default function GuideProfileDocumentsPage() {
  const { currentUser, leaders, today } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));
  const [filter, setFilter] = useState<Filter>('all');

  const documents = useLeaderDocumentsView(leader, true);
  const alerts = listDocumentExpiryAlerts(documents, today);

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="เอกสารประจำตัว" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  const alertById = new Map(alerts.map((a) => [a.docId, a]));
  const expiredCount = alerts.filter((a) => a.severity === 'expired').length;
  const soonCount = alerts.length - expiredCount;
  // ต้องตรวจขึ้นก่อน (เรียงตามความเร่ง) แล้วตามด้วยเอกสารที่ใช้ได้
  const rows = [
    ...alerts.map((a) => documents.find((d) => d.id === a.docId)).filter((d): d is NonNullable<typeof d> => Boolean(d)),
    ...documents.filter((d) => !alertById.has(d.id)),
  ];
  const visible = rows.filter((d) => filter === 'all' || (filter === 'check') === alertById.has(d.id));
  const counts: Record<Filter, number> = { all: rows.length, check: alerts.length, ok: rows.length - alerts.length };
  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'check', label: 'ต้องตรวจ' },
    { key: 'ok', label: 'ใช้ได้' },
  ];

  return (
    <div className="space-y-3">
      <ProfileBackHeader title="เอกสารประจำตัว" />

      {alerts.length > 0 && (
        <div className="zego-guide-warnbox">
          <span className="zego-guide-warnbox__icon"><Icon name="warning" className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="zego-guide-warnbox__title">ต้องตรวจ {alerts.length} รายการ</p>
            <p className="zego-guide-warnbox__sub">
              {[expiredCount > 0 && `หมดอายุแล้ว ${expiredCount}`, soonCount > 0 && `ใกล้หมดอายุ ${soonCount}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="zego-guide-seg" role="group" aria-label="กรองเอกสาร">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label} ({counts[f.key]})
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="zego-guide-list px-3 py-4 text-center text-sm zego-text-tertiary">ไม่มีเอกสารในกลุ่มนี้</p>
          ) : (
            <ul className="zego-guide-list">
              {visible.map((d) => {
                const alert = alertById.get(d.id);
                const st = docState(alert, d.expiresAt);
                return (
                  <li key={d.id} className="zego-guide-row zego-guide-row--tall">
                    <span className={cx('zego-guide-tile zego-guide-tile--lg', `zego-guide-tile--${st.tile}`)}>
                      <Icon name={KIND_ICON[d.kind] ?? 'file'} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="zego-guide-row__title truncate">{d.name}</span>
                      <span className="zego-guide-row__sub">
                        {d.expiresAt ? `หมดอายุ ${formatDate(d.expiresAt)}` : 'ไม่ระบุวันหมดอายุ'}
                        {alert?.severity === 'soon' && ` · อีก ${alert.daysLeft} วัน`}
                      </span>
                    </span>
                    <span className={cx('zego-chip shrink-0', st.chip)}>{st.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* แก้ไขเอกสาร — component เดียวกับฝั่งผู้จัด · หัวกลุ่มแสดงเมื่อมีภาพรวมด้านบน (ไม่มีก็ไม่ต้องแยกส่วน) */}
      {rows.length > 0 && <h2 className="zego-guide-label pt-2">แก้ไขเอกสาร</h2>}
      <div className="space-y-4">
        <LeaderPassportTab leader={leader} />

        <LeaderDocumentsCard
          leader={leader}
          kinds={IDENTITY_DOC_KINDS}
          title="วีซ่า"
          description="วีซ่าของประเทศปลายทาง"
        />
      </div>
    </div>
  );
}
