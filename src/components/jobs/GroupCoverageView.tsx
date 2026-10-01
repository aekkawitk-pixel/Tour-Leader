'use client';

/**
 * มุมมองรายกรุ๊ป — โหมดที่ 3 ของเมนู "การจัดสเก็ต"
 *
 * สองโหมดแรกมองจาก "คน" (แถวหนึ่ง = คนหนึ่ง) ซึ่งตอบไม่ได้ว่ากรุ๊ปไหนยังขาดอะไร
 * ต้องไล่ดูทีละโหมดแล้วจำเอาเองว่ากรุ๊ปนี้มีหัวหน้าทัวร์แล้วหรือยัง มีคนไปส่งหรือยัง
 * โหมดนี้จึงกลับด้าน — แถวหนึ่ง = กรุ๊ปหนึ่ง เห็นทั้งสองฝั่งพร้อมกันในบรรทัดเดียว
 *
 * ใช้เป็นรายการตรวจก่อนปิดเดือน ไม่ใช่ที่จัดงานหลัก
 * (จัดคนไปส่งได้ในตัว ส่วนหัวหน้าทัวร์ส่งไปที่โหมดจัดหัวหน้าทัวร์ซึ่งมีเครื่องมือครบกว่า)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { endOfMonth, formatDate, startOfMonth } from '@/lib/format';
import { Button, Card, cx, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { SearchBox } from '@/components/ui/FormField';
import { MonthPicker, nextMonthStart, nextMonthStartFromNow } from '@/components/ui/MonthPicker';
import { useWideContent } from '@/components/layout/AppShell';
import { canEditSendOffSchedule } from '@/lib/permissions';
import { BOARD_STATUS } from '@/lib/logic/guideBoard';
import { leaderDisplayName } from '@/lib/logic/leaderExpertise';
import { getAssignablePeriods, getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { loadSendOffStaff } from '@/services/sendOffStaffStore';
import { assignSendOff, confirmSendOff, loadSendOffAssignments, type SendOffAssignment } from '@/services/sendOffAssignmentStore';
import { loadManualFlightTimes, setManualFlightTime, type ManualFlightTimes } from '@/services/sendOffFlightTimeStore';
import { loadManualAirports, setManualAirport, type ManualAirports } from '@/services/sendOffManualAirportStore';
import { loadMonthlyCaps, monthlyCapFor, type MonthlyCaps } from '@/services/sendOffMonthlyCapStore';
import { buildSendOffJobs, chipTime, jobIssue, jobOverlapWarning, jobStatus, sendOffPeriodPool, type SendOffJob } from '@/lib/logic/sendOffJobs';
import { DEFAULT_SEND_OFF_RULES, type SendOffRules } from '@/lib/logic/sendOffRules';
import { loadSendOffRules } from '@/services/sendOffRulesStore';
import { getHolidayMap } from '@/services/holidayService';
import { dayOffLookup } from '@/lib/logic/dayOff';
import { checkSendOff, sendOffStaffName, type SendOffStaff } from '@/lib/logic/sendOffStaff';
import { SendOffStaffPicker } from '@/components/jobs/SendOffStaffPicker';
import type { BoardStatus } from '@/lib/logic/guideBoard';
import type { TourLeader } from '@/types';

/** จำนวนแถวที่แสดงต่อครั้ง — เดือนหนึ่งมีได้ 400+ กรุ๊ป วาดครบทีเดียวจะหน่วง */
const PAGE_SIZE = 100;

/** ตัวกรอง "ยังขาดอะไร" — ตัวเลือกที่ผู้จัดถามจริงตอนตรวจก่อนปิดเดือน */
type Gap = 'all' | 'incomplete' | 'noLeader' | 'noSendOff' | 'issue' | 'complete';

const GAP_LABEL: Record<Gap, string> = {
  all: 'ทั้งหมด',
  incomplete: 'ยังไม่ครบ',
  noLeader: 'ขาดหัวหน้าทัวร์',
  noSendOff: 'ขาดคนไปส่ง',
  issue: 'ต้องตรวจ',
  complete: 'ครบแล้ว',
};

const GAP_ORDER: Gap[] = ['incomplete', 'noLeader', 'noSendOff', 'issue', 'complete', 'all'];

/** 1 แถวของตาราง = 1 กรุ๊ป พร้อมทั้งสองฝั่ง */
interface GroupRow {
  job: SendOffJob;
  leader: TourLeader | null;
  leaderStatus: BoardStatus;
  /** ฝั่งนั้นถือว่า "มีคนแล้ว" หรือยัง — ปฏิเสธแล้วไม่นับว่ามี */
  hasLeader: boolean;
  hasSendOff: boolean;
  issue: string | null;
  /** เวลานัดทับซ้อนกับงานอื่นของคนไปส่งคนเดียวกัน (สนามบินเดียวกัน) — จัดได้ตามนโยบาย ไม่ใช่ issue */
  overlap: string | null;
}

