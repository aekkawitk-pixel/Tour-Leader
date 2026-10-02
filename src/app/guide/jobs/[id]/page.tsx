'use client';

/**
 * รายละเอียดงาน — /guide/jobs/[id] — id = periodId (internalId ของ Tour Period Master)
 * อ่านจาก Tour Period Master + guideAssignmentStore เช่นเดียวกับหน้ารายการ (ดูหมายเหตุที่ jobs/page.tsx)
 */

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments, setAssignmentStatus } from '@/services/guideAssignmentStore';
import { getPeriodAttachments, getPeriodDocCategories } from '@/services/periodAttachmentStore';
import { loadSendOffAssignments } from '@/services/sendOffAssignmentStore';
import { loadSendOffStaff } from '@/services/sendOffStaffStore';
import { boardStatusMeta, splitFlightLegs } from '@/lib/logic/guideBoard';
import { airportByIata } from '@/data/airports';
import { formatDateRange } from '@/lib/format';
import { Button, Card, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import type { TourSector } from '@/data/schedule/masterTypes';
import { GuideEnvelopeCard } from '../../expenses/GuideEnvelopeCard';
import { SpendSummaryCard } from '../../expenses/SpendSummaryCard';
import { leaderBudgetItems } from '@/lib/logic/groupBudget';

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 zego-divider-bottom py-2 last:border-b-0">
      <dt className="shrink-0 text-xs zego-text-tertiary">{label}</dt>
      <dd className={`text-right text-sm ${empty ? 'zego-text-disabled' : 'zego-text'}`}>{empty ? 'ยังไม่ระบุ' : value}</dd>
    </div>
  );
}

/** เที่ยวบิน 1 ช่วง — เลขเที่ยวบิน / เส้นทาง / เวลา แยกกันชัดเจน ไม่ใช่ข้อความยาวเส้นเดียว */
function FlightLegRow({ sector }: { sector: TourSector }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg zego-surface-soft-bg px-3 py-2">
      <span className="shrink-0 font-mono text-sm font-semibold zego-text">{sector.flightNumber || '—'}</span>
      <span className="min-w-0 flex-1 truncate text-center text-sm zego-text-secondary">
        {sector.fromAirportCode || '—'} – {sector.toAirportCode || '—'}
      </span>
      <span className="shrink-0 text-sm tabular-nums zego-text-secondary">
        {sector.departureTime || '—'}–{sector.arrivalTime || '—'}
      </span>
    </div>
  );
}

function FlightLegGroup({ title, sectors }: { title: string; sectors: TourSector[] }) {
  if (sectors.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium zego-text-tertiary">{title}</p>
      <div className="space-y-1.5">
        {sectors.map((s, i) => <FlightLegRow key={`${s.sectorSequence}-${i}`} sector={s} />)}
      </div>
    </div>
  );
}

