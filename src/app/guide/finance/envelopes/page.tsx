'use client';

/**
 * รับซองเงิน — /guide/finance/envelopes (หัวข้อใต้หัวเรื่อง "จัดการซองเงิน" ของหน้าบัญชี-การเงิน)
 *
 * ที่เดียวที่หัวหน้าทัวร์ยืนยันรับ / ส่งต่อ / แนบรูปซองเงิน — การ์ดเดียวกับหน้ารายละเอียดงาน
 * ซองของกรุ๊ปอื่นที่ฝากคุณนำส่ง (ถ้ามี) อยู่ด้านบน แยกจากซองของกรุ๊ปตัวเอง
 *
 * แบ่ง 2 กลุ่มด้วยตัวเลือกด้านบน (บอกจำนวนกรุ๊ป/ซองของแต่ละกลุ่ม):
 *   รอรับ        — กรุ๊ปที่ยังมีซองรอยืนยันรับ · การ์ดเต็ม กดยืนยันได้ทันที · เปิดเป็นค่าเริ่มต้นเมื่อมี
 *   รับเรียบร้อย — รับครบทุกซองแล้ว · ย่อกรุ๊ปละบรรทัด แตะเพื่อดูการ์ด (ส่งต่อ/แนบรูป)
 * รองรับจำนวนมาก: จัดกลุ่มตามเดือนที่ออกเดินทาง + ตัวเลือกเดือน (เมื่อมีมากกว่า 1 เดือน) · ช่องค้นหารหัสกรุ๊ป/ชื่อโปรแกรมขึ้นเมื่อมีเกิน SEARCH_FROM กรุ๊ป ·
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

/** มีกรุ๊ปเกินจำนวนนี้ → แสดงช่องค้นหา */
const SEARCH_FROM = 5;

type View = 'waiting' | 'received';

