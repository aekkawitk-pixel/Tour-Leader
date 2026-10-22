'use client';

/**
 * หน้าหลัก (Personal Workspace) ของพอร์ทัลหัวหน้าทัวร์ — /guide
 *
 * หน้าสรุป ไม่ใช่ทางลัดเมนู (เมนูอยู่แถบล่างแล้ว):
 *   ส่วนหัว — หัวข้อ + วันนี้ · เลือกเดือน (ตารางปฏิทินรายเดือน) — แบบเดียวกับหน้าหลักเจ้าหน้าที่ส่งกรุ๊ป
 *   1) จำนวนงานของเดือน + แยกสนามบินที่กรุ๊ปออกเดินทาง (การ์ดกลาง MonthJobsCard · แสดงอย่างเดียว ไม่ลิงก์)
 *   2) ปลายทางของเดือน — วงกลมธงแยกประเทศ เรียงมาก→น้อย · เกิน 4 เลื่อนดูได้
 *   2.1) สายการบินของเดือน — แยกสายการบิน เรียงมาก→น้อย · เกิน 4 เลื่อนดูได้ (AirlinesCard)
 *   3) รายการงานของเดือน — กรองทั้งหมด / สุวรรณภูมิ / ดอนเมือง · วันที่ (ไป/กลับ 2 บรรทัด) · สนามบิน · รหัสกรุ๊ป (+ ไฟลท์ขาไป · เวลาเครื่องออก · ซองเงิน) · สถานะช่วงทริป (แสดงอย่างเดียว)
 *   4) มีซองเงินค้าง (รอรับ / กำลังมา / แจ้งไม่ได้รับ) → การ์ดเตือนกรุ๊ปละบรรทัด แตะไปยืนยันที่หน้าการจัดการซองเงิน
 *      (ยืนยันรับซองทำที่เดียว — การ์ดซองเงินชุดเดียวกับหน้ารายละเอียดงาน ไม่มีหน้าตาที่สองที่หน้าหลัก)
 * ไม่มี checklist/attendance/customer-care ที่เพิ่มภาระรายวัน (ตัดออกแล้วตามที่คุยกัน)
 *
 * หน้าตาตามธีม v3: แถบหัวโค้งเขียว (ทักทาย + ชื่อ + เลือกเดือน) · แบนเนอร์งานด่วนเขียวป่า (เรื่องเดียวกับกระดิ่ง)
 * · แถวเอกสารต้องตาม · วงกลมธงปลายทาง · รายการงานแบบแถวพร้อม segmented สนามบิน
 */

import Link from 'next/link';
import { CarrierLeaderSection } from './CarrierLeaderSection';
import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { useLeaderDocumentsView } from '@/lib/useLeaderDocuments';
import { listGuideAlerts, type GuideAlertKind } from '@/lib/logic/guideAlerts';
import { leaderDisplayName } from '@/lib/logic/leaderExpertise';
import { listDocumentExpiryAlerts } from '@/lib/logic/documentExpiryAlerts';
import { formatDate, toISODate } from '@/lib/format';
import { leaderEnvelopeState } from '@/lib/logic/cashEnvelope';
import { Icon } from '@/components/ui/Icon';
import { MonthJobsCard } from '@/components/portal/MonthJobsCard';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { airportText, thaiMonthTitle } from '@/components/portal/MonthJobsCard';
import { tripEnded, tripStarted } from '@/lib/logic/tripPhase';
import { cx } from '@/components/ui/Primitives';
import { destinationBreakdown, resolveDestination } from '@/lib/logic/destinations';
import { FlagCircle, FlagTile, GuideBand, GuideOverlap } from './GuideUi';
import { AirlinesCard } from '@/components/portal/AirlinesCard';
import { airlineBreakdown, flightNoOf, tripAirports } from '@/lib/logic/airlines';
import { airportByIata } from '@/data/airports';

import { periodTurnaround } from '@/lib/logic/guideBoard';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';
import { airportBreakdown } from '@/lib/logic/staffPortal';

/** สนามบินในไทย — ใช้ตัดสินว่าเที่ยวบินสุดท้ายคือขากลับเข้าไทย */
const isThaiAirport = (code: string) => airportByIata(code)?.countryCode === 'TH';