export default function GuideJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentUser, today, pushToast, expenses, envelopes, noEnvelopeMarks } = useDemo();
  const leaderId = ownLeaderScope(currentUser);
  const period = getTourPeriodById(id);
  const [rev, setRev] = useState(0);
  void rev;
  const assignment = loadActiveGuideAssignments().find((a) => a.periodId === id && a.tourLeaderId === leaderId);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [actionSaving, setActionSaving] = useState(false);

  const acceptJob = () => {
    if (!assignment) return;
    setActionSaving(true);
    setAssignmentStatus(assignment.assignmentId, 'CONFIRMED', currentUser.name, `${today}T09:00`);
    pushToast('success', 'รับงานเรียบร้อยแล้ว');
    setActionSaving(false);
    setRev((r) => r + 1);
  };

  const declineJob = () => {
    if (!assignment) return;
    setActionSaving(true);
    setAssignmentStatus(assignment.assignmentId, 'DECLINED', currentUser.name, `${today}T09:00`);
    pushToast('info', 'ปฏิเสธงานนี้แล้ว — ผู้ประสานงานจะเห็นและจัดหาคนแทน');
    setActionSaving(false);
    setDeclineOpen(false);
    setRev((r) => r + 1);
  };

  if (!period || !assignment) {
    return (
      <div>
        <Link href="/guide/jobs" className="mb-3 inline-flex items-center gap-1 text-sm font-medium zego-text-success">
          <Icon name="chevronLeft" className="h-4 w-4" />
          งานของฉัน
        </Link>
        <Card><EmptyState icon="briefcase" title="ไม่พบงานนี้" /></Card>
      </div>
    );
  }

  const { outbound, inbound } = splitFlightLegs(period.sectors);
  const attachments = getPeriodAttachments(period.internalId);
  const docCategories = getPeriodDocCategories(period.internalId);
  /* กรุ๊ปใหญ่บางกรุ๊ปมีเจ้าหน้าที่ส่งกรุ๊ปได้มากกว่า 1 คน — แสดงให้ครบทุกคน ไม่ใช่แค่คนแรก */
  const sendOffList = loadSendOffAssignments().filter((a) => a.periodId === period.internalId);
  const allSendOffStaff = loadSendOffStaff();
  const sendOffStaffList = sendOffList
    .map((a) => allSendOffStaff.find((s) => s.id === a.staffId))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const departureAirport = airportByIata(period.departureAirportCode ?? undefined);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/guide/jobs" className="mb-2 inline-flex items-center gap-1 text-sm font-medium zego-text-success">
          <Icon name="chevronLeft" className="h-4 w-4" />
          งานของฉัน
        </Link>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-lg font-bold zego-text">{period.groupCode} · {period.displayName}</h1>
          <StatusBadge meta={boardStatusMeta(assignment.assignmentStatus)} size="sm" />
        </div>
      </div>

      {/* งานรอคอนเฟิร์ม — หัวหน้าทัวร์กดรับ/ปฏิเสธเองจากตรงนี้ */}
      {assignment.assignmentStatus === 'PENDING_CONFIRMATION' && (
        <Card className="border border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold zego-text-warning">งานนี้รอการยืนยันจากคุณ</p>
          <p className="mt-0.5 text-xs zego-text-warning">กดรับงานเพื่อยืนยันว่าจะไปตามกำหนดนี้ หรือปฏิเสธถ้าไปไม่ได้ — ผู้ประสานงานจะเห็นทันที</p>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" icon="check" className="flex-1" loading={actionSaving} onClick={acceptJob}>รับงาน</Button>
            <Button variant="secondary" className="flex-1" disabled={actionSaving} onClick={() => setDeclineOpen(true)}>ปฏิเสธงาน</Button>
          </div>
        </Card>
      )}

      {/* คอนเฟิร์ม/ปฏิเสธแล้ว — เปลี่ยนใจภายหลังต้องแจ้งเจ้าหน้าที่จัดสเก็ตเท่านั้น ไม่มีปุ่มให้แก้เองในนี้ */}
      {assignment.assignmentStatus === 'CONFIRMED' && (
        <p className="rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-tertiary">
          คุณรับงานนี้แล้ว — หากต้องการเปลี่ยนแปลง (เลื่อนวัน เปลี่ยนคน ยกเลิก) กรุณาแจ้งเจ้าหน้าที่จัดสเก็ตเท่านั้น
        </p>
      )}
      {assignment.assignmentStatus === 'DECLINED' && (
        <p className="rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-tertiary">
          คุณปฏิเสธงานนี้แล้ว — หากเปลี่ยนใจต้องการรับงานนี้ กรุณาแจ้งเจ้าหน้าที่จัดสเก็ตเท่านั้น
        </p>
      )}

      <Card>
        <Row label="ประเทศ" value={period.countryName} />
        <Row label="รหัสกรุ๊ป (บัส)" value={period.bus ? `${period.groupCode} (${period.bus})` : period.groupCode} />

        {/* วันเดินทาง — เด่นกว่าแถวอื่นตั้งใจ กันไปผิดวัน */}
        <div className="zego-divider-bottom py-2.5">
          <p className="text-xs zego-text-tertiary">วันเดินทาง</p>
          <p className="mt-0.5 text-base font-bold zego-text-success">{formatDateRange(period.startDate, period.endDate)}</p>
        </div>

        <Row label="จำนวนผู้เดินทาง" value={period.seatBooked !== null ? `${period.seatBooked} คน` : undefined} />

        {/* เที่ยวบิน — แยกขาไป/ขากลับ เลขเที่ยวบิน/เส้นทาง/เวลา คนละส่วนกันชัดเจน แทนข้อความยาวเส้นเดียว */}
        {period.sectors.length > 0 ? (
          <div className="zego-divider-bottom py-2.5">
            <p className="mb-1.5 text-xs zego-text-tertiary">เที่ยวบิน</p>
            <div className="space-y-2">
              <FlightLegGroup title="ขาไป" sectors={outbound} />
              <FlightLegGroup title="ขากลับ" sectors={inbound} />
            </div>
          </div>
        ) : (
          <Row label="เที่ยวบิน" value={undefined} />
        )}

        <Row
          label="สนามบิน"
          value={period.departureAirportCode ? `${period.departureAirportCode}${departureAirport?.nameTh ? ` (${departureAirport.nameTh})` : ''}` : undefined}
        />
        <Row
          label="เจ้าหน้าที่ส่งกรุ๊ป"
          value={sendOffStaffList.length > 0 ? sendOffStaffList.map((s) => s.nickname).join(', ') : undefined}
        />
        <Row
          label="เบอร์ติดต่อเจ้าหน้าที่ส่งกรุ๊ป"
          value={sendOffStaffList.length > 0 ? sendOffStaffList.map((s) => s.phone).join(', ') : undefined}
        />
      </Card>

      {/* ขั้นตอนรับซองเงินของกรุ๊ป — ยืนยันการรับ + แนบรูป (ไม่บังคับ) · ไม่มีเอกสารเบิก = ไม่แสดง */}
      <GuideEnvelopeCard periodId={period.internalId} mode="receive" />

      {period.remark && (
        <Card>
          <p className="mb-1 text-xs font-semibold zego-text-secondary">หมายเหตุ</p>
          <p className="text-sm zego-text-secondary">{period.remark}</p>
        </Card>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold zego-text">เอกสารทริป</p>
        <div className="space-y-2.5">
          {docCategories.map((cat) => {
            const files = attachments.filter((a) => a.category === cat);
            return (
              <Card key={cat}>
                <p className="mb-1.5 text-sm font-semibold zego-text">{cat}</p>
                {files.length === 0 ? (
                  <p className="text-xs zego-text-tertiary">ยังไม่มีไฟล์ในหมวดนี้</p>
                ) : (
                  <ul className="space-y-1.5">
                    {files.map((file) => (
                      <li key={file.id} className="flex items-center gap-3 rounded-lg zego-surface-soft-bg px-3 py-2">
                        <Icon name="file" className="h-4 w-4 shrink-0 zego-text-tertiary" />
                        <span className="min-w-0 flex-1 truncate text-sm zego-text-secondary">{file.name}</span>
                        <span className="shrink-0 text-xs zego-text-tertiary">{file.size}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* สรุปค่าใช้จ่ายกรุ๊ป — ล่างสุดของหน้า · แสดงหัวข้อรอไว้เสมอ ยังไม่บันทึก = ยอด 0 */}
      <SpendSummaryCard
        title="สรุปค่าใช้จ่ายกรุ๊ป"
        recorded={expenses.filter((e) => e.requesterId === leaderId && e.jobId === period.internalId && e.category === 'actual' && e.status !== 'cancelled')}
        budgetItems={leaderBudgetItems(expenses, envelopes, noEnvelopeMarks, period.internalId)}
      />

      <ConfirmDialog
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        onConfirm={declineJob}
        loading={actionSaving}
        tone="danger"
        title="ปฏิเสธงานนี้?"
        message={`ยืนยันว่าจะปฏิเสธงาน ${period.groupCode} · ${formatDateRange(period.startDate, period.endDate)} — ผู้ประสานงานจะเห็นทันทีและต้องหาคนแทน`}
        confirmLabel="ปฏิเสธงาน"
      />
    </div>
  );
}
