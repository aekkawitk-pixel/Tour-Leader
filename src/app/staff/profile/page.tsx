'use client';

/**
 * โปรไฟล์ — /staff/profile (พอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป)
 *
 * ข้อมูลของตัวเองจากทะเบียนเจ้าหน้าที่ส่งกรุ๊ป (ดูอย่างเดียว — แก้ไขที่ผู้ดูแล)
 * เลขบัตรประชาชน/เลขบัญชีแสดงแบบปิดบังเสมอ
 */

import { Card, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { formatDate } from '@/lib/format';
import { SEND_OFF_STAFF_STATUS, SEND_OFF_STAFF_TYPE, sendOffStaffName } from '@/lib/logic/sendOffStaff';
import { useStaffPortal } from '../useStaffPortal';

const maskId = (id: string) => {
  const d = id.replace(/\D/g, '');
  return d.length === 13 ? `x-xxxx-xxxxx-${d.slice(10, 12)}-${d[12]}` : '—';
};

export default function StaffProfilePage() {
  const { staff, duties, today } = useStaffPortal();
  if (!staff) {
    return <Card><EmptyState icon="warning" title="ไม่พบข้อมูลในทะเบียนเจ้าหน้าที่ส่งกรุ๊ป" description="ติดต่อผู้ดูแลระบบให้ผูกรหัส SOS กับบัญชีนี้" /></Card>;
  }
  const month = today.slice(0, 7);
  const thisMonth = duties.filter((d) => d.dutyDate.startsWith(month)).length;
  const done = duties.filter((d) => d.confirmed && d.dutyDate < today).length;
  const ec = staff.emergencyContact;

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-amber-600 text-xl font-bold text-white">
          {staff.idCard.firstName.slice(0, 1) || staff.nickname.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="text-base font-bold zego-text">{sendOffStaffName(staff)}</p>
          <p className="text-xs zego-text-tertiary">{staff.id} · เจ้าหน้าที่ส่งกรุ๊ป</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <StatusBadge meta={SEND_OFF_STAFF_TYPE[staff.staffType]} size="sm" />
            <StatusBadge meta={SEND_OFF_STAFF_STATUS[staff.status]} size="sm" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Card className="text-center">
          <p className="text-2xl font-bold zego-text">{thisMonth}</p>
          <p className="text-xs zego-text-tertiary">งานเดือนนี้</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold zego-text">{done}</p>
          <p className="text-xs zego-text-tertiary">ส่งกรุ๊ปแล้วทั้งหมด</p>
        </Card>
      </div>

      <Section title="ข้อมูลติดต่อ">
        <Row label="เบอร์โทร" value={staff.phone || '—'} />
        <Row label="อีเมล" value={staff.email || '—'} />
        <Row label="ผู้ติดต่อฉุกเฉิน" value={ec?.name ? `${ec.name}${ec.relation ? ` (${ec.relation})` : ''}${ec.phone ? ` · ${ec.phone}` : ''}` : '—'} />
      </Section>

      <Section title="ข้อมูลตามบัตรประชาชน">
        <Row label="ชื่อ-นามสกุล" value={`${staff.idCard.title ?? ''}${staff.idCard.firstName} ${staff.idCard.lastName}`.trim()} />
        <Row label="ชื่ออังกฤษ" value={`${staff.idCard.firstNameEn ?? ''} ${staff.idCard.lastNameEn ?? ''}`.trim() || '—'} />
        <Row label="เลขบัตรประชาชน" value={maskId(staff.idCard.idNumber)} />
        <Row label="บัตรหมดอายุ" value={staff.idCard.expiryDate ? formatDate(staff.idCard.expiryDate) : '—'} />
      </Section>

      <Section title="บัญชีรับเงิน">
        {staff.bankAccounts.filter((b) => b.active).length === 0 ? (
          <p className="text-sm zego-text-tertiary">ยังไม่มีบัญชีรับเงิน</p>
        ) : (
          staff.bankAccounts.filter((b) => b.active).map((b) => (
            <div key={b.id} className="flex items-start justify-between gap-2 text-sm">
              <div>
                <p className="font-medium zego-text">{b.bank} {b.accountNoMasked}</p>
                <p className="text-xs zego-text-tertiary">{b.accountName}{b.branch ? ` · ${b.branch}` : ''}</p>
              </div>
              {b.isPrimary && <StatusBadge meta={{ label: 'บัญชีหลัก', tone: 'green' }} size="sm" />}
            </div>
          ))
        )}
      </Section>

      <p className="text-center text-[11px] zego-text-tertiary">ข้อมูลไม่ถูกต้อง? แจ้งผู้ดูแลเพื่อแก้ไขในทะเบียนเจ้าหน้าที่ส่งกรุ๊ป</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-2">
      <h2 className="text-sm font-semibold zego-text">{title}</h2>
      {children}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="shrink-0 zego-text-tertiary">{label}</span>
      <span className="text-right zego-text">{value}</span>
    </div>
  );
}