export default function GuideEnvelopesPage() {
  const { currentUser, envelopes } = useDemo();
  const leaderId = ownLeaderScope(currentUser);
  const groups = leaderEnvelopeGroups(envelopes, leaderId, toISODate(new Date()))
    // เรียงตามวันออกเดินทาง — กรุ๊ปที่ใกล้ออกที่สุดขึ้นก่อน
    .sort((a, b) => (a.period?.startDate ?? '').localeCompare(b.period?.startDate ?? ''));

  // ซองของคุณที่การเงินปิดแล้ว แยกตามกรุ๊ป — ใช้นับจำนวนซองและยอดรวมของแต่ละกลุ่ม
  const envsOf = (periodId: string) => envelopes.filter((e) => e.periodId === periodId && e.sealed && e.handover?.receiverId === leaderId);
  const waiting = groups.filter((g) => g.waiting);
  const received = groups.filter((g) => !g.waiting);
  const waitingEnvCount = waiting.reduce((n, g) => n + envsOf(g.periodId).filter((e) => !e.leaderAck).length, 0);
  const receivedEnvCount = received.reduce((n, g) => n + envsOf(g.periodId).length, 0);

  // เลือกเอง > มีซองรอรับ = รอรับ > ไม่งั้น = รับเรียบร้อย
  const [picked, setPicked] = useState<View | null>(null);
  const view: View = picked ?? (waiting.length > 0 ? 'waiting' : 'received');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  /** เดือนที่เลือก (yyyy-mm) — null = ทุกเดือน */
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const match = (g: (typeof groups)[number]) => !q || `${g.period?.groupCode ?? g.periodId} ${g.period?.displayName ?? ''}`.toLowerCase().includes(q);
  const list = (view === 'waiting' ? waiting : received).filter(match);
  const otherMatches = q ? (view === 'waiting' ? received : waiting).filter(match).length : 0;
  // แบ่งตามเดือนที่ออกเดินทาง — list เรียงตามวันออกอยู่แล้ว เดือนจึงเรียงตามไปด้วย
  const allByMonth: [string, typeof list][] = [];
  for (const g of list) {
    const month = (g.period?.startDate ?? '').slice(0, 7);
    const last = allByMonth[allByMonth.length - 1];
    if (last && last[0] === month) last[1].push(g);
    else allByMonth.push([month, [g]]);
  }
  // เดือนที่เลือกไว้ไม่มีในรายการปัจจุบันแล้ว (สลับกลุ่ม/ค้นหา/รับครบ) → กลับเป็นทุกเดือน
  const month = pickedMonth && allByMonth.some(([m]) => m === pickedMonth) ? pickedMonth : null;
  const byMonth = month ? allByMonth.filter(([m]) => m === month) : allByMonth;
  const monthChip = (on: boolean) => cx(
    'shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
    on ? 'bg-emerald-600 text-white ring-emerald-600' : 'zego-surface-bg zego-text-secondary ring-[var(--zego-border-soft)] zego-hover-surface',
  );
  const monthName = (m: string) => (m ? formatThaiMonthYear(`${m}-01`) : 'ไม่ระบุเดือน');
  const monthTitle = (m: string, n: number) => (
    <p className="flex items-baseline justify-between px-1 pt-1 text-xs font-semibold zego-text-secondary">
      <span>{monthName(m)}</span>
      <span className="font-normal zego-text-tertiary">{n} กรุ๊ป</span>
    </p>
  );

  const labelOf = (g: (typeof groups)[number]) => ({
    code: g.period?.groupCode ?? g.periodId,
    detail: g.period?.displayName,
    dates: g.period ? formatDateRange(g.period.startDate, g.period.endDate) : undefined,
  });

  return (
    <div className="space-y-3">
      <ExpensesBackHeader title="รับซองเงิน" description="ยืนยันรับซองที่การเงินส่งมอบ · แนบรูปซองที่ได้รับ · ส่งต่อซอง — ใช้เงินในซองที่หน้าบันทึกใบเสร็จ" backTab="envelopes" />
      <CarrierLeaderSection />

      {groups.length === 0 ? (
        <Card>
          <p className="py-4 text-center text-sm zego-text-tertiary">ยังไม่มีซองเงินที่ส่งมอบถึงคุณ</p>
        </Card>
      ) : (
        <>
          {/* สรุป + ตัวเลือกกลุ่ม — ตัวเลขบอกทั้งจำนวนกรุ๊ปและจำนวนซอง */}
          <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="สถานะซอง">
            {([
              { key: 'waiting' as const, label: 'รอรับ', groups: waiting.length, envs: waitingEnvCount, tone: 'text-amber-700' },
              { key: 'received' as const, label: 'รับเรียบร้อย', groups: received.length, envs: receivedEnvCount, tone: 'text-emerald-700' },
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

          {/* ตัวเลือกเดือน — มีมากกว่า 1 เดือนจึงแสดง · เลื่อนซ้าย–ขวาได้เมื่อเดือนเยอะ */}
          {allByMonth.length > 1 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="เลือกเดือน">
              <button type="button" aria-pressed={!month} onClick={() => setPickedMonth(null)} className={monthChip(!month)}>
                ทุกเดือน
              </button>
              {allByMonth.map(([m, gs]) => (
                <button key={m} type="button" aria-pressed={month === m} onClick={() => setPickedMonth(m)} className={monthChip(month === m)}>
                  {monthName(m)} ({gs.length})
                </button>
              ))}
            </div>
          )}

          {list.length === 0 ? (
            <Card>
              <p className="py-4 text-center text-sm zego-text-tertiary">
                {q ? 'ไม่พบกรุ๊ปที่ค้นหา' : view === 'waiting' ? 'ไม่มีซองรอรับ — รับครบทุกซองแล้ว' : 'ยังไม่มีซองที่รับเรียบร้อย'}
              </p>
              {/* ค้นหาแล้วไม่เจอในกลุ่มนี้ แต่เจออีกกลุ่ม — บอกและพาไปเลย */}
              {q && otherMatches > 0 && (
                <button
                  type="button"
                  onClick={() => { setPicked(view === 'waiting' ? 'received' : 'waiting'); setOpenId(null); }}
                  className="mx-auto block pb-2 text-xs font-medium zego-text-info hover:underline"
                >
                  พบ {otherMatches} กรุ๊ปใน &quot;{view === 'waiting' ? 'รับเรียบร้อย' : 'รอรับ'}&quot; — ดูเลย
                </button>
              )}
            </Card>
          ) : view === 'waiting' ? (
            // รอรับ — การ์ดเต็ม กดยืนยันได้ทันที · แบ่งหัวข้อตามเดือน
            byMonth.map(([month, gs]) => (
              <section key={month} className="space-y-2">
                {monthTitle(month, gs.length)}
                {gs.map((g) => <GuideEnvelopeCard key={g.periodId} periodId={g.periodId} mode="receive" groupLabel={labelOf(g)} />)}
              </section>
            ))
          ) : (
            // รับเรียบร้อย — ย่อกรุ๊ปละบรรทัด แบ่งตามเดือน (รับมาหลายกรุ๊ปก็ยังไล่ดูได้) แตะเพื่อเปิดการ์ด
            byMonth.map(([month, gs]) => (
              <section key={month} className="space-y-2">
                {monthTitle(month, gs.length)}
                <Card padded={false}>
                  <ul className="divide-y divide-[var(--zego-border-soft)]">
                    {gs.map((g) => {
                      const envs = envsOf(g.periodId);
                      const total = sumAmounts(envs.flatMap((e) => e.sealed?.faceTotals ?? []));
                      const open = openId === g.periodId;
                      return (
                        <li key={g.periodId}>
                          <button
                            type="button"
                            aria-expanded={open}
                            onClick={() => setOpenId(open ? null : g.periodId)}
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left zego-hover-surface"
                          >
                            <Icon name="check" className="h-4 w-4 shrink-0 zego-text-success" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium zego-text">{g.period?.groupCode ?? g.periodId}</span>
                              <span className="block text-xs zego-text-tertiary">
                                {g.period ? `ออก ${formatDateRange(g.period.startDate, g.period.endDate)} · ` : ''}{envs.length} ซอง · {total.map((t) => formatCurrency(t.amount, t.currency)).join(' · ')}
                              </span>
                            </span>
                            <Icon name="chevronDown" className={cx('h-4 w-4 shrink-0 zego-text-disabled transition-transform', open && 'rotate-180')} />
                          </button>
                          {open && (
                            <div className="px-2 pb-2">
                              <GuideEnvelopeCard periodId={g.periodId} mode="receive" groupLabel={labelOf(g)} />
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