/** ไฟลท์ขาไป (เที่ยวบินแรก) + เวลาเครื่องออก — ไม่มีข้อมูล = ค่าว่าง */
function outboundFlight(p: TourPeriodMaster): { no: string; time: string } {
  const first = p.sectors?.[0];
  const no = flightNoOf(first);
  return { no, time: periodTurnaround(p).departureTime ?? '' };
}

/** สีป้ายแจ้งเตือนซองเงินในรายการงาน — แดง/ทอง/เทา ตามความหมายสถานะของธีม v3 */
const NOTICE_TONE = {
  red: 'zego-chip--red',
  amber: 'zego-chip--gold',
  slate: 'zego-chip--neutral',
} as const;

/** ป้ายสถานะช่วงทริป — รอเดินทาง ทอง · กำลังเดินทาง เขียว · จบทริปแล้ว เทา */
const STAGE_CHIP = { amber: 'zego-chip--gold', green: 'zego-chip--green', slate: 'zego-chip--neutral' } as const;

/** คำในแบนเนอร์งานด่วน ต่อประเภทเรื่องที่ต้องทำ (ชุดเดียวกับกระดิ่งใน GuideShell) */
const ALERT_WORD: Record<GuideAlertKind, string> = { new_job: 'งานใหม่', envelope: 'ซองเงิน', appointment: 'นัดหมาย' };

/** คำทักทายตามช่วงเวลาของเครื่อง */
function greetingOf(hour: number) {
  if (hour < 12) return 'สวัสดีตอนเช้า';
  if (hour < 17) return 'สวัสดีตอนบ่าย';
  return 'สวัสดีตอนเย็น';
}

