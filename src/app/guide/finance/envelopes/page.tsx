'use client';

/**
 * การจัดการซองเงิน — /guide/finance/envelopes (หัวข้อใต้หัวเรื่อง "จัดการซองเงิน" ของหน้าบัญชี-การเงิน)
 *
 * เรื่องซองเงินทั้งหมดอยู่ที่นี่ที่เดียว: ยืนยันรับ / แนบรูป / ส่งต่อ + ยอดคงเหลือ / ส่งเงินให้แลนด์ / แจ้งยอดไม่ตรง (mode 'manage')
 * ซองของกรุ๊ปอื่นที่ฝากคุณนำส่ง (ถ้ามี) อยู่ด้านบน แยกจากซองของกรุ๊ปตัวเอง
 *
 * แบ่ง 3 กลุ่มด้วยการ์ดสรุปด้านบน (นับเป็นซอง + จำนวนกรุ๊ป):
 *   รอรับ        — ซองที่ยังรอยืนยันรับ · การ์ดเต็ม กดยืนยันได้ทันที · เปิดเป็นค่าเริ่มต้นเมื่อมี
 *   รับเรียบร้อย — ซองที่รับแล้วและยังถืออยู่ · ย่อกรุ๊ปละบรรทัด แตะเพื่อดูการ์ด (ส่งต่อ/แนบรูป/ส่งแลนด์)
 *   ส่งต่อแล้ว   — ซองที่คุณส่งต่อให้คนอื่นแล้ว · บอกว่าส่งให้ใคร เมื่อไร
 *   นับรายซอง: กรุ๊ปที่ส่งต่อไปบางซองจะอยู่ทั้ง "รับเรียบร้อย" และ "ส่งต่อแล้ว"
 * รองรับจำนวนมาก: จัดกลุ่มตามเดือนที่ออกเดินทาง + ตัวกรองปี/เดือน (MonthYearFilter) · ช่องค้นหารหัสกรุ๊ป/ชื่อโปรแกรมขึ้นเมื่อมีเกิน SEARCH_FROM กรุ๊ป ·
 * กรุ๊ปที่รับครบแล้วและเลยวันกลับหลุดจากรายการเอง (leaderEnvelopeGroups) รายการจึงไม่สะสมยาวขึ้นเรื่อย ๆ
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { formatCurrency, formatDateRange, formatThaiMonthYear, toISODate } from '@/lib/format';
import { sumAmounts } from '@/lib/logic/cashEnvelope';
import { Card, cx } from '@/components/ui/Primitives';
import { SearchBox } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { GuideEnvelopeCard } from '../../expenses/GuideEnvelopeCard';
import { ExpensesBackHeader } from '../../expenses/ExpensesBackHeader';
import { CarrierLeaderSection } from '../../CarrierLeaderSection';
import { leaderEnvelopeGroups } from '../envelopeGroups';
import { MonthYearFilter, matchesPeriodFilter, validPeriodFilter } from '../../MonthYearFilter';
import { periodCodeOf } from '@/services/tourPeriodMaster';

/** มีกรุ๊ปเกินจำนวนนี้ → แสดงช่องค้นหา */
const SEARCH_FROM = 5;

type View = 'waiting' | 'received' | 'forwarded';