export function GroupCoverageView() {
  useWideContent();
  const { leaders, today, currentUser, pushToast } = useDemo();
  const router = useRouter();
  /*
   * คอลัมน์เดียวที่แก้ได้ในหน้านี้คือ "เจ้าหน้าที่ส่งกรุ๊ป" (ฝั่งหัวหน้าทัวร์แค่ลิงก์ไปจัดที่หน้าจัดหัวหน้าทัวร์)
   * จึงใช้สิทธิ์เดียวกับตารางเจ้าหน้าที่ส่งกรุ๊ป — เฉพาะผู้จัดสเก็ต · ฝ่ายจัดหัวหน้าทัวร์ดูได้แต่จัดไม่ได้
   * (เดิมใช้ job.assignLeader ทำให้ coordinator ทุกคนจัดคนไปส่งจากหน้านี้ได้ ทั้งที่ตารางหลักปิดไว้)
   */
  const canAssign = canEditSendOffSchedule(currentUser);

  /* ค่าเริ่มต้น = เดือนปัจจุบัน + 1 เสมอ · ตั้งตอน mount เพราะหน้านี้ถูก prerender ตอน build */
  const [cursor, setCursor] = useState(() => nextMonthStart(today));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCursor(nextMonthStartFromNow());
  }, []);

  const [search, setSearch] = useState('');
  const [gap, setGap] = useState<Gap>('incomplete');
  /*
    จำนวนแถวที่กางไว้ ผูกกับตัวกรองชุดที่กางมัน
    เปลี่ยนตัวกรอง/คำค้น/เดือน แล้วจำนวนต้องกลับไปเริ่มใหม่เอง โดยไม่ต้องรีเซ็ตใน effect
    (รีเซ็ตใน effect จะ render รอบแรกด้วยจำนวนเก่าก่อนแล้วค่อยกระตุก)
  */
  const [page, setPage] = useState({ key: '', limit: PAGE_SIZE });
  const [staff, setStaff] = useState<SendOffStaff[]>([]);
  const [sendOffAssignments, setSendOffAssignments] = useState<SendOffAssignment[]>([]);
  const [manualTimes, setManualTimes] = useState<ManualFlightTimes>({});
  const [manualAirports, setManualAirports] = useState<ManualAirports>({});
  const [monthlyCaps, setMonthlyCaps] = useState<MonthlyCaps>({});
  const [rules, setRules] = useState<SendOffRules>(DEFAULT_SEND_OFF_RULES);
  const [leaderAssignments, setLeaderAssignments] = useState<ReturnType<typeof loadActiveGuideAssignments>>([]);
  const [picking, setPicking] = useState<SendOffJob | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStaff(loadSendOffStaff());
    setSendOffAssignments(loadSendOffAssignments());
    setManualTimes(loadManualFlightTimes());
    setManualAirports(loadManualAirports());
    setMonthlyCaps(loadMonthlyCaps());
    setRules(loadSendOffRules());
    setLeaderAssignments(loadActiveGuideAssignments());
  }, []);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  /** เพดานกรุ๊ปของคนนี้ในเดือนที่กำลังดูอยู่ — null = ไม่จำกัด (ไม่เคยตั้งไว้เดือนนี้) */
  const capOf = useCallback(
    (staffId: string) => monthlyCapFor(monthlyCaps, staffId, monthStart),
    [monthlyCaps, monthStart],
  );
  /* วันหยุดของช่วงที่ดูอยู่ — เดือนธันวาคมคาบไปปีถัดไปไม่ได้ แต่เผื่อไว้ให้ครบ */
  const dayOffOf = useMemo(
    () => dayOffLookup(getHolidayMap([Number(monthStart.slice(0, 4)), Number(monthEnd.slice(0, 4))])),
    [monthStart, monthEnd],
  );
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const leaderById = useMemo(() => new Map(leaders.map((l) => [l.id, l])), [leaders]);

  /*
    มุมมองนี้มองจากกรุ๊ป จึงคัดด้วยวันออกเดินทางตามปกติ
    แต่ต้องใช้กองเดียวกับที่จัดได้จริง ไม่งั้นยอด "ยังไม่ครบ" จะรวมกรุ๊ป NO SELL
    ที่กดจัดไม่ได้อยู่ดี แล้วรายการตรวจไม่มีวันเคลียร์หมด
  */
  const jobs = useMemo<SendOffJob[]>(() => {
    const assignableIds = new Set(getAssignablePeriods().map((p) => p.internalId));
    const periods = sendOffPeriodPool({
      periods: getTourPeriods({ monthStart }).filter((p) => p.startDate >= monthStart && p.startDate <= monthEnd),
      assignablePeriodIds: assignableIds,
      assignments: sendOffAssignments,
    });
    return buildSendOffJobs({ periods, assignments: sendOffAssignments, staffById, manualTimes, manualAirports, rules, dayOffOf });
  }, [sendOffAssignments, monthStart, monthEnd, staffById, manualTimes, manualAirports, rules, dayOffOf]);

  const rows = useMemo<GroupRow[]>(() => {
    const leaderByPeriod = new Map(leaderAssignments.map((a) => [a.periodId, a]));
    return jobs.map((job) => {
      const la = leaderByPeriod.get(job.period.internalId);
      const leaderStatus: BoardStatus = la?.assignmentStatus ?? 'UNASSIGNED';
      return {
        job,
        leader: la ? leaderById.get(la.tourLeaderId) ?? null : null,
        leaderStatus,
        // ปฏิเสธ = ยังไม่มีคนจริง ต้องนับเป็นงานค้าง ไม่ใช่ครบแล้ว (หัวหน้าทัวร์เท่านั้นที่ยังมีสถานะนี้)
        hasLeader: Boolean(la) && leaderStatus !== 'DECLINED' && leaderStatus !== 'REASSIGN_REQUIRED',
        // ที่ยังรอคอนเฟิร์มไม่นับว่า "มีคนแล้ว" จริง ๆ จนกว่าผู้จัดจะกดยืนยัน — ต่างจาก hasLeader ที่ไม่มีขั้นรอคอนเฟิร์มแยกในหน้านี้
        hasSendOff: job.assignment?.status === 'CONFIRMED',
        issue: jobIssue(job),
        overlap: jobOverlapWarning(job),
      };
    });
  }, [jobs, leaderAssignments, leaderById]);

  const counts = useMemo(() => ({
    all: rows.length,
    incomplete: rows.filter((r) => !r.hasLeader || !r.hasSendOff).length,
    noLeader: rows.filter((r) => !r.hasLeader).length,
    noSendOff: rows.filter((r) => !r.hasSendOff).length,
    issue: rows.filter((r) => r.issue !== null).length,
    complete: rows.filter((r) => r.hasLeader && r.hasSendOff).length,
  }), [rows]);

  const filterKey = `${gap}|${search.trim()}|${monthStart}`;
  const limit = page.key === filterKey ? page.limit : PAGE_SIZE;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (gap === 'incomplete' && r.hasLeader && r.hasSendOff) return false;
      if (gap === 'noLeader' && r.hasLeader) return false;
      if (gap === 'noSendOff' && r.hasSendOff) return false;
      if (gap === 'issue' && r.issue === null) return false;
      if (gap === 'complete' && !(r.hasLeader && r.hasSendOff)) return false;
      if (!q) return true;
      return `${r.job.period.groupCode} ${r.job.period.countryName} ${r.job.period.tourName}`.toLowerCase().includes(q);
    });
  }, [rows, gap, search]);

  const doAssign = (job: SendOffJob, s: SendOffStaff) => {
    const check = checkSendOff(s.staffType, job.flightTime, {
      leadHours: rules.leadHours,
      workStart: rules.employeeWorkStart,
      workEnd: rules.employeeWorkEnd,
      isDayOff: Boolean(job.dayOff),
    });
    try {
      setSendOffAssignments(assignSendOff({
        periodId: job.period.internalId,
        staffId: s.id,
        arrivalTime: check.arrivalTime,
        dayOffset: check.dayOffset,
        by: currentUser.name,
        at: new Date().toISOString().slice(0, 16),
      }));
      setPicking(null);
      pushToast('success', `จัด ${sendOffStaffName(s)} ไปส่ง ${job.period.groupCode} แล้ว (รอคอนเฟิร์ม — คุยกับเจ้าหน้าที่แล้วค่อยกดยืนยัน)`);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  /** ยืนยันว่าเจ้าหน้าที่รับงานแล้ว — กดหลังคุยกับเจ้าหน้าที่นอกระบบ (โทร/LINE) เสร็จเท่านั้น */
  const doConfirm = (job: SendOffJob) => {
    if (!job.assignment) return;
    try {
      setSendOffAssignments(confirmSendOff(job.assignment.assignmentId, currentUser.name, new Date().toISOString().slice(0, 16)));
      pushToast('success', `ยืนยันรับงาน ${job.period.groupCode} แล้ว`);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  const saveFlightTime = (job: SendOffJob, time: string) => {
    try {
      setManualTimes(setManualFlightTime(job.period.internalId, time));
      setPicking(null);
      pushToast('success', time
        ? `บันทึกเวลาเครื่องออก ${time} ของ ${job.period.groupCode} แล้ว`
        : `ล้างเวลาเครื่องออกของ ${job.period.groupCode} แล้ว`);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  const saveAirport = (job: SendOffJob, code: string) => {
    try {
      setManualAirports(setManualAirport(job.period.internalId, code));
      setPicking(null);
      pushToast('success', `บันทึกสนามบิน ${code.toUpperCase()} ของ ${job.period.groupCode} แล้ว`);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <MonthPicker value={cursor} onChange={setCursor} hint="เลือกเดือนที่กรุ๊ปออกเดินทาง" />
          <SearchBox
            value={search}
            onChange={setSearch}
            label="ค้นหากรุ๊ป"
            placeholder="ค้นหารหัสกรุ๊ป ประเทศ หรือชื่อโปรแกรม"
            className="min-w-[18rem] flex-1"
            onClear={() => setSearch('')}
          />
        </div>

        {/* ตัวกรองคือคำถามที่ผู้จัดถามจริงตอนตรวจก่อนปิดเดือน ไม่ใช่รายการสถานะดิบ */}
        <div className="zego-divider-top mt-3 flex flex-wrap items-center gap-1.5 pt-2">
          {GAP_ORDER.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={gap === g}
              onClick={() => setGap(g)}
              className={cx(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                gap === g ? 'zego-badge--info' : 'zego-surface-bg zego-border-color zego-text-secondary zego-hover-surface',
                g === 'issue' && counts.issue > 0 && gap !== g && 'border-rose-300 zego-text-danger',
              )}
            >
              {GAP_LABEL[g]} ({counts[g]})
            </button>
          ))}
        </div>
      </Card>

      {shown.length === 0 ? (
        <EmptyState
          icon="checklist"
          /*
            counts.all === 0 = เดือนนี้ไม่มีกรุ๊ปในข้อมูลเลย (เช่นข้อมูลตัวอย่าง Demo ไม่ครอบคลุมเดือนนี้)
            ต้องแยกจากกรณี "จัดครบทุกกรุ๊ปแล้ว" (มีกรุ๊ป แต่ทุกกรุ๊ปมีหัวหน้าทัวร์+คนไปส่งครบ) ไม่งั้นข้อความจะบอกผิดว่า
            "จัดครบทุกกรุ๊ปแล้ว" ทั้งที่จริงเดือนนี้ไม่มีข้อมูลกรุ๊ปให้จัดตั้งแต่แรก
          */
          title={
            counts.all === 0
              ? 'ไม่มีข้อมูลกรุ๊ปในเดือนนี้'
              : gap === 'incomplete' ? 'จัดครบทุกกรุ๊ปของเดือนนี้แล้ว' : 'ไม่มีกรุ๊ปตามตัวกรองนี้'
          }
          description={
            counts.all === 0
              ? 'ข้อมูลตัวอย่างของ Demo อาจไม่ครอบคลุมเดือนนี้ — ลองเลือกเดือนอื่น หรือดึงข้อมูลล่าสุดที่เมนู "โปรแกรมทัวร์ (Zego)"'
              : gap === 'incomplete' ? 'ทุกกรุ๊ปมีทั้งหัวหน้าทัวร์และคนไปส่งแล้ว' : 'ลองล้างคำค้นหรือเลือกตัวกรองอื่น'
          }
        />
      ) : (
        <div className="zego-card-surface overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="sticky top-0 z-10 zego-surface-soft-bg text-left text-xs font-semibold zego-text-tertiary">
              <tr>
                <th className="px-3 py-2">กรุ๊ป</th>
                <th className="px-3 py-2">เดินทาง</th>
                <th className="px-3 py-2">หัวหน้าทัวร์</th>
                <th className="px-3 py-2">เจ้าหน้าที่ส่งกรุ๊ป</th>
                <th className="px-3 py-2 text-right">ตรวจ</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, limit).map((r) => (
                <tr key={r.job.assignment?.assignmentId ?? r.job.period.internalId} className="zego-divider-top zego-hover-surface align-top">
                  <td className="px-3 py-2">
                    <p className="font-semibold zego-text">{r.job.period.groupCode}</p>
                    <p className="max-w-[22rem] truncate text-xs zego-text-tertiary" title={r.job.period.tourName}>
                      {r.job.period.countryName} · {r.job.period.tourName}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs zego-text-secondary">
                    <p>{formatDate(r.job.period.startDate)} – {formatDate(r.job.period.endDate)}</p>
                    <p className="zego-text-tertiary">
                      {r.job.flightTime
                        ? `บิน ${r.job.flightTime}${r.job.flightSource === 'manual' ? ' (กรอกเอง)' : ''} · ถึงสนามบิน ${chipTime(r.job)}`
                        : 'ยังไม่รู้เวลาบิน'}
                    </p>
                  </td>

                  {/* ฝั่งหัวหน้าทัวร์ — ดูอย่างเดียว แล้วส่งไปจัดที่โหมดที่มีเครื่องมือครบ */}
                  <td className="px-3 py-2">
                    {r.leader ? (
                      <>
                        <p className="truncate zego-text">{leaderDisplayName(r.leader)}</p>
                        <StatusBadge meta={BOARD_STATUS[r.leaderStatus]} size="sm" />
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => router.push(`/jobs?period=${encodeURIComponent(r.job.period.internalId)}`)}
                        className="zego-border-color rounded-lg border border-dashed px-2 py-1 text-xs zego-text-tertiary hover:border-[var(--zego-primary-400)] hover:text-[var(--zego-primary-600)]"
                      >
                        ยังไม่ระบุ — ไปจัดหัวหน้าทัวร์
                      </button>
                    )}
                  </td>

                  {/* ฝั่งเจ้าหน้าที่ส่งกรุ๊ป — จัดได้ในตัวเลย เพราะเป็นงานที่ทำจบได้ในบรรทัดเดียว */}
                  <td className="px-3 py-2">
                    {r.job.staff ? (
                      <>
                        <p className="truncate zego-text">{sendOffStaffName(r.job.staff)}</p>
                        <StatusBadge meta={BOARD_STATUS[jobStatus(r.job)]} size="sm" />
                        {canAssign && r.job.assignment?.status === 'PENDING_CONFIRMATION' && (
                          <button
                            type="button"
                            onClick={() => doConfirm(r.job)}
                            className="mt-1 block text-[11px] font-medium zego-text-info hover:underline"
                          >
                            ยืนยันรับงาน
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={!canAssign}
                        onClick={() => setPicking(r.job)}
                        className={cx(
                          'zego-border-color rounded-lg border border-dashed px-2 py-1 text-xs',
                          canAssign ? 'hover:border-[var(--zego-primary-400)] hover:text-[var(--zego-primary-600)]' : 'cursor-not-allowed',
                          'zego-text-tertiary',
                        )}
                      >
                        ยังไม่มีคนไปส่ง{canAssign ? ' — เลือกคน' : ''}
                      </button>
                    )}
                  </td>

                  <td className="px-3 py-2 text-right">
                    {r.issue ? (
                      <span className="inline-flex max-w-[16rem] items-start gap-1 text-left text-xs zego-text-danger" title={r.issue}>
                        <span className="font-bold">!</span>
                        <span className="truncate">{r.issue}</span>
                      </span>
                    ) : r.overlap ? (
                      <span className="inline-flex max-w-[16rem] items-start gap-1 text-left text-xs zego-text-orange" title={r.overlap}>
                        <span className="font-bold">⚠</span>
                        <span className="truncate">{r.overlap}</span>
                      </span>
                    ) : r.hasLeader && r.hasSendOff ? (
                      <span className="text-xs font-medium zego-text-success">ครบ</span>
                    ) : (
                      <span className="text-xs zego-text-tertiary">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {shown.length > limit && (
            <div className="zego-divider-top flex items-center justify-between gap-3 px-3 py-2 text-xs zego-text-tertiary">
              <span>แสดง {limit} จาก {shown.length} กรุ๊ป</span>
              <Button size="sm" variant="secondary" onClick={() => setPage({ key: filterKey, limit: limit + PAGE_SIZE })}>
                แสดงเพิ่มอีก {Math.min(PAGE_SIZE, shown.length - limit)}
              </Button>
            </div>
          )}
        </div>
      )}

      {picking && (
        <SendOffStaffPicker
          job={picking}
          staff={staff}
          jobs={jobs}
          rules={rules}
          dayOffOf={dayOffOf}
          capOf={capOf}
          canAssign={canAssign}
          onClose={() => setPicking(null)}
          onPick={(s) => doAssign(picking, s)}
          onSaveFlightTime={(t) => saveFlightTime(picking, t)}
          onSaveAirport={(code) => saveAirport(picking, code)}
        />
      )}
    </div>
  );
}