export default function GuideHomePage() {
  const { currentUser, leaders, today, envelopes, appointments } = useDemo();

  // GuideShell กันบัญชีที่ไม่ใช่บทบาทหัวหน้าทัวร์ไว้แล้วที่ชั้นบนสุด — หน้านี้เข้าถึงได้แปลว่าเป็นหัวหน้าทัวร์แน่นอน
  const leaderId = ownLeaderScope(currentUser);
  const leader = leaders.find((l) => l.id === leaderId);

  // เอกสารต้องตาม (หมดอายุแล้ว/ใกล้หมดอายุ) — ดูของตัวเองได้เสมอ ไม่ต้องเช็คสิทธิ์เพิ่ม
  const documents = useLeaderDocumentsView(leader, true);
  const docAlerts = listDocumentExpiryAlerts(documents, today);
  const expiredDocs = docAlerts.filter((a) => a.severity === 'expired');
  const soonDocs = docAlerts.filter((a) => a.severity === 'soon');

  /*
    ช่วงเดินทาง/นัดหมาย เทียบกับวันที่จริงของเครื่อง — ให้ตรงกับหน้างานของฉัน/บัญชี-การเงิน/บันทึกใบเสร็จ
    (เดิมใช้ DEMO_TODAY = 2026-07-13 ทำให้กรุ๊ปที่กำลังเดินทางจริงถูกนับเป็น "กำลังจะถึง")
  */
  const realToday = toISODate(new Date());

  // ดึงจาก Tour Period Master + guideAssignmentStore — แหล่งเดียวกับที่หน้า "การจัดสเก็ต" ฝั่งผู้จัดใช้จริง
  const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
  // จำนวนงานรายเดือน — นับตามเดือนที่ออกเดินทาง (แบบเดียวกับหน้างานของฉัน) · รวมงานที่จบแล้ว เพื่อดูย้อนหลังได้ · ไม่นับสถานะปฏิเสธ (ข้อมูลเก่า)
  const allMyJobs = (leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId && a.assignmentStatus !== 'DECLINED') : [])
    .map((a) => periodById.get(a.periodId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const thisMonth = realToday.slice(0, 7);
  const [monthCursor, setMonthCursor] = useState(thisMonth);
  // งานของเดือนที่เลือก (ตามเดือนที่ออกเดินทาง)
  const monthJobs = allMyJobs.filter((p) => p.startDate.slice(0, 7) === monthCursor);
  // จำนวนงานต่อเดือน (ตามเดือนที่ออกเดินทาง) — ตัวเลขในตารางเลือกเดือน
  const monthCounts: Record<string, number> = {};
  for (const p of allMyJobs) monthCounts[p.startDate.slice(0, 7)] = (monthCounts[p.startDate.slice(0, 7)] ?? 0) + 1;
  // รายการงานเดือนที่เลือก — กรองตามสนามบินที่ออกเดินทาง (ทั้งหมด / สุวรรณภูมิ / ดอนเมือง / อื่น ๆ)
  const [airportFilter, setAirportFilter] = useState('all');
  /**
   * ซองเงินที่หัวหน้าทัวร์ต้องรับของกรุ๊ปนี้ (ใช้ในรายการงาน) — เรียงความสำคัญ: แจ้งไม่ได้รับ > รอกดรับ > กำลังนำมาส่ง > อยู่ที่การเงิน
   * ไม่มีซองที่ส่งถึงคุณ / รับครบแล้ว = null
   */
  const envelopeNoticeOf = (periodId: string): { text: string; tone: 'red' | 'amber' | 'slate' } | null => {
    const states = envelopes.filter((e) => e.periodId === periodId).map((e) => leaderEnvelopeState(e, leaderId));
    const n = (st: string) => states.filter((x) => x === st).length;
    if (n('not_received')) return { text: `ไม่ได้รับซอง ${n('not_received')}`, tone: 'red' };
    if (n('to_ack')) return { text: `รอรับซอง ${n('to_ack')}`, tone: 'amber' };
    if (n('in_transit')) return { text: `ซองกำลังมา ${n('in_transit')}`, tone: 'amber' };
    if (n('at_finance')) return { text: `ซองอยู่การเงิน ${n('at_finance')}`, tone: 'slate' };
    return null;
  };
  const monthAirports = airportBreakdown(monthJobs.map((p) => p.departureAirportCode));
  const listJobs = [...monthJobs]
    .filter((p) => airportFilter === 'all' || (p.departureAirportCode ?? '').trim().toUpperCase() === airportFilter)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));


  /* ---------------- ซองเงิน ---------------- */
  // ซองที่ถึงมือแล้วรอกดยืนยันรับ / ซองที่เจ้าหน้าที่ส่งกรุ๊ปยังถืออยู่ระหว่างทาง
  const envToAck = envelopes.filter((e) => leaderEnvelopeState(e, leaderId) === 'to_ack');
  const envInTransit = envelopes.filter((e) => leaderEnvelopeState(e, leaderId) === 'in_transit');
  // กรุ๊ปที่มีซองส่งถึงคุณและยังไม่ได้ยืนยันรับ — แสดงการ์ดเตือนซองเงิน
  // รวมซองที่แจ้งไม่ได้รับไว้ด้วย — ยังค้างอยู่จนกว่าการเงินจะตามได้ / ได้รับภายหลัง
  const envReported = envelopes.filter((e) => leaderEnvelopeState(e, leaderId) === 'not_received');
  // ซองที่ยังอยู่การเงิน (เจ้าหน้าที่ยังไม่รับ) — แสดงให้รู้ว่ามีซองกำลังมา แต่ยังกดอะไรไม่ได้
  const envAtFinance = envelopes.filter((e) => leaderEnvelopeState(e, leaderId) === 'at_finance');
  const ackGroups = [...new Set([...envToAck, ...envInTransit, ...envReported, ...envAtFinance].map((e) => e.periodId))]
    .map((id) => periodById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  /** เรื่องที่ต้องทำ — ชุดเดียวกับกระดิ่งใน GuideShell (งานใหม่ · ซองรอรับ · นัดหมายรอยืนยัน) */
  const alerts = listGuideAlerts({
    leaderId,
    today: realToday,
    assignments: loadActiveGuideAssignments(),
    periodById: getTourPeriodById,
    envelopes,
    appointments,
  });
  const alertSummary = (Object.keys(ALERT_WORD) as GuideAlertKind[])
    .map((k) => [k, alerts.filter((a) => a.kind === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${ALERT_WORD[k]} ${n}`)
    .join(' · ');

  const firstName = (leader ? leaderDisplayName(leader) : currentUser.name).split(' ')[0];
  const destinations = destinationBreakdown(monthJobs);
  const topCount = destinations[0]?.count ?? 0;
  const topTied = destinations.filter((d) => d.count === topCount).length > 1;
  const monthWord = monthCursor === thisMonth ? 'เดือนนี้' : thaiMonthTitle(monthCursor);

  return (
    <div className="space-y-4">
      {/* แถบหัวโค้ง — คำทักทาย + ชื่อ + วันนี้ · เลือกเดือน (มีผลกับทุกส่วนด้านล่าง) */}
      <GuideBand overlap>
        <p className="zego-guide-band__eyebrow">{greetingOf(new Date().getHours())}</p>
        <h1 className="zego-guide-band__title">คุณ{firstName}</h1>
        <div className="zego-guide-band__meta mt-2 flex flex-wrap items-center gap-2">
          <span>วันนี้ {formatDate(realToday)}</span>
          {/* เลือกเดือนจากตารางปฏิทินรายเดือน (ปี ‹ › + 12 เดือน · ตัวเลข = จำนวนงานของเดือน) */}
          <MonthPicker compact value={`${monthCursor}-01`} onChange={(iso) => setMonthCursor(iso.slice(0, 7))} counts={monthCounts} currentMonth={thisMonth} />
          {monthCursor !== thisMonth && (
            <button type="button" onClick={() => setMonthCursor(thisMonth)} className="text-xs font-semibold text-white underline">
              ‹ กลับเดือนนี้
            </button>
          )}
        </div>
      </GuideBand>

      <GuideOverlap>
        {/* จำนวนงานของเดือน + สัดส่วนสนามบินที่กรุ๊ปออกเดินทาง — บนสุดของหน้า ซ้อนขอบแถบหัว
            การ์ดกลางชุดเดียวกับหน้าหลักเจ้าหน้าที่ส่งกรุ๊ป (แสดงอย่างเดียว) */}
        <MonthJobsCard
          month={monthCursor}
          isCurrent={monthCursor === thisMonth}
          count={monthJobs.length}
          byAirport={airportBreakdown(monthJobs.map((p) => p.departureAirportCode))}
          centered
        />

        {!leader && (
          <div className="zego-guide-warnbox">
            <span className="zego-guide-warnbox__icon"><Icon name="warning" className="h-5 w-5" /></span>
            <p className="zego-guide-warnbox__sub">ยังไม่พบข้อมูลหัวหน้าทัวร์ที่ผูกกับบัญชีนี้ในชุดข้อมูลปัจจุบัน — เมนูด้านล่างยังใช้งานได้ตามปกติ</p>
          </div>
        )}

        {/* แบนเนอร์งานด่วน — เรื่องเดียวกับกระดิ่ง · แตะไปเรื่องแรกที่ต้องทำ */}
        {alerts.length > 0 && (
          <Link href={alerts[0].href} className="zego-guide-notice">
            <span className="zego-guide-notice__icon"><Icon name="bell" className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="zego-guide-notice__title">คุณมีงานที่ต้องดำเนินการ</span>
              <span className="zego-guide-notice__sub truncate">{alertSummary}</span>
            </span>
            <span className="zego-guide-notice__count">{alerts.length}</span>
          </Link>
        )}

        {/* เอกสารต้องตาม — แจ้งเตือนเฉพาะเอกสาร แยกจากงาน/ค่าใช้จ่าย */}
        {docAlerts.length > 0 && (
          <Link href="/guide/profile/documents" className="zego-guide-list zego-guide-row zego-guide-row--tall shadow-sm">
            <span className={cx('zego-guide-tile zego-guide-tile--lg', expiredDocs.length > 0 ? 'zego-guide-tile--red' : 'zego-guide-tile--gold')}>
              <Icon name="file" className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold zego-text">เอกสารต้องตาม {docAlerts.length} รายการ</span>
              <span className="zego-guide-row__sub truncate">
                {expiredDocs.length > 0 && `หมดอายุแล้ว: ${expiredDocs.map((a) => a.name).join(', ')}`}
                {expiredDocs.length > 0 && soonDocs.length > 0 && ' · '}
                {soonDocs.length > 0 && `ใกล้หมดอายุ: ${soonDocs.map((a) => a.name).join(', ')}`}
              </span>
            </span>
            <span className="zego-guide-link shrink-0">ดูเอกสาร</span>
          </Link>
        )}
      </GuideOverlap>

      {/* ซองของกรุ๊ปอื่นที่ฝากคุณนำส่ง (ถ้ามี) — แยกจากซองของกรุ๊ปตัวเอง */}
      <CarrierLeaderSection />

      {/* ซองเงินค้าง — แค่เตือน แล้วพาไปยืนยันที่หน้าการจัดการซองเงิน (ที่เดียวที่ยืนยันรับซอง) */}
      {ackGroups.length > 0 && (
        <Link href="/guide/finance/envelopes" className="zego-guide-list block">
          <div className="zego-guide-row">
            <span className="zego-guide-tile zego-guide-tile--gold"><Icon name="money" className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1 text-[15px] font-semibold zego-text">ซองเงินรอคุณ · {ackGroups.length} กรุ๊ป</span>
            <span className="zego-guide-link flex shrink-0 items-center">
              ไปยืนยันรับ
              <Icon name="chevronRight" className="h-4 w-4" />
            </span>
          </div>
          <ul>
            {ackGroups.map((p) => {
              const n = (list: typeof envToAck) => list.filter((e) => e.periodId === p.internalId).length;
              const parts = [
                n(envToAck) && `ถึงมือแล้ว ${n(envToAck)} ซอง`,
                n(envInTransit) && `กำลังนำมาส่ง ${n(envInTransit)} ซอง`,
                n(envAtFinance) && `ยังอยู่ที่การเงิน ${n(envAtFinance)} ซอง`,
                n(envReported) && `แจ้งไม่ได้รับ ${n(envReported)} ซอง`,
              ].filter(Boolean);
              return (
                <li key={p.internalId} className="px-[14px] py-2">
                  <span className="zego-guide-code block zego-text">{p.groupCode}</span>
                  <span className="zego-guide-row__sub">ออก {formatDate(p.startDate)} · {parts.join(' · ')}</span>
                </li>
              );
            })}
          </ul>
        </Link>
      )}

      {/* ปลายทางของเดือนที่เลือก — วงกลมธง เรียงมาก→น้อย · เกิน 4 เลื่อนดูได้ · อันดับหนึ่งที่ชัดเจนขอบเขียว */}
      <section className="space-y-2">
        <h2 className="zego-guide-h">ปลายทาง{monthWord}</h2>
        {destinations.length === 0 ? (
          <p className="text-sm zego-text-tertiary">{monthWord}ยังไม่มีงาน</p>
        ) : (
          <div
            // ไม่เกิน 4 ปลายทาง = จัดกึ่งกลาง · เกิน 4 = เลื่อนแนวนอนชิดซ้าย (กึ่งกลางตอนเลื่อนได้จะตัดวงแรกจนเลื่อนกลับไปดูไม่ได้)
            className={cx('zego-no-scrollbar -mx-1 flex snap-x overflow-x-auto px-1 pb-1', destinations.length <= 4 ? 'justify-center gap-3' : 'gap-1')}
            role="list"
            aria-label={`ปลายทาง${monthWord}`}
          >
            {destinations.map((d) => {
              const lead = !topTied && d.count === topCount && topCount > 0;
              return (
                <div key={d.key} role="listitem" className="flex w-[78px] shrink-0 snap-start flex-col items-center gap-1 text-center text-[13px]">
                  <FlagCircle alpha2={d.alpha2} fallback={d.label.slice(0, 2).toUpperCase()} selected={lead} label={d.label} />
                  <span className={cx('line-clamp-1 w-full zego-text', lead && 'font-semibold')} title={d.label}>{d.label}</span>
                  <span className={cx('zego-guide-display font-semibold', lead ? 'text-[var(--zego-brand-band)]' : 'zego-text-secondary')}>{d.count} งาน</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* รายการงานของเดือนที่เลือก — segmented สนามบิน + แถวงาน (แสดงอย่างเดียว ไม่ลิงก์) */}
      <section className="space-y-2">
        <h2 className="zego-guide-h">รายการงาน{monthWord}</h2>
        <div className="zego-guide-seg" role="group" aria-label="กรองตามสนามบิน">
          {[{ code: 'all', label: 'ทั้งหมด', count: monthJobs.length }, ...monthAirports.filter((a) => a.count > 0).map((a) => ({ code: a.code, label: airportText(a.code), count: a.count }))].map((f) => (
            <button
              key={f.code || 'none'}
              type="button"
              aria-pressed={airportFilter === f.code}
              onClick={() => setAirportFilter(f.code)}
              title={`${f.label} (${f.count})`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
        {listJobs.length === 0 ? (
          <p className="zego-guide-list px-3 py-4 text-center text-sm zego-text-tertiary">
            {monthJobs.length === 0 ? `${monthWord}ไม่มีงาน` : 'ไม่มีงานที่ตรงกับตัวกรอง'}
          </p>
        ) : (
          <ul className="zego-guide-list">
            {listJobs.map((p) => {
              const code = (p.departureAirportCode ?? '').trim().toUpperCase();
              // ไปกับกลับคนละสนามบิน (เช่น ไป BKK กลับ DMK) — แสดงทั้งคู่
              const ap = tripAirports(p, isThaiAirport);
              const outCode = ap.out || code;
              const twoAirports = !!ap.back && ap.back !== outCode;
              // สถานะตามช่วงทริป — ยังไม่ออก / กำลังเดินทาง / จบทริปแล้ว
              const stage = tripEnded(p, realToday)
                ? { label: 'จบทริปแล้ว', tone: 'slate' as const }
                : tripStarted(p, realToday) ? { label: 'กำลังเดินทาง', tone: 'green' as const } : { label: 'รอเดินทาง', tone: 'amber' as const };
              const dest = resolveDestination(p.countryName, p.groupCode);
              const flight = outboundFlight(p);
              const env = envelopeNoticeOf(p.internalId);
              return (
                <li key={p.internalId} className="zego-guide-row zego-guide-row--tall zego-guide-row--top">
                  <FlagTile alpha2={dest.alpha2} fallback={dest.label.slice(0, 2).toUpperCase()} label={dest.label} />
                  <span className="min-w-0 flex-1">
                    <span className="zego-guide-code block truncate zego-text">{p.groupCode}</span>
                    <span className="zego-guide-row__sub tabular-nums">
                      {formatDate(p.startDate)} – {formatDate(p.endDate)}
                      {outCode && ` · ${twoAirports ? `${outCode} → ${ap.back}` : outCode}`}
                    </span>
                    {/* ไฟลท์ขาไป + เวลาเครื่องออก — แหล่งเดียวกับตารางงานเจ้าหน้าที่ส่งกรุ๊ป (เที่ยวบินแรก · periodTurnaround) */}
                    {(flight.no || flight.time) && (
                      <span className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-xs zego-text-tertiary">
                        <Icon name="plane" className="h-3 w-3 shrink-0" />
                        {flight.no && <span className="font-medium tabular-nums">{flight.no}</span>}
                        {flight.no && flight.time && <span>·</span>}
                        {flight.time && <span className="tabular-nums">ออก {flight.time}</span>}
                      </span>
                    )}
                    {/* ซองเงินของกรุ๊ปนี้ที่ต้องรับ — ต้องกดยืนยัน = ทอง · กำลังมา = เทา · แจ้งไม่ได้รับ = แดง */}
                    {env && (
                      <span className={cx('zego-chip mt-1 gap-1 text-[11px]', NOTICE_TONE[env.tone])}>
                        <Icon name="money" className="h-3 w-3 shrink-0" />
                        {env.text}
                      </span>
                    )}
                  </span>
                  <span className={cx('zego-chip shrink-0', STAGE_CHIP[stage.tone])}>{stage.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* สายการบินของเดือนที่เลือก — แยกตามสายการบิน เรียงมาก→น้อย · เกิน 4 เลื่อนดูได้ */}
      <AirlinesCard month={monthCursor} isCurrent={monthCursor === thisMonth} items={airlineBreakdown(monthJobs)} />
    </div>
  );
}
