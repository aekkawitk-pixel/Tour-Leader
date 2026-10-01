'use client';

/**
 * ตารางงานของฉัน — /staff (หน้าแรกพอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป)
 *
 * งานส่งกรุ๊ปที่ผู้จัดสเก็ตจัดให้ตัวเอง: วันที่ต้องไป · เวลาต้องถึงสนามบิน · สนามบิน · เที่ยวบิน · กรุ๊ป
 * เวลาถึงสนามบินคำนวณใหม่จากเวลาเครื่องออกทุกครั้ง (เปลี่ยนตามเที่ยวบินจริง) · เครื่องออกเช้ามืด = ต้องไปคืนก่อน
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useDemo } from '@/store/DemoStore';
import { Card, EmptyState, StatusBadge, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { formatDate, parseDate, TH_WEEKDAYS_SHORT } from '@/lib/format';
import { loadSendOffLeave } from '@/services/sendOffStaffLeaveStore';
import { leaveCoversDate } from '@/lib/logic/sendOffStaffLeave';
import { airportName } from '@/lib/logic/airportLabel';
import { isGroupAdvanceDoc } from '@/lib/logic/groupBudget';
import { groupEnvelopeStatus, groupLines, returnedToFinanceBy } from '@/lib/logic/cashEnvelope';
import { useStaffPortal } from './useStaffPortal';
import { MonthYearSelect, MonthHeader, useMonthGroups } from '@/components/ui/MonthFilter';

export default function StaffSchedulePage() {
  const { envelopes, expenses, currentUser } = useDemo();
  const { staffId, duties, today } = useStaffPortal();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const leave = useMemo(() => loadSendOffLeave().filter((r) => r.staffId === staffId && r.status === 'approved'), [staffId]);

  const upcoming = duties.filter((d) => d.dutyDate >= today);
  const past = duties.filter((d) => d.dutyDate < today).reverse();
  const shown = tab === 'upcoming' ? upcoming : past;
  // แบ่งเป็นรายเดือนตาม "วันที่ต้องไปส่ง" + เลือกดูทีละเดือนได้ (ลำดับในแต่ละแท็บคงเดิม)
  const monthGroups = useMonthGroups(shown, (d) => d.dutyDate, today);
  /*
    ซองเงินของกรุ๊ปนี้อยู่ขั้นไหน มองจากฝั่งเจ้าหน้าที่ — บอกให้รู้ตั้งแต่การเงินยังจัดอยู่ ไม่ใช่แค่ตอนฝากมาแล้ว
    ซองที่การเงินฝากคนอื่น/ส่งหัวหน้าทัวร์ตรง ไม่ใช่เรื่องของคนนี้ → ไม่แสดง
  */
  const envelopeNotice = (periodId: string): { text: string; tone: 'amber' | 'slate' } | null => {
    const envs = envelopes.filter((e) => e.periodId === periodId);
    const mine = envs.filter((e) => e.handover?.proxyStaffId === staffId && !e.leaderAck);
    if (mine.some((e) => e.staffReturn)) return { text: 'ส่งซองเงินคืนการเงินแล้ว — รอการเงินยืนยันรับ', tone: 'slate' };
    if (mine.some((e) => !e.staffAck)) return { text: 'การเงินส่งมอบซองเงินให้คุณแล้ว — กดยืนยันรับ', tone: 'amber' };
    if (mine.some((e) => !e.staffHandoff)) return { text: 'มีซองเงินต้องนำส่งหัวหน้าทัวร์', tone: 'amber' };
    if (mine.length > 0) return { text: 'ส่งซองเงินแล้ว — รอหัวหน้าทัวร์ยืนยันรับ', tone: 'slate' };
    if (envs.some((e) => e.handover)) return null;
    if (envs.some((e) => returnedToFinanceBy(e, { id: staffId, name: currentUser.name }))) {
      return { text: 'ส่งซองเงินคืนการเงินแล้ว', tone: 'slate' };
    }
    const docs = expenses.filter((e) => isGroupAdvanceDoc(e) && e.jobId === periodId);
    if (docs.length === 0) return null;
    const status = groupEnvelopeStatus(groupLines(docs), envs);
    if (status.stage === 'sealed') return { text: 'มีซองเงินให้ไปรับที่การเงิน', tone: 'amber' };
    if (status.stage === 'packing') return { text: 'การเงินกำลังจัดซองเงินของกรุ๊ปนี้', tone: 'slate' };
    return null;
  };

  if (!staffId) {
    return <Card><EmptyState icon="warning" title="บัญชีนี้ยังไม่ผูกกับทะเบียนเจ้าหน้าที่ส่งกรุ๊ป" description="ติดต่อผู้ดูแลระบบให้ผูกรหัส SOS ก่อนใช้งาน" /></Card>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold zego-text">ตารางงานของฉัน</h1>
        <p className="text-xs zego-text-tertiary">งานส่งกรุ๊ปที่ได้รับมอบหมาย · เวลาถึงสนามบินคำนวณจากเวลาเครื่องออก</p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl zego-surface-soft-bg p-1 text-sm" role="tablist">
        {([['upcoming', `กำลังจะถึง (${upcoming.length})`], ['past', `ที่ผ่านมา (${past.length})`]] as const).map(([k, text]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cx('rounded-lg py-1.5 font-medium', tab === k ? 'bg-white shadow-sm zego-text' : 'zego-text-tertiary')}
          >
            {text}
          </button>
        ))}
      </div>

      <MonthYearSelect groups={monthGroups} />

      {shown.length === 0 ? (
        <Card>
          <EmptyState icon="calendar" title={tab === 'upcoming' ? 'ยังไม่มีงานที่กำลังจะถึง' : 'ยังไม่มีงานที่ผ่านมา'} description="เมื่อผู้จัดสเก็ตจัดงานส่งกรุ๊ปให้คุณ รายการจะขึ้นที่นี่" />
        </Card>
      ) : (
        <div className="space-y-5">
          {monthGroups.shown.map((m) => (
            <section key={m.key} aria-label={m.label} className="space-y-2">
              <MonthHeader label={m.label} count={m.items.length} unit="งาน" />
              <ul className="space-y-3">
                {m.items.map((d) => {
                  const dt = d.dutyDate ? parseDate(d.dutyDate) : null;
                  const onLeave = leave.some((r) => leaveCoversDate(r, d.dutyDate));
                  const notice = envelopeNotice(d.periodId);
                  return (
                    <li key={d.assignmentId}>
                      <Card className="flex gap-3">
                        {/* วันที่ต้องไป */}
                        <div className="w-14 shrink-0 rounded-lg bg-emerald-50 py-2 text-center">
                          <p className="text-[11px] text-emerald-700">{dt ? TH_WEEKDAYS_SHORT[dt.getDay()] : ''}</p>
                          <p className="text-xl font-bold leading-tight text-emerald-800">{dt ? dt.getDate() : '—'}</p>
                          <p className="text-[11px] text-emerald-700">{formatDate(d.dutyDate).slice(3)}</p>
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold zego-text">{d.period?.groupCode ?? d.periodId}</p>
                            <StatusBadge meta={d.confirmed ? { label: 'คอนเฟิร์มแล้ว', tone: 'green' } : { label: 'รอคอนเฟิร์ม', tone: 'amber' }} size="sm" />
                          </div>
                          <p className="line-clamp-1 text-xs zego-text-secondary">{d.period?.displayName}</p>
                          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                            <span className="inline-flex items-center gap-1 font-semibold zego-text">
                              <Icon name="clock" className="h-3.5 w-3.5" />
                              {/* ต่อท้ายด้วยวันที่ไปส่งจริงเสมอ — เครื่องออกเช้ามืดวันที่ต้องไปคือคืนก่อนวันเดินทาง ไม่ใช่วันเดินทาง */}
                              {d.arrivalTime ? `ถึงสนามบิน ${d.arrivalTime} น. วันที่ ${formatDate(d.dutyDate)}` : 'ยังไม่ทราบเวลา'}
                            </span>
                          </p>
                          {/* แยกบรรทัดเอง — "สุวรรณภูมิ (BKK)" อ่านง่ายกว่ารหัสล้วน ๆ และไม่ไปเบียดบรรทัดเวลา · ไม่รู้จักรหัสก็โชว์รหัสอย่างเดียว */}
                          {d.airport && (
                            <p className="text-xs zego-text-secondary">
                              สนามบิน {airportName(d.airport) !== d.airport ? `${airportName(d.airport)} (${d.airport})` : d.airport}
                            </p>
                          )}
                          <p className="flex flex-wrap items-center gap-x-3 text-xs zego-text-tertiary">
                            <span className="inline-flex items-center gap-1"><Icon name="plane" className="h-3.5 w-3.5" />{d.period?.flightNo ?? 'เที่ยวบิน —'}</span>
                            {d.flightTime && <span>เครื่องออก {d.flightTime}</span>}
                          </p>
                          {onLeave && <p className="text-xs zego-text-danger">ตรงกับวันลาที่อนุมัติแล้ว — แจ้งผู้จัดสเก็ต</p>}
                          {notice && (
                            <Link
                              href="/staff/envelopes"
                              className={cx(
                                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                                notice.tone === 'amber' ? 'bg-amber-50 text-amber-800' : 'zego-surface-soft-bg zego-text-secondary',
                              )}
                            >
                              <Icon name="money" className="h-3.5 w-3.5" /> {notice.text}
                            </Link>
                          )}
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
