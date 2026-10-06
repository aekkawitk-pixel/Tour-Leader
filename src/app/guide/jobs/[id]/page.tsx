'use client';

/**
 * รายละเอียดงาน — /guide/jobs/[id] — id = periodId (internalId ของ Tour Period Master)
 * อ่านจาก Tour Period Master + guideAssignmentStore เช่นเดียวกับหน้ารายการ (ดูหมายเหตุที่ jobs/page.tsx)
 */

import Link from 'next/link';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { markJobSeen } from '@/services/guideSeenJobsStore';
import { getPeriodAttachments, getPeriodDocCategories } from '@/services/periodAttachmentStore';
import { loadSendOffAssignments } from '@/services/sendOffAssignmentStore';
import { loadSendOffStaff } from '@/services/sendOffStaffStore';
import { sendOffStaffName } from '@/lib/logic/sendOffStaff';
import { jobArrival } from '@/lib/logic/sendOffJobs';
import { loadManualFlightTimes } from '@/services/sendOffFlightTimeStore';
import { loadSendOffRules } from '@/services/sendOffRulesStore';
import { boardStatusMeta, periodTurnaround, splitFlightLegs } from '@/lib/logic/guideBoard';
import { airportByIata } from '@/data/airports';
import { addDays, formatDate, formatDateRange } from '@/lib/format';
import { Card, EmptyState, StatusBadge } from '@/components/ui/Primitives';
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
  const { currentUser, expenses, envelopes, noEnvelopeMarks } = useDemo();
  const leaderId = ownLeaderScope(currentUser);
  const period = getTourPeriodById(id);
  const assignment = loadActiveGuideAssignments().find((a) => a.periodId === id && a.tourLeaderId === leaderId);
  // เปิดดูรายละเอียดแล้ว = ไม่ใช่ "งานใหม่" ในกระดิ่งแจ้งเตือนอีก
  const assignmentId = assignment?.assignmentId;
  useEffect(() => {
    if (assignmentId) markJobSeen(assignmentId);
  }, [assignmentId]);
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
  /*
    เวลานัดหมาย = เวลาที่ต้องถึงสนามบิน — คำนวณชุดเดียวกับที่ผู้จัดเห็นในตารางเจ้าหน้าที่ส่งกรุ๊ป
    (เวลาเครื่องออกจริงจากเที่ยวบิน ชนะเวลาที่ผู้จัดกรอกเอง · ลบด้วยชั่วโมงล่วงหน้าตามเงื่อนไขที่ตั้งไว้)
    เที่ยวบินดึกมากต้องไปตั้งแต่คืนก่อน → วันนัดเป็นวันก่อนวันเดินทาง
  */
  const sendOffRules = loadSendOffRules();
  const flightTime = periodTurnaround(period).departureTime ?? loadManualFlightTimes()[period.internalId] ?? null;
  const meeting = jobArrival(flightTime, sendOffRules);
  const meetingDate = meeting.dayOffset === -1 ? addDays(period.startDate, -1) : period.startDate;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/guide/jobs" className="mb-2 inline-flex items-center gap-1 text-sm font-medium zego-text-success">
          <Icon name="chevronLeft" className="h-4 w-4" />
          งานของฉัน
        </Link>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold zego-text">{period.groupCode}</h1>
            <p className="mt-0.5 text-sm zego-text-secondary">{period.displayName}</p>
          </div>
          <StatusBadge meta={boardStatusMeta(assignment.assignmentStatus)} size="sm" />
        </div>
      </div>

      {/* ผู้จัดมอบหมายงาน = คอนเฟิร์มทันที (ไม่มีขั้นรับ/ปฏิเสธงานฝั่งหัวหน้าทัวร์) — เปลี่ยนแปลงต้องแจ้งเจ้าหน้าที่จัดสเก็ตเท่านั้น */}
      {assignment.assignmentStatus === 'CONFIRMED' && (
        <p className="rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-tertiary">
          หากต้องการเปลี่ยนแปลง (เลื่อนวัน เปลี่ยนคน ยกเลิก) กรุณาแจ้งเจ้าหน้าที่จัดสเก็ตเท่านั้น
        </p>
      )}
      {assignment.assignmentStatus === 'DECLINED' && (
        <p className="rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-tertiary">
          คุณปฏิเสธงานนี้แล้ว — หากเปลี่ยนใจต้องการรับงานนี้ กรุณาแจ้งเจ้าหน้าที่จัดสเก็ตเท่านั้น
        </p>
      )}

      <Card>
        <Row label="ประเทศ" value={period.countryName} />
        <Row label="รหัสโปรแกรม" value={period.programCode} />
        <Row label="รหัสกรุ๊ป (บัส)" value={period.bus ? `${period.groupCode} (${period.bus})` : period.groupCode} />

        {/* วันเดินทาง — เด่นกว่าแถวอื่นตั้งใจ กันไปผิดวัน */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 zego-divider-bottom py-2.5">
          <p className="shrink-0 text-xs zego-text-tertiary">วันเดินทาง</p>
          <p className="text-right text-base font-bold zego-text-success">{formatDateRange(period.startDate, period.endDate)}</p>
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
          label="เวลานัดหมาย"
          value={meeting.arrivalTime ? (
            <>
              <span className="font-semibold">{formatDate(meetingDate)} · {meeting.arrivalTime} น.</span>
              <span className="block text-xs zego-text-tertiary">
                {meeting.dayOffset === -1 ? 'คืนก่อนวันเดินทาง · ' : ''}ก่อนเครื่องออก {sendOffRules.leadHours} ชม.
              </span>
            </>
          ) : undefined}
        />
        <Row
          label="เจ้าหน้าที่ส่งกรุ๊ป"
          value={sendOffStaffList.length > 0 ? sendOffStaffList.map(sendOffStaffName).join(', ') : undefined}
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

    </div>
  );
}
