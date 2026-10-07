'use client';

/**
 * หน้าหลัก (Personal Workspace) ของพอร์ทัลหัวหน้าทัวร์ — /guide
 *
 * หน้าสรุป ไม่ใช่ทางลัดเมนู (เมนูอยู่แถบล่างแล้ว):
 *   ส่วนหัว — หัวข้อ + วันนี้ · เลือกเดือน (ตารางปฏิทินรายเดือน) — แบบเดียวกับหน้าหลักเจ้าหน้าที่ส่งกรุ๊ป
 *   1) จำนวนงานของเดือน + แยกสนามบินที่กรุ๊ปออกเดินทาง (การ์ดกลาง MonthJobsCard · แสดงอย่างเดียว ไม่ลิงก์)
 *   2) ปลายทางของเดือน — แยกประเทศ เรียงมาก→น้อย · เกิน 4 เลื่อนดูได้ (DestinationsCard)
 *   2.1) สายการบินของเดือน — แยกสายการบิน เรียงมาก→น้อย · เกิน 4 เลื่อนดูได้ (AirlinesCard)
 *   3) รายการงานของเดือน — กรองทั้งหมด / สุวรรณภูมิ / ดอนเมือง · วันที่ (ไป/กลับ 2 บรรทัด) · สนามบิน · รหัสกรุ๊ป (+ ไฟลท์ขาไป · เวลาเครื่องออก · ซองเงิน) · สถานะช่วงทริป (แสดงอย่างเดียว)
 *   4) มีซองเงินค้าง (รอรับ / กำลังมา / แจ้งไม่ได้รับ) → การ์ดเตือนกรุ๊ปละบรรทัด แตะไปยืนยันที่หน้าการจัดการซองเงิน
 *      (ยืนยันรับซองทำที่เดียว — การ์ดซองเงินชุดเดียวกับหน้ารายละเอียดงาน ไม่มีหน้าตาที่สองที่หน้าหลัก)
 * ไม่มี checklist/attendance/customer-care ที่เพิ่มภาระรายวัน (ตัดออกแล้วตามที่คุยกัน)
 */

import Link from 'next/link';
import { CarrierLeaderSection } from './CarrierLeaderSection';
import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { useLeaderDocumentsView } from '@/lib/useLeaderDocuments';
import { listDocumentExpiryAlerts } from '@/lib/logic/documentExpiryAlerts';
import { formatDate, toISODate } from '@/lib/format';
import { leaderEnvelopeState } from '@/lib/logic/cashEnvelope';
import { Icon } from '@/components/ui/Icon';
import { MonthJobsCard } from '@/components/portal/MonthJobsCard';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { airportText, airportTone, thaiMonthTitle } from '@/components/portal/MonthJobsCard';
import { tripEnded, tripStarted } from '@/lib/logic/tripPhase';
import { Card, Callout, StatusBadge, cx } from '@/components/ui/Primitives';
import { DestinationsCard } from '@/components/portal/DestinationsCard';
import { destinationBreakdown } from '@/lib/logic/destinations';
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

/** สีป้ายแจ้งเตือนซองเงินในรายการงาน */
const NOTICE_TONE = {
  red: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
  amber: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
  slate: 'zego-surface-soft-bg zego-text-secondary',
} as const;