export default function GuideEnvelopesPage() {
  const { currentUser, envelopes } = useDemo();
  const leaderId = ownLeaderScope(currentUser);
  const groups = leaderEnvelopeGroups(envelopes, leaderId, toISODate(new Date()))
    // เรียงตามวันออกเดินทาง — กรุ๊ปที่ใกล้ออกที่สุดขึ้นก่อน
    .sort((a, b) => (a.period?.startDate ?? '').localeCompare(b.period?.startDate ?? ''));

  // ซองของคุณที่การเงินปิดแล้ว แยกตามกรุ๊ป — ใช้นับจำนวนซองและยอดรวมของแต่ละกลุ่ม
  const envsOf = (periodId: string) => envelopes.filter((e) => e.periodId === periodId && e.sealed && e.handover?.receiverId === leaderId);
  // นับรายซอง — รอรับ = ยังไม่ยืนยัน · รับเรียบร้อย = รับแล้วยังถืออยู่ · ส่งต่อแล้ว = ส่งให้คนอื่นแล้ว
  const heldOf = (periodId: string) => envsOf(periodId).filter((e) => e.leaderAck && !e.leaderForward);
  const forwardedOf = (periodId: string) => envsOf(periodId).filter((e) => e.leaderForward);
  const waiting = groups.filter((g) => g.waiting);
  const received = groups.filter((g) => !g.waiting && heldOf(g.periodId).length > 0);
  const forwarded = groups.filter((g) => forwardedOf(g.periodId).length > 0);
  const waitingEnvCount = waiting.reduce((n, g) => n + envsOf(g.periodId).filter((e) => !e.leaderAck).length, 0);
  const receivedEnvCount = received.reduce((n, g) => n + heldOf(g.periodId).length, 0);
  const forwardedEnvCount = forwarded.reduce((n, g) => n + forwardedOf(g.periodId).length, 0);
  const listOf = (v: View) => (v === 'waiting' ? waiting : v === 'received' ? received : forwarded);
  const VIEW_LABEL: Record<View, string> = { waiting: 'รอรับ', received: 'รับเรียบร้อย', forwarded: 'ส่งต่อแล้ว' };

  // เลือกเอง > มีซองรอรับ = รอรับ > มีซองที่ถืออยู่ = รับเรียบร้อย > มีที่ส่งต่อ = ส่งต่อแล้ว
  const [picked, setPicked] = useState<View | null>(null);
  const view: View = picked ?? (waiting.length > 0 ? 'waiting' : received.length > 0 ? 'received' : forwarded.length > 0 ? 'forwarded' : 'received');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  /** ช่วงเวลาที่เลือก — 'yyyy' = ทั้งปี · 'yyyy-mm' = เดือนเดียว · null = ยังไม่เลือก (ใช้ปีเริ่มต้น) (MonthYearFilter) */
  const [pickedPeriod, setPickedPeriod] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const match = (g: (typeof groups)[number]) => !q || `${g.period?.groupCode ?? periodCodeOf(g.periodId)} ${g.period?.displayName ?? ''}`.toLowerCase().includes(q);
  const list = listOf(view).filter(match);
  // ค้นหาแล้วไม่เจอในกลุ่มนี้ → กลุ่มแรกที่เจอ (พาไปได้ในคลิกเดียว)
  const otherView = q ? (['waiting', 'received', 'forwarded'] as View[]).find((v) => v !== view && listOf(v).some(match)) : undefined;
  const otherMatches = otherView ? listOf(otherView).filter(match).length : 0;
  // แบ่งตามเดือนที่ออกเดินทาง — list เรียงตามวันออกอยู่แล้ว เดือนจึงเรียงตามไปด้วย
  const allByMonth: [string, typeof list][] = [];
  for (const g of list) {
    const month = (g.period?.startDate ?? '').slice(0, 7);
    const last = allByMonth[allByMonth.length - 1];
    if (last && last[0] === month) last[1].push(g);
    else allByMonth.push([month, [g]]);
  }
  // เปิดมาที่ปีปัจจุบัน · ช่วงเวลาที่เลือกไม่มีในรายการปัจจุบันแล้ว (สลับกลุ่ม/ค้นหา/รับครบ) → กลับไปปีเริ่มต้น
  const monthCounts = new Map(allByMonth.map(([m, gs]) => [m, gs.length] as const));
  const periodFilter = validPeriodFilter(pickedPeriod, [...monthCounts.keys()], toISODate(new Date()));
  const byMonth = allByMonth.filter(([m]) => matchesPeriodFilter(m, periodFilter));
  const monthName = (m: string) => (m ? formatThaiMonthYear(`${m}-01`) : 'ไม่ระบุเดือน');
  const monthTitle = (m: string, n: number) => (
    <p className="flex items-baseline justify-between px-1 pt-1 text-xs font-semibold zego-text-secondary">
      <span>{monthName(m)}</span>
      <span className="font-normal zego-text-tertiary">{n} กรุ๊ป</span>
    </p>
  );

  const labelOf = (g: (typeof groups)[number]) => ({
    code: g.period?.groupCode ?? periodCodeOf(g.periodId),
    detail: g.period?.displayName,
    dates: g.period ? formatDateRange(g.period.startDate, g.period.endDate) : undefined,
  });

  return (
    <div className="space-y-3">
      <ExpensesBackHeader title="การจัดการซองเงิน" description="ยืนยันรับซอง · ยอดคงเหลือในซอง · ส่งเงินให้แลนด์ · แจ้งยอดไม่ตรง · ส่งต่อซอง" backTab="envelopes" />
      <CarrierLeaderSection />

      {groups.length === 0 ? (
        <Card>
          <p className="py-4 text-center text-sm zego-text-tertiary">ยังไม่มีซองเงินที่ส่งมอบถึงคุณ</p>
        </Card>
      ) : (
        <>
          {/* สรุป + ตัวเลือกกลุ่ม — ตัวเลขบอกทั้งจำนวนกรุ๊ปและจำนวนซอง */}
          <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="สถานะซอง">
            {([
              { key: 'waiting' as const, label: 'รอรับ', groups: waiting.length, envs: waitingEnvCount, tone: 'text-amber-700' },
              { key: 'received' as const, label: 'รับเรียบร้อย', groups: received.length, envs: receivedEnvCount, tone: 'text-emerald-700' },
              { key: 'forwarded' as const, label: 'ส่งต่อแล้ว', groups: forwarded.length, envs: forwardedEnvCount, tone: 'text-sky-700' },
            ]).map((t) => {
              const on = view === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => { setPicked(t.key); setOpenId(null); }}
                  className={cx(
                    'rounded-xl border px-3 py-2 text-left transition-colors',
                    on ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600' : 'zego-border-color zego-surface-bg zego-hover-surface',
                  )}
                >
                  <span className="block text-xs zego-text-secondary">{t.label}</span>
                  <span className={cx('block text-lg font-bold tabular-nums', t.envs > 0 ? t.tone : 'zego-text-tertiary')}>
                    {t.envs} <span className="text-xs font-medium">ซอง</span>
                  </span>
                  <span className="block text-[11px] zego-text-tertiary">{t.groups} กรุ๊ป</span>
                </button>
              );
            })}
          </div>

          {groups.length > SEARCH_FROM && (
            <SearchBox value={query} onChange={setQuery} onClear={() => setQuery('')} placeholder="ค้นหารหัสกรุ๊ป หรือชื่อโปรแกรม" label="ค้นหากรุ๊ป" />
          )}

          {/* ตัวกรองช่วงเวลา — เลือกปี แล้วเลือกเดือน (มีมากกว่า 1 เดือนจึงแสดง) */}
          <MonthYearFilter counts={monthCounts} value={periodFilter} onChange={setPickedPeriod} />

          {list.length === 0 ? (
            <Card>
              <p className="py-4 text-center text-sm zego-text-tertiary">
                {q ? 'ไม่พบกรุ๊ปที่ค้นหา' : view === 'waiting' ? 'ไม่มีซองรอรับ — รับครบทุกซองแล้ว' : view === 'received' ? 'ไม่มีซองที่ถืออยู่' : 'ยังไม่มีซองที่ส่งต่อ'}
              </p>
              {/* ค้นหาแล้วไม่เจอในกลุ่มนี้ แต่เจออีกกลุ่ม — บอกและพาไปเลย */}
              {otherView && (
                <button
                  type="button"
                  onClick={() => { setPicked(otherView); setOpenId(null); }}
                  className="mx-auto block pb-2 text-xs font-medium zego-text-info hover:underline"
                >
                  พบ {otherMatches} กรุ๊ปใน &quot;{VIEW_LABEL[otherView]}&quot; — ดูเลย
                </button>
              )}
            </Card>
          ) : view === 'waiting' ? (
            // รอรับ — การ์ดเต็ม กดยืนยันได้ทันที · แบ่งหัวข้อตามเดือน
            byMonth.map(([month, gs]) => (
              <section key={month} className="space-y-2">
                {monthTitle(month, gs.length)}
                {gs.map((g) => <GuideEnvelopeCard key={g.periodId} periodId={g.periodId} mode="manage" groupLabel={labelOf(g)} />)}
              </section>
            ))
          ) : (
            // รับเรียบร้อย / ส่งต่อแล้ว — ย่อกรุ๊ปละบรรทัด แบ่งตามเดือน (หลายกรุ๊ปก็ยังไล่ดูได้) แตะเพื่อเปิดการ์ด
            byMonth.map(([month, gs]) => (
              <section key={month} className="space-y-2">
                {monthTitle(month, gs.length)}
                <Card padded={false}>
                  <ul className="divide-y divide-[var(--zego-border-soft)]">
                    {gs.map((g) => {
                      const envs = view === 'forwarded' ? forwardedOf(g.periodId) : heldOf(g.periodId);
                      const total = sumAmounts(envs.flatMap((e) => e.sealed?.faceTotals ?? []));
                      // ส่งต่อแล้ว — บอกว่าส่งให้ใคร (หลายซองหลายคนคั่นด้วย ·)
                      const toNames = [...new Set(envs.map((e) => e.leaderForward?.toName).filter(Boolean))].join(' · ');
                      const open = openId === g.periodId;
                      return (
                        <li key={g.periodId}>
                          <button
                            type="button"
                            aria-expanded={open}
                            onClick={() => setOpenId(open ? null : g.periodId)}
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left zego-hover-surface"
                          >
                            <Icon name={view === 'forwarded' ? 'chevronRight' : 'check'} className={cx('h-4 w-4 shrink-0', view === 'forwarded' ? 'text-sky-600' : 'zego-text-success')} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium zego-text">{g.period?.groupCode ?? periodCodeOf(g.periodId)}</span>
                              <span className="block text-xs zego-text-tertiary">
                                {g.period ? `ออก ${formatDateRange(g.period.startDate, g.period.endDate)} · ` : ''}{envs.length} ซอง · {total.map((t) => formatCurrency(t.amount, t.currency)).join(' · ')}
                              </span>
                              {view === 'forwarded' && toNames && (
                                <span className="block text-xs text-sky-700">ส่งต่อให้ {toNames}</span>
                              )}
                            </span>
                            <Icon name="chevronDown" className={cx('h-4 w-4 shrink-0 zego-text-disabled transition-transform', open && 'rotate-180')} />
                          </button>
                          {open && (
                            <div className="px-2 pb-2">
                              <GuideEnvelopeCard periodId={g.periodId} mode="manage" groupLabel={labelOf(g)} />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