export default function GuideHomePage() {
  const { currentUser, leaders, today, envelopes } = useDemo();

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

  return (
    <div className="space-y-4">
      {/* ส่วนหัว — แบบเดียวกับหน้าหลักเจ้าหน้าที่ส่งกรุ๊ป: หัวข้อ + วันนี้ · เลือกเดือน (มีผลกับการ์ดจำนวนงาน) */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold zego-text">หน้าหลัก</h1>
          <p className="text-xs zego-text-tertiary">สรุปงานหัวหน้าทัวร์ · วันนี้ {formatDate(realToday)}</p>
        </div>
        {/* เลือกเดือนจากตารางปฏิทินรายเดือน (ปี ‹ › + 12 เดือน · ตัวเลข = จำนวนงานของเดือน) */}
        <MonthPicker compact value={`${monthCursor}-01`} onChange={(iso) => setMonthCursor(iso.slice(0, 7))} counts={monthCounts} currentMonth={thisMonth} />
      </div>

      {!leader && (
        <Card className="bg-amber-50 ring-1 ring-amber-200">
          <p className="text-sm zego-text-warning">
            ยังไม่พบข้อมูลหัวหน้าทัวร์ที่ผูกกับบัญชีนี้ในชุดข้อมูลปัจจุบัน — ทางลัดด้านล่างยังใช้งานได้ตามปกติ
          </p>
        </Card>
      )}

      {/* เอกสารต้องตาม — แจ้งเตือนเฉพาะเอกสาร แยกจากงาน/ค่าใช้จ่าย */}
      {docAlerts.length > 0 && (
        <Link href="/guide/profile/documents" className="block">
          <Callout
            tone={expiredDocs.length > 0 ? 'red' : 'amber'}
            title={`เอกสารต้องตาม ${docAlerts.length} รายการ`}
          >
            {expiredDocs.length > 0 && `หมดอายุแล้ว: ${expiredDocs.map((a) => a.name).join(', ')}`}
            {expiredDocs.length > 0 && soonDocs.length > 0 && ' · '}
            {soonDocs.length > 0 && `ใกล้หมดอายุ: ${soonDocs.map((a) => a.name).join(', ')}`}
          </Callout>
        </Link>
      )}

      {/* 1) จำนวนงานของเดือนที่เลือก + สัดส่วนสนามบินที่กรุ๊ปออกเดินทาง — การ์ดกลางชุดเดียวกับหน้าหลักเจ้าหน้าที่ส่งกรุ๊ป */}
      {/* แสดงอย่างเดียว — แตะแล้วไม่ไปหน้าอื่น */}
      <MonthJobsCard
        month={monthCursor}
        isCurrent={monthCursor === thisMonth}
        count={monthJobs.length}
        byAirport={airportBreakdown(monthJobs.map((p) => p.departureAirportCode))}
      />
      {monthCursor !== thisMonth && (
        <button type="button" onClick={() => setMonthCursor(thisMonth)} className="-mt-2 text-xs font-medium zego-text-success hover:underline">‹ กลับเดือนนี้</button>
      )}

      {/* ปลายทางของเดือนที่เลือก — แยกตามประเทศ เรียงมาก→น้อย · เกิน 4 ปลายทางเลื่อนดูได้ */}
      <DestinationsCard
        month={monthCursor}
        isCurrent={monthCursor === thisMonth}
        items={destinationBreakdown(monthJobs)}
      />

      {/* สายการบินของเดือนที่เลือก — แยกตามสายการบิน เรียงมาก→น้อย · เกิน 4 เลื่อนดูได้ */}
      <AirlinesCard month={monthCursor} isCurrent={monthCursor === thisMonth} items={airlineBreakdown(monthJobs)} />

      {/* ซองของกรุ๊ปอื่นที่ฝากคุณนำส่ง (ถ้ามี) — แยกจากซองของกรุ๊ปตัวเอง */}
      <CarrierLeaderSection />

      {/* 3) ซองเงินค้าง — แค่เตือน แล้วพาไปยืนยันที่หน้าการจัดการซองเงิน (ที่เดียวที่ยืนยันรับซอง) */}
      {ackGroups.length > 0 && (
        <Link href="/guide/finance/envelopes" className="block">
          <Card padded={false} className="border-amber-200 hover:border-amber-300">
            <div className="zego-divider-bottom flex items-center justify-between gap-2 bg-amber-50 px-4 py-2.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                <Icon name="money" className="h-4 w-4" />
                ซองเงินรอคุณ · {ackGroups.length} กรุ๊ป
              </p>
              <span className="flex items-center gap-0.5 text-xs font-medium text-amber-900">
                ไปยืนยันรับ
                <Icon name="chevronRight" className="h-4 w-4" />
              </span>
            </div>
            <ul className="divide-y divide-[var(--zego-border-soft)]">
              {ackGroups.map((p) => {
                const n = (list: typeof envToAck) => list.filter((e) => e.periodId === p.internalId).length;
                const parts = [
                  n(envToAck) && `ถึงมือแล้ว ${n(envToAck)} ซอง`,
                  n(envInTransit) && `กำลังนำมาส่ง ${n(envInTransit)} ซอง`,
                  n(envAtFinance) && `ยังอยู่ที่การเงิน ${n(envAtFinance)} ซอง`,
                  n(envReported) && `แจ้งไม่ได้รับ ${n(envReported)} ซอง`,
                ].filter(Boolean);
                return (
                  <li key={p.internalId} className="px-4 py-2">
                    <p className="text-sm font-medium zego-text">{p.groupCode}</p>
                    <p className="text-xs zego-text-tertiary">ออก {formatDate(p.startDate)} · {parts.join(' · ')}</p>
                  </li>
                );
              })}
            </ul>
          </Card>
        </Link>
      )}

      {/* รายการงานของเดือนที่เลือก — หัวแบบเดียวกับ "รายการงานวันนี้" ของเจ้าหน้าที่ส่งกรุ๊ป · แสดงอย่างเดียว ไม่ลิงก์ */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="list" className="h-5 w-5 text-emerald-700" />
          <h2 className="text-sm font-semibold zego-text">{monthCursor === thisMonth ? 'รายการงานเดือนนี้' : `รายการงาน ${thaiMonthTitle(monthCursor)}`}</h2>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="กรองตามสนามบิน">
          {[{ code: 'all', label: 'ทั้งหมด', count: monthJobs.length }, ...monthAirports.map((a) => ({ code: a.code, label: airportText(a.code), count: a.count }))].map((f) => (
            <button
              key={f.code || 'none'}
              type="button"
              aria-pressed={airportFilter === f.code}
              onClick={() => setAirportFilter(f.code)}
              className={cx('rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-5 transition', airportFilter === f.code ? 'bg-emerald-600 text-white' : 'zego-surface-soft-bg zego-text-secondary hover:bg-emerald-50')}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
        {listJobs.length === 0 ? (
          <p className="rounded-lg zego-surface-soft-bg px-3 py-4 text-center text-sm zego-text-tertiary">
            {monthJobs.length === 0 ? `${monthCursor === thisMonth ? 'เดือนนี้' : `${thaiMonthTitle(monthCursor)} `}ไม่มีงาน` : 'ไม่มีงานที่ตรงกับตัวกรอง'}
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[11px] zego-text-tertiary">
                <th className="whitespace-nowrap py-1.5 pr-2 font-medium">วันที่</th>
                <th className="whitespace-nowrap py-1.5 pr-2 text-center font-medium">สนามบิน</th>
                <th className="py-1.5 pr-2 font-medium">รหัสกรุ๊ป</th>
                <th className="py-1.5 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--zego-border-soft)]">
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
                return (
                  <tr key={p.internalId} className="align-top">
                    {/* 2 บรรทัด — วันไป (หนา) / วันกลับ (เทา) · ไม่มีป้ายคำ ให้กระชับ */}
                    <td className="whitespace-nowrap py-2 pr-2 tabular-nums">
                      <span className="block font-semibold zego-text">{formatDate(p.startDate)}</span>
                      <span className="block zego-text-secondary">{formatDate(p.endDate)}</span>
                    </td>
                    {/* สนามบิน — กึ่งกลางทั้งแนวนอนและแนวตั้งของแถว (แถวสูง 2 บรรทัดจากวันที่/ไฟลท์) */}
                    <td className="py-2 pr-2 text-center align-middle">
                      {twoAirports ? (
                        <span className="inline-flex flex-col items-center gap-1">
                          <span className="flex items-center gap-1"><span className={cx('rounded px-1.5 py-0.5 text-[11px] font-semibold', airportTone(outCode).badge)}>{outCode}</span></span>
                          <span className="flex items-center gap-1"><span className={cx('rounded px-1.5 py-0.5 text-[11px] font-semibold', airportTone(ap.back).badge)}>{ap.back}</span></span>
                        </span>
                      ) : (
                        <span className={cx('rounded px-1.5 py-0.5 text-[11px] font-semibold', airportTone(outCode).badge)}>{outCode || '—'}</span>
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      <span className="block whitespace-nowrap font-medium zego-text">{p.groupCode}</span>
                      {/* ไฟลท์ขาไป + เวลาเครื่องออก — แหล่งเดียวกับตารางงานเจ้าหน้าที่ส่งกรุ๊ป (เที่ยวบินแรก · periodTurnaround) */}
                      {(() => {
                        const f = outboundFlight(p);
                        return (f.no || f.time) && (
                          <span className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[11px] zego-text-secondary">
                            <Icon name="plane" className="h-3 w-3 shrink-0 zego-text-tertiary" />
                            {f.no && <span className="font-medium tabular-nums">{f.no}</span>}
                            {f.no && f.time && <span className="zego-text-tertiary">·</span>}
                            {f.time && <span className="tabular-nums">ออก {f.time}</span>}
                          </span>
                        );
                      })()}
                      {/* ซองเงินของกรุ๊ปนี้ที่ต้องรับ — ต้องกดยืนยัน = เหลือง · กำลังมา = เทา · แจ้งไม่ได้รับ = แดง */}
                      {(() => {
                        const n = envelopeNoticeOf(p.internalId);
                        return n && (
                          <span className={cx('mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium', NOTICE_TONE[n.tone])}>
                            <Icon name="money" className="h-3 w-3 shrink-0" />
                            {n.text}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-2"><StatusBadge meta={stage} size="sm" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
