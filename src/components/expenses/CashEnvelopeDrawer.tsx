'use client';

/**
 * ซองเงินของกรุ๊ป — ฝั่งการเงิน (เปิดจากหน้า "จัดการค่าใช้จ่ายกรุ๊ป")
 *
 * หลักการถือเงิน: การเงินจัดซอง → เจ้าหน้าที่ส่งกรุ๊ป → หัวหน้าทัวร์ → (ส่งให้แลนด์ต่างประเทศ | ใช้ตามรายการ)
 * ซองเป็นของกรุ๊ป: รวมเอกสารเบิกหลายใบไว้ในซองเดียว หรือแยกหลายซองตามค่าใช้จ่ายที่ถือไปก็ได้
 *   1) จัดซอง — เลือกรายการเบิก (จากทุกเอกสารของกรุ๊ป) ใส่ซอง · 1 รายการแบ่งใส่หลายซองได้ (ระบุยอดต่อซอง) · ปิดซอง = ยอดหน้าซอง
 *   2) ส่งมอบ — เลือกส่งให้เจ้าหน้าที่ส่งกรุ๊ป (นำไปส่งหัวหน้าทัวร์ต่อ) หรือหัวหน้าทัวร์โดยตรง (มีผู้รับแทนได้)
 *      ไม่เซ็น/ถ่ายรูปบนเครื่องการเงิน — ผู้รับต้องยืนยันด้วยเครื่องของตัวเอง
 *   3) หัวหน้าทัวร์กดยืนยันรับในเครื่องของตัวเอง (ทีละซอง) = หลักฐานการรับ
 *   4) ใช้เงิน — หัวหน้าทัวร์ส่งแลนด์ + ใช้ตามใบเสร็จ (Timeline แสดงแค่ว่าเริ่มใช้แล้ว)
 * ไม่มีขั้นนับซ้ำ — ผู้รับไม่เปิดนับจนกว่าจะใช้ ถ้ายอดไม่ตรง หัวหน้าทัวร์แจ้งกลับในแอปและขึ้นเตือนที่นี่
 */

import { useMemo, useState } from 'react';
import { PhotoConfirmModal, ProofThumb } from './EnvelopeProofPhoto';
import { useDemo } from '@/store/DemoStore';
import { Drawer, Modal } from '@/components/ui/Modal';
import { Button, cx } from '@/components/ui/Primitives';
import { SearchBox, TextInput } from '@/components/ui/FormField';
import { Combobox } from '@/components/ui/Combobox';
import { Icon } from '@/components/ui/Icon';
import { formatCurrency, formatDate, formatDateRange, formatDateTime, formatTime, toISODate, toISODateTime } from '@/lib/format';
import {
  allocationOf, canEditHandover, depositedViaGroup, canSeal, pendingDepositLabel, type PendingDeposit, carrierOf, carrierTitle, ENVELOPE_KIND, ENVELOPE_KIND_ORDER, envelopeKindReady, type EnvelopeKind, docChangedSinceSeal, envelopeTimeline, handoverReceiverText, envelopeName, envelopeShortLabel, envelopeStage, envelopeStatusLabel,
  envelopeTotals, groupEnvelopeStatus, groupLines, lineKey, newEnvelope, NO_ENVELOPE_REASONS, packingFromAllocation, sumAmounts, unassignedLines,
  type Allocation, type CashEnvelope, type EnvelopeAmount, type EnvelopeTone,
} from '@/lib/logic/cashEnvelope';
import { getAssignablePeriods, getTourPeriodById, periodCodeOf } from '@/services/tourPeriodMaster';
import { isOutsideReceipt } from '@/lib/logic/groupBudget';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { loadSendOffAssignments } from '@/services/sendOffAssignmentStore';
import { loadSendOffStaff } from '@/services/sendOffStaffStore';
import { sendOffStaffName } from '@/lib/logic/sendOffStaff';
import type { ExpenseRequest } from '@/types';

const TONE: Record<EnvelopeTone, { bg: string; fg: string }> = {
  slate: { bg: '#f1f5f9', fg: '#475569' },
  amber: { bg: '#fef3c7', fg: '#92400e' },
  blue: { bg: '#e0f2fe', fg: '#075985' },
  violet: { bg: '#ede9fe', fg: '#5b21b6' },
  green: { bg: '#dcfce7', fg: '#166534' },
  red: { bg: '#ffe4e6', fg: '#9f1239' },
};

export function StatusPill({ label, tone }: { label: string; tone: EnvelopeTone }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: TONE[tone].bg, color: TONE[tone].fg }}>
      {label}
    </span>
  );
}

export function EnvelopeStatusBadge({ env, short = false }: { env: CashEnvelope | undefined; short?: boolean }) {
  return <StatusPill {...(short ? envelopeShortLabel(env) : envelopeStatusLabel(env))} />;
}

/**
 * ป้าย "ซองหลัก" / "ซองฝาก · มากับกรุ๊ป X" — ให้หัวหน้าทัวร์แยกออกว่าซองไหนมากับกรุ๊ปตัวเอง ซองไหนฝากมากับกรุ๊ปอื่น
 * (ซองฝากมาคนละทาง คนละเวลา ต้องตามรับจากผู้ถือของกรุ๊ปนั้น)
 */
export function EnvelopeRouteTag({ env, groupCode }: { env: CashEnvelope; groupCode: string | undefined }) {
  const via = depositedViaGroup(env, groupCode);
  return via
    ? <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">ซองฝาก · มากับกรุ๊ป {via}</span>
    : <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">ซองหลัก</span>;
}

const fmtTotals = (list: EnvelopeAmount[]) => list.map((t) => formatCurrency(t.amount, t.currency)).join(' · ');

/** ยอดที่หัวหน้าทัวร์ใช้ตามใบเสร็จของกรุ๊ปนี้ (ไม่รวมใบยกเลิก/ปฏิเสธ และบรรทัดที่บัญชีไม่อนุมัติ) */
export function spentByReceipts(expenses: ExpenseRequest[], periodId: string, leaderId?: string): EnvelopeAmount[] {
  return sumAmounts(
    expenses
      // นอกรายการเบิกไม่ใช่เงินในซอง — ไม่หักจากคงเหลือในซอง
      .filter((e) => e.jobId === periodId && e.category === 'actual' && e.status !== 'cancelled' && e.status !== 'rejected'
        && (!leaderId || e.requesterId === leaderId) && !isOutsideReceipt(expenses, e))
      .flatMap((e) => e.lines.filter((l) => !l.rejected).map((l) => ({ amount: l.amount, currency: l.currency }))),
  );
}

/** Timeline ความเคลื่อนไหวของซองเงินทั้งกรุ๊ป (แบบติดตามพัสดุ) — ล่าสุดอยู่บนและเน้นสี */
/** กลุ่มซองใน Timeline — เช่น ซองของกรุ๊ปนี้ / ซองฝากจากกรุ๊ปอื่น (tag ต่อท้ายชื่อซองในแต่ละเหตุการณ์ ให้รู้ว่ามาจากกรุ๊ปไหน) */
export type TimelineSection = { title: string; envs: CashEnvelope[]; tag?: string };

export function EnvelopeTimeline({ envs: envsProp, sections, limit = 5 }: { envs?: CashEnvelope[]; sections?: TimelineSection[]; limit?: number }) {
  const [all, setAll] = useState(false);
  /** กรองดูทีละซอง (null = ทุกซอง) — ใช้ไล่เส้นทางของซองที่แยกกันไปคนละทาง แทน "เส้นทางซอง" แยกที่เคยซ้ำกับ Timeline */
  const [onlyEnv, setOnlyEnv] = useState<string | null>(null);
  const groups: TimelineSection[] = sections ?? [{ title: '', envs: envsProp ?? [] }];
  const envs = groups.flatMap((g) => g.envs);
  const tagOf = new Map(groups.flatMap((g) => g.envs.map((e) => [e.id, g.tag] as const)));
  const allEvents = envelopeTimeline(envs).map((ev) => {
    const tag = tagOf.get(ev.envelopeId);
    return tag ? { ...ev, envName: `${ev.envName} · ${tag}` } : ev;
  });
  const hasEvents = (e: CashEnvelope) => allEvents.some((ev) => ev.envelopeId === e.id);
  const envOptions = envs.filter(hasEvents);
  // มีซองเดียว — ไม่ต้องมีตัวกรองและไม่ต้องติดป้ายชื่อซองทุกบรรทัด
  const multi = envOptions.length > 1;
  const shownGroups = groups.map((g) => ({ ...g, envs: g.envs.filter(hasEvents) })).filter((g) => g.envs.length > 0);
  const events = onlyEnv ? allEvents.filter((ev) => ev.envelopeId === onlyEnv) : allEvents;
  const shown = all ? events : events.slice(0, limit);
  const chip = (on: boolean) => cx(
    'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
    on ? 'bg-emerald-600 text-white ring-emerald-600' : 'zego-surface-bg zego-text-secondary ring-[var(--zego-border-soft)] zego-hover-surface',
  );
  return (
    <section className="rounded-xl border zego-border-color px-3 py-3 sm:px-4">
      <h3 className="mb-3 text-sm font-semibold zego-text">Timeline</h3>
      {multi && (
        // แยกแถวตามกลุ่ม (ซองของกรุ๊ปนี้ / ซองฝาก) — ชื่อปุ่มเป็นชื่อซองสั้น ๆ กลุ่มบอกที่หัวแถว
        <div className="mb-3 space-y-2" role="group" aria-label="กรองตามซอง">
          <button type="button" aria-pressed={!onlyEnv} onClick={() => setOnlyEnv(null)} className={chip(!onlyEnv)}>ทุกซอง</button>
          {shownGroups.map((g, gi) => (
            <div key={gi} className="flex flex-wrap items-center gap-1.5">
              {g.title && <span className="w-full text-[11px] font-medium zego-text-tertiary">{g.title}</span>}
              {g.envs.map((e) => (
                <button key={e.id} type="button" aria-pressed={onlyEnv === e.id} onClick={() => setOnlyEnv(e.id)} className={chip(onlyEnv === e.id)}>
                  {envelopeName(e)}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {events.length === 0 ? (
        <p className="text-sm zego-text-tertiary">ยังไม่มีความเคลื่อนไหว — เริ่มจากการเงินจัดซอง</p>
      ) : (
        <ol>
          {shown.map((ev, i) => {
            const latest = i === 0;
            const last = i === shown.length - 1;
            return (
              <li key={`${ev.envelopeId}-${ev.at}-${i}`} className="relative flex gap-3 pb-5 last:pb-0">
                {!last && <span aria-hidden className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-slate-300" />}
                <span
                  className={cx(
                    'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-white',
                    latest ? 'border-emerald-600 text-emerald-600' : 'border-slate-300 text-slate-400',
                  )}
                >
                  <Icon name="clock" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 space-y-1 pt-0.5">
                  <p className="text-xs tabular-nums zego-text-tertiary">
                    วันที่ {formatDate(ev.at)} เวลา {formatTime(ev.at)}
                    <span className="mx-1.5">·</span>
                    โดย {ev.byName}
                  </p>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={cx('text-sm font-semibold', latest ? 'text-emerald-700' : 'zego-text')}>{ev.title}</span>
                    {multi && !onlyEnv && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium zego-text-secondary">{ev.envName}</span>}
                  </p>
                  {ev.details.length > 0 && (
                    <ul className="space-y-0.5 text-sm zego-text-secondary">
                      {ev.details.map((d, j) => <li key={j}>{d}</li>)}
                    </ul>
                  )}
                  {/* รูปหลักฐานที่ผู้รับ/ผู้ส่งแนบตอนกดยืนยันทอดนี้ */}
                  <ProofThumb src={ev.photo} label={`${ev.title} · ${ev.envName} · ${formatDate(ev.at)} ${formatTime(ev.at)} · ${ev.byName}`} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {events.length > limit && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-xs font-medium zego-text-info hover:underline">
          {all ? 'แสดงเฉพาะล่าสุด' : `ดูทั้งหมด (${events.length})`}
        </button>
      )}
    </section>
  );
}

/** ดู Timeline อย่างเดียว (แยกจากหน้าจัดการ) — สรุปซองของกรุ๊ป + ความเคลื่อนไหวทั้งหมด */
export function GroupTimelineDrawer({ periodId, docs, onClose }: { periodId: string; docs: ExpenseRequest[]; onClose: () => void }) {
  const { envelopes, noEnvelopeMarks } = useDemo();
  const period = getTourPeriodById(periodId);
  const envs = envelopes.filter((e) => e.periodId === periodId).sort((a, b) => a.no - b.no);
  const used = envs.filter((e) => e.packedLineIds.length > 0);
  const status = groupEnvelopeStatus(groupLines(docs), envs, noEnvelopeMarks.find((m) => m.periodId === periodId));
  /*
    ซองของกรุ๊ปอื่นที่ฝากไปกับกรุ๊ปนี้ — ดึงไปแล้ว (depositedWith / viaGroup = กรุ๊ปนี้) + ที่ระบุให้ฝากกับกรุ๊ปนี้แต่ยังไม่ได้ดึง
    Timeline แยกเป็นกลุ่ม ไม่ให้ปนกับซองของกรุ๊ปนี้
  */
  // ไม่พบกรุ๊ปใน Master (เดินทางไปแล้ว) — ใช้รหัสกรุ๊ปจากเอกสารเบิก
  const thisCode = period?.groupCode ?? docs[0]?.sourceDoc?.groupCode ?? periodCodeOf(periodId);
  const ownerCodeOf = (x: CashEnvelope) => getTourPeriodById(x.periodId)?.groupCode ?? periodCodeOf(x.periodId);
  const deposits = envelopes
    .filter((x) => x.periodId !== periodId && (x.handover
      ? (x.handover.depositedWith ?? x.handover.viaGroup) === thisCode
      : x.pendingDeposit?.target?.periodId === periodId));
  // Timeline แยกกลุ่ม: ซองของกรุ๊ปนี้ / ซองฝาก (ทีละกรุ๊ปเจ้าของซอง)
  const depositCodes = [...new Set(deposits.map(ownerCodeOf))];
  const sections: TimelineSection[] = [
    { title: deposits.length ? `ซองของกรุ๊ปนี้ (${thisCode})` : '', envs },
    ...depositCodes.map((code) => ({ title: `ซองฝาก · จากกรุ๊ป ${code}`, envs: deposits.filter((x) => ownerCodeOf(x) === code), tag: `ฝากจาก ${code}` })),
  ];
  return (
    <Drawer
      open
      onClose={onClose}
      title={`Timeline ${thisCode}`}
      description={`${period?.displayName ?? ''}${period ? ` · ${formatDateRange(period.startDate, period.endDate)}` : ''} · เอกสารเบิก ${docs.map((d) => d.id).join(', ')}`}
      footer={<Button variant="secondary" onClick={onClose}>ปิด</Button>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold zego-text">สถานะปัจจุบัน</p>
          <StatusPill label={status.label} tone={status.tone} />
        </div>
        {used.length > 0 && (
          <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color text-sm">
            {used.map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                {/* ข้อความซ้ายยาวแค่ไหนก็ตัดบรรทัดในช่องตัวเอง — ยอด + สถานะอยู่ขวาสุดตรงกันทุกแถว */}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium zego-text">{envelopeName(e)}</span>
                  <span className="block text-xs zego-text-tertiary">
                    {e.handover ? `ผู้รับ: ${handoverReceiverText(e.handover)}` : `${e.packedLineIds.length} รายการ`}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                  {e.sealed && <span className="whitespace-nowrap text-xs font-semibold tabular-nums zego-text sm:w-28 sm:text-right">{fmtTotals(e.sealed.faceTotals)}</span>}
                  <EnvelopeStatusBadge env={e} short />
                </span>
              </li>
            ))}
          </ul>
        )}
        {deposits.length > 0 && (
          <section className="space-y-1.5">
            <p className="text-sm font-semibold zego-text">ซองของกรุ๊ปอื่นที่ฝากไปกับกรุ๊ปนี้ · {deposits.length} ซอง</p>
            <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border border-amber-200 bg-amber-50/40 text-sm">
              {deposits.map((x) => (
                <li key={x.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium zego-text">{ownerCodeOf(x)} · {envelopeName(x)}</span>
                    <span className="block text-xs zego-text-tertiary">
                      {x.handover ? `เส้นทาง: ${handoverReceiverText(x.handover)}` : 'ระบุให้ฝากกับกรุ๊ปนี้ — ยังไม่ได้ดึงไป (ดึงได้ที่ปุ่ม “จัดการ”)'}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                    {x.sealed && <span className="whitespace-nowrap text-xs font-semibold tabular-nums zego-text sm:w-28 sm:text-right">{fmtTotals(x.sealed.faceTotals)}</span>}
                    <EnvelopeStatusBadge env={x} short />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {/* Timeline รวมซองฝากด้วย — กรองดูทีละซองได้ (ชื่อซองฝากขึ้นต้นด้วย "ฝากจาก …") */}
        <EnvelopeTimeline sections={sections} limit={50} />
      </div>
    </Drawer>
  );
}

type DocLine = ExpenseRequest['lines'][number];
interface LineInfo { key: string; doc: ExpenseRequest; line: DocLine; no: number }

export function GroupEnvelopeDrawer({ periodId, docs, onClose }: { periodId: string; docs: ExpenseRequest[]; onClose: () => void }) {
  const { envelopes, saveEnvelope, leaders, noEnvelopeMarks, setNoEnvelope } = useDemo();
  const period = getTourPeriodById(periodId);
  const noEnv = noEnvelopeMarks.find((m) => m.periodId === periodId);
  /** ฟอร์มระบุ "กรุ๊ปนี้ไม่มีซอง" */
  const [noEnvForm, setNoEnvForm] = useState(false);
  const [noEnvReason, setNoEnvReason] = useState<string>(NO_ENVELOPE_REASONS[0]);
  const [noEnvNote, setNoEnvNote] = useState('');
  const noEnvNeedsNote = noEnvReason === 'อื่น ๆ';
  const envs = useMemo(() => envelopes.filter((e) => e.periodId === periodId).sort((a, b) => a.no - b.no), [envelopes, periodId]);
  const lines = useMemo(() => groupLines(docs), [docs]);
  const info = useMemo(() => {
    const m = new Map<string, LineInfo>();
    for (const doc of docs) doc.lines.forEach((line, i) => m.set(lineKey(doc.id, line.id), { key: lineKey(doc.id, line.id), doc, line, no: i + 1 }));
    return m;
  }, [docs]);

  const leader = useMemo(() => {
    const a = loadActiveGuideAssignments().find((x) => x.periodId === periodId && x.assignmentStatus === 'CONFIRMED');
    const l = a ? leaders.find((x) => x.id === a.tourLeaderId) : undefined;
    return l ? { id: l.id, name: `${l.firstName} ${l.lastName}`.trim() } : null;
  }, [periodId, leaders]);

  // การจัดที่ยังไม่บันทึกของแต่ละซอง (สลับแท็บแล้วไม่หาย) — ใช้ร่วมกันเพื่อกันจัดรายการเดียวเกินยอดเมื่อแบ่งหลายซอง
  const [drafts, setDrafts] = useState<Record<string, Allocation>>({});
  const allocOf = (e: CashEnvelope) => drafts[e.id] ?? allocationOf(e, lines);
  const allocs = new Map(envs.map((e) => [e.id, allocOf(e)]));
  const free = unassignedLines(lines, envs.map((e) => packingFromAllocation(allocs.get(e.id)!, lines)));

  const [activeId, setActiveId] = useState<string | null>(null);
  const active = envs.find((e) => e.id === activeId) ?? envs.find((e) => !e.sealed) ?? envs[0];
  /** เพิ่งปิดซองนี้ — ถามต่อว่าจะจัดซองถัดไป (ถ้ายังมีรายการเหลือ) หรือส่งมอบซองนี้เลย */
  const [justSealed, setJustSealed] = useState<CashEnvelope | null>(null);
  const goHandover = (env: CashEnvelope) => {
    setActiveId(env.id);
    setJustSealed(null);
    // รอแผงซองวาดส่วน "ส่งมอบซอง" ก่อน แล้วค่อยเลื่อนไปหา
    window.setTimeout(() => document.getElementById(`envelope-handover-${env.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };

  const status = groupEnvelopeStatus(lines, envs, noEnv);

  const addEnvelope = async (withLines: string[] = []) => {
    const env = { ...newEnvelope(periodId, envelopes), packedLineIds: withLines };
    await saveEnvelope(env, 'สร้างซอง', withLines.length ? `${withLines.length} รายการ` : undefined);
    setActiveId(env.id);
  };

  /** ฟอร์มระบุไม่มีซอง — ใช้ทั้งกรุ๊ปที่มีใบเบิกแล้ว และกรุ๊ปที่ยังไม่มีใบเบิก (ระบุไว้ล่วงหน้า) */
  const noEnvFormEl = noEnvForm && (
    <div className="mt-4 space-y-2 rounded-lg zego-surface-soft-bg p-3 text-left">
      <p className="text-sm font-medium zego-text">ระบุว่ากรุ๊ปนี้ไม่มีซองเงินให้รับ</p>
      <div className="grid gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label="เหตุผลที่ไม่มีซอง">
        {NO_ENVELOPE_REASONS.map((r) => (
          <label key={r} className="flex cursor-pointer items-center gap-2 text-sm zego-text">
            <input type="radio" name={`noenv-${periodId}`} className="accent-emerald-600" checked={noEnvReason === r} onChange={() => setNoEnvReason(r)} />
            {r}
          </label>
        ))}
      </div>
      <TextInput
        label="รายละเอียด"
        required={noEnvNeedsNote}
        optional={!noEnvNeedsNote}
        value={noEnvNote}
        onChange={(e) => setNoEnvNote(e.target.value)}
        placeholder="เช่น โอนค่าแลนด์ให้บริษัทแลนด์แล้ว 01/10/26"
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={() => setNoEnvForm(false)}>ยกเลิก</Button>
        <Button
          variant="primary"
          size="sm"
          disabled={noEnvNeedsNote && !noEnvNote.trim()}
          onClick={() => {
            setNoEnvelope(periodId, { reason: noEnvReason, ...(noEnvNote.trim() ? { note: noEnvNote.trim() } : {}), ...(docs.length === 0 ? { beforeDocs: true } : {}) });
            setNoEnvForm(false);
          }}
        >
          ยืนยัน — ไม่มีซอง
        </Button>
      </div>
    </div>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      size="xl"
      title={`ซองเงิน ${period?.groupCode ?? periodCodeOf(periodId)}`}
      description={`${period?.displayName ?? ''}${period ? ` · ${formatDateRange(period.startDate, period.endDate)}` : ''} · ${docs.length ? `เอกสารเบิก ${docs.map((d) => d.id).join(', ')}` : 'ยังไม่มีเอกสารเบิก'}`}
      footer={<Button variant="secondary" onClick={onClose}>ปิด</Button>}
    >
      <div className="space-y-5">
        {/* ซองทั้งหมดของกรุ๊ป */}
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold zego-text">ซองเงินของกรุ๊ป · {envs.length} ซอง</h3>
            <StatusPill label={status.label} tone={status.tone} />
          </div>
          {envs.length === 0 && noEnv ? (
            // การเงินระบุว่ากรุ๊ปนี้ไม่มีซองเงินให้รับ — เจ้าหน้าที่/หัวหน้าทัวร์เห็นสถานะนี้แทน "รอจัดซอง"
            <div className="space-y-2 rounded-lg border zego-border-color px-4 py-4 text-sm">
              <p className="font-semibold zego-text">กรุ๊ปนี้ไม่มีซองเงินให้รับ</p>
              <p className="zego-text-secondary">เหตุผล: {noEnv.reason}{noEnv.note ? ` · ${noEnv.note}` : ''}</p>
              <p className="text-xs zego-text-tertiary">ระบุโดย {noEnv.byName} · {formatDateTime(noEnv.at)}{noEnv.beforeDocs ? ' · ระบุไว้ก่อนมีเอกสารเบิก' : ''}</p>
              {status.recheck && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs zego-text-warning">
                  มีใบเบิกเข้ามาแล้ว ({docs.map((d) => d.id).join(', ')}) — ตรวจว่ายังไม่ต้องจัดซองจริงไหม ถ้าต้องถือเงินสดไป ให้ยกเลิกแล้วจัดซอง
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setNoEnvelope(periodId, null)}>
                  {docs.length ? 'ยกเลิก — กลับไปจัดซอง' : 'ยกเลิกการระบุ'}
                </Button>
                {status.recheck && (
                  <Button variant="primary" size="sm" onClick={() => setNoEnvelope(periodId, { reason: noEnv.reason, ...(noEnv.note ? { note: noEnv.note } : {}) })}>
                    ตรวจแล้ว — ยังไม่มีซอง
                  </Button>
                )}
              </div>
            </div>
          ) : envs.length === 0 && docs.length === 0 ? (
            // ยังไม่มีเอกสารเบิก — จัดซองยังไม่ได้ แต่ระบุล่วงหน้าได้ว่ากรุ๊ปนี้ไม่มีซอง
            <div className="rounded-lg border border-dashed zego-border-color px-4 py-5 text-center text-sm">
              <p className="zego-text-secondary">ยังไม่มีเอกสารเบิก — จัดซองได้เมื่อนำเข้าเอกสารเบิกแล้ว</p>
              <p className="mt-1 text-xs zego-text-tertiary">ถ้ารู้อยู่แล้วว่ากรุ๊ปนี้ไม่ต้องถือเงินสดไป ระบุว่าไม่มีซองไว้ได้เลย</p>
              <div className="mt-3 flex justify-center">
                <Button variant="secondary" size="sm" onClick={() => setNoEnvForm((v) => !v)}>กรุ๊ปนี้ไม่มีซอง</Button>
              </div>
              {noEnvFormEl}
            </div>
          ) : envs.length === 0 ? (
            <div className="rounded-lg border border-dashed zego-border-color px-4 py-5 text-center text-sm">
              <p className="zego-text-secondary">ยังไม่ได้จัดซอง</p>
              <p className="mt-0.5 text-xs zego-text-tertiary">กด “สร้างซอง” แล้วเลือกรายการที่จะใส่ (ใส่ทั้งหมดได้ในคลิกเดียว) — มีรายการเหลือค่อยกด “+ เพิ่มซอง” ใส่ซองถัดไป</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {/*
                  ปุ่มเดียว — เดิมแยก "จัดรวมในซองเดียว" กับ "แยกเป็นหลายซอง" แต่ทางไหนก็แบ่งซองต่อได้อยู่ดี
                  สร้างซองเปล่า ไม่ติ๊กรายการให้เอง — กดเข้ามาแล้วเจอซองที่จัดครบเสร็จแล้วทำให้ผู้ใช้งงว่าเกิดอะไรขึ้น
                */}
                <Button variant="primary" size="sm" icon="plus" onClick={() => void addEnvelope()}>สร้างซอง</Button>
                <Button variant="ghost" size="sm" onClick={() => setNoEnvForm((v) => !v)}>กรุ๊ปนี้ไม่มีซอง</Button>
              </div>
              {noEnvFormEl}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="ซองเงิน">
                {envs.map((e) => {
                  const on = e.id === active?.id;
                  const al = allocs.get(e.id)!;
                  const tot = envelopeTotals(lines, al).packed;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setActiveId(e.id)}
                      title={envelopeName(e)}
                      className={cx('min-w-[11rem] max-w-[16rem] rounded-lg border px-3 py-2 text-left text-sm transition', on ? 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500' : 'zego-border-color hover:border-emerald-300')}
                    >
                      {/* แท็บสั้น ๆ: เลขซอง + สถานะ · ประเภท · ยอด — ชื่อเต็ม/ชื่อเพิ่มเติมอยู่ในรายละเอียดด้านล่าง (ชี้ค้างดูได้) */}
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold zego-text">ซอง {e.no}</span>
                        <EnvelopeStatusBadge env={e} short />
                      </span>
                      <span className={cx('mt-0.5 block truncate text-xs', e.kind ? 'zego-text-secondary' : 'zego-text-warning')}>
                        {e.kind ? ENVELOPE_KIND[e.kind].short : 'ยังไม่เลือกประเภท'}
                      </span>
                      <span className="block text-xs tabular-nums zego-text-tertiary">{Object.keys(al).length} รายการ · {fmtTotals(tot) || '—'}</span>
                    </button>
                  );
                })}
                {/* จัดครบยอดทุกรายการแล้ว (รวมที่ยังไม่บันทึก) — ไม่มีอะไรให้ใส่ซองใหม่ จึงไม่ให้เพิ่มซอง */}
                {free.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void addEnvelope()}
                    className="rounded-lg border border-dashed zego-border-color px-3 py-2 text-sm font-medium zego-text-info hover:border-emerald-300"
                  >
                    + เพิ่มซอง
                  </button>
                )}
              </div>
              {free.length > 0 ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs zego-text-warning">
                  ยังไม่ได้จัดใส่ซอง {free.length} รายการ · {fmtTotals(sumAmounts(free))}
                </p>
              ) : (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs zego-text-success">
                  จัดใส่ซองครบทุกรายการแล้ว · ถ้าต้องการแบ่งซองใหม่ ให้เปิดซองแก้ไขแล้วลดยอดในซองเดิมก่อน
                </p>
              )}
            </>
          )}
        </section>

        {active && (
          <EnvelopePanel
            key={active.id}
            env={active}
            docs={docs}
            info={info}
            lines={lines}
            allocs={allocs}
            envs={envs}
            alloc={allocs.get(active.id)!}
            setAlloc={(a) => setDrafts((d) => ({ ...d, [active.id]: a }))}
            clearDraft={() => setDrafts((d) => {
              const rest = { ...d };
              delete rest[active.id];
              return rest;
            })}
            onDeleted={() => setActiveId(null)}
            onSealed={setJustSealed}
            leader={leader}
            periodId={periodId}
          />
        )}

        {/* ซองฝากจากกรุ๊ปอื่น — ดึงได้ตั้งแต่ยังไม่มีซองของกรุ๊ปนี้ที่ปิดแล้ว (มีแล้วใช้หัวข้อ 3 ในแผงซองแทน) */}
        {!envs.some((e) => e.sealed) && <IncomingDeposits periodId={periodId} leader={leader} />}
      </div>

      {/* หลังปิดซอง — ทำต่อได้ทันที: จัดซองถัดไป (ถ้ายังมีรายการที่ไม่ได้ใส่ซอง) หรือส่งมอบซองนี้ */}
      {justSealed && (
        <Modal
          open
          onClose={() => setJustSealed(null)}
          title={`ปิด${envelopeName(justSealed)}แล้ว`}
          description={free.length > 0
            ? `ยังมีรายการที่ไม่ได้ใส่ซอง ${free.length} รายการ · ${fmtTotals(sumAmounts(free))} — ต้องการทำอะไรต่อ?`
            : 'จัดใส่ซองครบทุกรายการแล้ว — ต้องการส่งมอบซองนี้เลยไหม?'}
          footer={(
            <div className="flex w-full flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setJustSealed(null)}>ไว้ทีหลัง</Button>
              <Button variant={free.length > 0 ? 'secondary' : 'primary'} onClick={() => goHandover(justSealed)}>ส่งมอบซองนี้</Button>
              {free.length > 0 && (
                <Button variant="primary" icon="plus" onClick={() => { setJustSealed(null); void addEnvelope(); }}>จัดซองถัดไป</Button>
              )}
            </div>
          )}
        >
          <ul className="space-y-1.5 text-sm zego-text-secondary">
            {free.length > 0 && <li>• <b className="zego-text">จัดซองถัดไป</b> — สร้างซองใหม่แล้วเลือกรายการที่เหลือใส่ต่อได้เลย</li>}
            <li>• <b className="zego-text">ส่งมอบซองนี้</b> — ไปที่ขั้น “2. ส่งมอบซอง” เลือกเจ้าหน้าที่ส่งกรุ๊ป / หัวหน้าทัวร์ที่รับ</li>
            <li>• <b className="zego-text">ไว้ทีหลัง</b> — ปิดหน้าต่างนี้ กลับมาทำต่อเมื่อไรก็ได้</li>
          </ul>
        </Modal>
      )}
    </Drawer>
  );
}

/*
  ซองของกรุ๊ปอื่นที่รอฝาก — ดึงไปกับคนของกรุ๊ปนี้ได้เลย ไม่ต้องรอจัด/ปิดซองของกรุ๊ปนี้ก่อน (กรุ๊ปที่ไม่มีซองของตัวเองก็ดึงได้)
  ใช้ตอนกรุ๊ปนี้ยังไม่มีซองที่ปิดแล้ว — ถ้ามีแล้ว หัวข้อ "3. ซองของกรุ๊ปอื่นที่ฝากไปด้วย" ในแผงซองทำหน้าที่นี้แทน
  คนถือ: เจ้าหน้าที่ส่งกรุ๊ปที่จัดให้กรุ๊ปนี้ · ทอดหัวหน้าทัวร์ (ถ้าซองให้เลือก) = ส่งตรง / ฝากหัวหน้าทัวร์ของกรุ๊ปนี้
*/
function IncomingDeposits({ periodId, leader }: { periodId: string; leader: { id: string; name: string } | null }) {
  const { saveEnvelope, leaders: allLeaders, envelopes: allEnvelopes } = useDemo();
  const period = getTourPeriodById(periodId);
  const thisGroupCode = period?.groupCode ?? periodCodeOf(periodId);
  const staffList = useMemo(() => {
    const ids = new Set(loadSendOffAssignments().filter((a) => a.periodId === periodId && a.status === 'CONFIRMED').map((a) => a.staffId));
    return loadSendOffStaff().filter((s) => ids.has(s.id) && s.status !== 'disabled').map((s) => ({ id: s.id, name: sendOffStaffName(s) }));
  }, [periodId]);
  const [staffId, setStaffId] = useState(() => staffList[0]?.id ?? '');
  const staff = staffList.find((s) => s.id === staffId);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [legPick, setLegPick] = useState<Record<string, string>>({});

  const leaderOfPeriod = (pid: string) => {
    const a = loadActiveGuideAssignments().find((x) => x.periodId === pid && x.assignmentStatus === 'CONFIRMED');
    const l = a ? allLeaders.find((x) => x.id === a.tourLeaderId) : undefined;
    return l ? { id: l.id, name: `${l.firstName} ${l.lastName}`.trim() } : null;
  };
  const routeOf = (x: CashEnvelope) => {
    const pd = x.pendingDeposit!;
    const owner = leaderOfPeriod(x.periodId);
    const ownerName = owner?.name ?? 'หัวหน้าทัวร์ของกรุ๊ปเจ้าของซอง';
    const staffSide = pd.staff === 'pending' ? staff : pd.staff === 'none' ? undefined : pd.staff;
    const ownerHere = !!leader && !!owner && leader.id === owner.id;
    const legs: { key: string; label: string; carrier?: { id: string; name: string; viaGroup?: string } }[] = [];
    if (pd.leader === 'pending') {
      if (staffSide || ownerHere) legs.push({ key: 'direct', label: ownerHere ? `ส่งถึง ${ownerName} โดยตรง (ไปกับกรุ๊ปนี้อยู่แล้ว)` : `ไม่ผ่านหัวหน้าทัวร์ — ${staffSide!.name} ส่งถึง ${ownerName} เอง` });
      if (leader && !ownerHere) legs.push({ key: `leader:${leader.id}`, label: `ฝาก ${leader.name} (หัวหน้าทัวร์ของกรุ๊ปนี้)`, carrier: { id: leader.id, name: leader.name, viaGroup: thisGroupCode } });
    }
    const leg = legs.find((o) => o.key === legPick[x.id]) ?? legs[0];
    const leaderSide = pd.leader === 'pending' ? leg?.carrier : pd.leader === 'main' ? undefined : pd.leader;
    return { owner, ownerName, staffSide, leaderSide, legs, legKey: leg?.key ?? '' };
  };
  const today = toISODate(new Date());
  const waiting = allEnvelopes
    .filter((x) => x.periodId !== periodId && x.pendingDeposit && x.sealed && !x.handover)
    .map((x) => {
      const pd = x.pendingDeposit!;
      const xp = getTourPeriodById(x.periodId);
      const r = routeOf(x);
      const reason = pd.target && pd.target.periodId !== periodId ? `ระบุให้ฝากไปกับกรุ๊ป ${pd.target.groupCode}`
        : xp && xp.startDate < today ? `กรุ๊ป ${xp.groupCode} ออกเดินทางไปแล้ว — ส่งไม่ทัน`
          : pd.staff === 'pending' && pd.leader !== 'pending' && !r.staffSide ? 'กรุ๊ปนี้ยังไม่มีเจ้าหน้าที่ส่งกรุ๊ปที่คอนเฟิร์ม'
            : pd.leader === 'pending' && r.legs.length === 0 ? 'กรุ๊ปนี้ยังไม่มีเจ้าหน้าที่ส่งกรุ๊ป / หัวหน้าทัวร์ที่คอนเฟิร์ม'
              : null;
      return { env: x, period: xp, reason, forHere: pd.target?.periodId === periodId, ...r };
    })
    .sort((a, b) => Number(b.forHere) - Number(a.forHere) || Number(!!a.reason) - Number(!!b.reason));
  const depositedHere = allEnvelopes.filter((x) => x.periodId !== periodId && !!x.handover && (x.handover.depositedWith ?? x.handover.viaGroup) === thisGroupCode);
  if (waiting.length === 0 && depositedHere.length === 0) return null;

  const pickable = waiting.filter((w) => !w.reason && picked.has(w.env.id));
  const toggle = (id: string) => setPicked((s0) => {
    const n = new Set(s0);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const handOver = async () => {
    for (const w of pickable) {
      const base = {
        at: toISODateTime(new Date()), byName: '', ...(w.owner ? { receiverId: w.owner.id } : {}), receiverName: w.ownerName,
        depositedWith: thisGroupCode, pendingBefore: w.env.pendingDeposit!,
      };
      const next: CashEnvelope = {
        ...w.env,
        handover: w.staffSide
          ? { ...base, receiverKind: 'staff', proxyName: w.staffSide.name, proxyStaffId: w.staffSide.id, viaGroup: thisGroupCode, ...(w.leaderSide ? { nextLeaderCarrier: w.leaderSide } : {}) }
          : w.leaderSide
            ? { ...base, receiverKind: 'leader', proxyName: w.leaderSide.name, proxyLeaderId: w.leaderSide.id, ...(w.leaderSide.viaGroup ? { viaGroup: w.leaderSide.viaGroup } : {}) }
            : { ...base, receiverKind: 'leader' },
      };
      delete next.pendingDeposit;
      const path = [w.staffSide && `${w.staffSide.name} (เจ้าหน้าที่ส่งกรุ๊ป)`, w.leaderSide && `${w.leaderSide.name} (หัวหน้าทัวร์ฝากส่ง)`, `${w.ownerName} (หัวหน้าทัวร์หลัก)`].filter(Boolean).join(' → ');
      await saveEnvelope(next, 'ส่งมอบซอง ฝากไปกับกรุ๊ปอื่น', `${envelopeName(w.env)} · ฝากไปกับกรุ๊ป ${thisGroupCode} · ${path}`);
    }
    setPicked(new Set());
  };
  const cancelDeposit = (x: CashEnvelope) => {
    const h = x.handover!;
    if (!window.confirm(`ยกเลิกฝาก${envelopeName(x)} ของกรุ๊ป ${getTourPeriodById(x.periodId)?.groupCode ?? periodCodeOf(x.periodId)}? ซองจะกลับไปเป็น "รอฝาก"`)) return;
    const rest: CashEnvelope = { ...x, pendingDeposit: h.pendingBefore ?? { at: toISODateTime(new Date()), byName: '', staff: 'pending', leader: 'pending' } };
    delete rest.handover;
    delete rest.staffHandoff;
    return saveEnvelope(rest, 'ยกเลิกฝากไปกับกรุ๊ปอื่น', `${envelopeName(x)} · ยกเลิกฝากไปกับกรุ๊ป ${thisGroupCode} · เดิม: ${handoverReceiverText(h)}`);
  };

  return (
    <section className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <div>
        <h3 className="text-sm font-semibold zego-text">ซองของกรุ๊ปอื่นที่ฝากมากับกรุ๊ปนี้</h3>
        <p className="text-xs zego-text-secondary">ไม่ใช่ซองของกรุ๊ปนี้ — คนของกรุ๊ปนี้ถือไป แล้วนำส่งหัวหน้าทัวร์ของกรุ๊ปเจ้าของซอง · ดึงได้เลย ไม่ต้องรอจัดซองของกรุ๊ปนี้</p>
      </div>
      {waiting.length > 0 && (
        <>
          {staffList.length > 1 ? (
            <label className="block text-xs">
              <span className="mb-1 block font-medium zego-text-secondary">เจ้าหน้าที่ส่งกรุ๊ปที่ถือซองไป</span>
              <select className="w-full rounded-lg border zego-border-color bg-white px-3 py-2 text-sm" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          ) : (
            <p className="text-xs zego-text-secondary">
              เจ้าหน้าที่ส่งกรุ๊ป: <span className="font-medium zego-text">{staff?.name ?? 'ยังไม่มีที่คอนเฟิร์ม'}</span>
              {' '}· หัวหน้าทัวร์: <span className="font-medium zego-text">{leader?.name ?? 'ยังไม่มีที่คอนเฟิร์ม'}</span>
            </p>
          )}
          {waiting.map((w) => (
            <div key={w.env.id} className={cx('rounded-md border bg-white px-2 py-1.5 text-xs', w.forHere ? 'border-emerald-300' : 'zego-border-color', w.reason && 'opacity-60')}>
              <label className={cx('flex items-start gap-2', w.reason ? 'cursor-not-allowed' : 'cursor-pointer')}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600" disabled={!!w.reason} checked={!w.reason && picked.has(w.env.id)} onChange={() => toggle(w.env.id)} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 font-medium zego-text">
                    {w.period?.groupCode ?? periodCodeOf(w.env.periodId)} · {envelopeName(w.env)}
                    {w.forHere && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">ระบุให้ฝากกับกรุ๊ปนี้</span>}
                  </span>
                  <span className="block zego-text-secondary">
                    {w.period && `ออกเดินทาง ${formatDateRange(w.period.startDate, w.period.endDate)} · `}ปลายทาง {w.ownerName}
                  </span>
                  {w.reason && <span className="block zego-text-warning">ฝากไม่ได้: {w.reason}</span>}
                </span>
                <span className="shrink-0 font-semibold tabular-nums zego-text">{fmtTotals(w.env.sealed?.faceTotals ?? [])}</span>
              </label>
              {!w.reason && w.legs.length > 1 && (
                <label className="mt-1.5 block pl-6">
                  <span className="mb-0.5 block zego-text-secondary">ทอดหัวหน้าทัวร์</span>
                  <select
                    className="w-full rounded-lg border zego-border-color bg-white px-2 py-1.5 text-xs"
                    value={w.legKey}
                    onChange={(e) => { const v = e.target.value; setLegPick((m) => ({ ...m, [w.env.id]: v })); }}
                  >
                    {w.legs.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </label>
              )}
            </div>
          ))}
          <div className="flex justify-end">
            <Button variant="primary" size="sm" disabled={pickable.length === 0} onClick={() => void handOver()}>
              ฝากไปกับกรุ๊ปนี้{pickable.length > 0 ? ` ${pickable.length} ซอง` : ''}
            </Button>
          </div>
        </>
      )}
      {depositedHere.length > 0 && (
        <div className="space-y-1 rounded-lg border zego-border-color bg-white px-3 py-2">
          <p className="text-xs font-semibold zego-text-secondary">ฝากไปกับกรุ๊ปนี้แล้ว {depositedHere.length} ซอง</p>
          {depositedHere.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 font-medium zego-text">{getTourPeriodById(x.periodId)?.groupCode ?? periodCodeOf(x.periodId)} · {envelopeName(x)}</span>
              <EnvelopeStatusBadge env={x} />
              <span className="w-full zego-text-secondary">{handoverReceiverText(x.handover!)}</span>
              {canEditHandover(x) && <Button variant="secondary" size="sm" icon="edit" onClick={() => void cancelDeposit(x)}>ยกเลิกฝาก</Button>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** ซองใบเดียว: จัดรายการ → ปิดซอง → ส่งมอบ → หัวหน้าทัวร์รับ · ประวัติ */
function EnvelopePanel({
  env, docs, info, lines, allocs, envs, alloc, setAlloc, clearDraft, onDeleted, onSealed, leader, periodId,
}: {
  env: CashEnvelope;
  docs: ExpenseRequest[];
  info: Map<string, LineInfo>;
  lines: ReturnType<typeof groupLines>;
  /** การจัดของทุกซองในกรุ๊ป (รวมฉบับร่าง) — id ซอง → การจัด */
  allocs: Map<string, Allocation>;
  envs: CashEnvelope[];
  alloc: Allocation;
  setAlloc: (a: Allocation) => void;
  clearDraft: () => void;
  onDeleted: () => void;
  /** ปิดซองสำเร็จ — ให้แผงหลักถามต่อ (จัดซองถัดไป / ส่งมอบ) */
  onSealed?: (env: CashEnvelope) => void;
  leader: { id: string; name: string } | null;
  periodId: string;
}) {
  const { saveEnvelope, deleteEnvelope, leaders: allLeaders, envelopes: allEnvelopes } = useDemo();
  const stage = envelopeStage(env);
  const period = getTourPeriodById(periodId);
  const name = envelopeName(env);
  const staffOptions = useMemo(() => {
    const all = loadSendOffStaff().filter((s) => s.status !== 'disabled');
    const assigned = new Set(loadSendOffAssignments().filter((a) => a.periodId === periodId).map((a) => a.staffId));
    return all
      .map((s) => ({ id: s.id, name: sendOffStaffName(s), assigned: assigned.has(s.id) }))
      .sort((a, b) => Number(b.assigned) - Number(a.assigned) || a.name.localeCompare(b.name, 'th'));
  }, [periodId]);

  /* ---------------- 1) จัดซอง ---------------- */
  const [label, setLabel] = useState(env.label ?? '');
  const [kind, setKind] = useState<EnvelopeKind | undefined>(env.kind);
  const [forGroup, setForGroup] = useState(env.forGroup ?? '');
  const kindReady = envelopeKindReady(kind, forGroup);
  const packed = Object.keys(alloc);
  const totals = envelopeTotals(lines, alloc);
  const changed = docChangedSinceSeal(env, lines);
  const mine = new Set(packed);
  // 1 รายการแบ่งหลายซองได้ — ซองอื่นจัดรายการเดียวกันไปเท่าไร (ใช้กันจัดเกินยอดรายการ)
  const otherParts = (k: string) => envs
    .filter((e) => e.id !== env.id && allocs.get(e.id)?.[k] !== undefined)
    .map((e) => ({ no: e.no, amount: allocs.get(e.id)![k] }));
  const others = new Map(lines.map((l) => [l.id, otherParts(l.id).reduce((s, p) => s + p.amount, 0)]));
  /** ยอดที่ซองนี้ใส่ได้สูงสุดของรายการ = ยอดรายการ − ที่ซองอื่นจัดไปแล้ว */
  const room = (k: string) => Math.round(((info.get(k)?.line.amount ?? 0) - (others.get(k) ?? 0)) * 100) / 100;
  const available = lines.filter((l) => room(l.id) > 0).map((l) => l.id);
  const allIn = available.length > 0 && available.every((k) => alloc[k] === room(k));
  const toggle = (k: string) => {
    const next = { ...alloc };
    if (k in next) delete next[k];
    else next[k] = room(k);
    setAlloc(next);
  };
  const setAmount = (k: string, v: number) => setAlloc({ ...alloc, [k]: v });
  const fillAll = () => setAlloc(allIn ? {} : Object.fromEntries(available.map((k) => [k, room(k)])));
  /** ซองนี้ ณ ฟิลด์การจัดปัจจุบัน (เต็มจำนวน = ไม่เก็บ splits) */
  const withPacking = (e: CashEnvelope): CashEnvelope => {
    const out: CashEnvelope = { ...e };
    delete out.splits;
    return { ...out, ...packingFromAllocation(alloc, lines) };
  };
  const sealable = canSeal(lines, alloc, others);
  const savedAlloc = allocationOf(env, lines);

  // เอกสาร → หมวด → รายการ (ตอนปิดแล้วแสดงเฉพาะรายการในซองนี้)
  const sections = useMemo(() => {
    return docs
      .map((doc) => {
        const cats: { category: string; rows: LineInfo[] }[] = [];
        for (const line of doc.lines) {
          const li = info.get(lineKey(doc.id, line.id))!;
          if (stage !== 'packing' && !env.packedLineIds.includes(li.key)) continue;
          const cat = line.expenseType.replace(/^#\s*(หมวด)?\s*/, '').trim() || 'อื่น ๆ';
          const last = cats.at(-1);
          if (last && last.category === cat) last.rows.push(li);
          else cats.push({ category: cat, rows: [li] });
        }
        return { doc, cats };
      })
      .filter((d) => d.cats.length > 0);
  }, [docs, info, stage, env.packedLineIds]);

  const labelNow = label.trim() || undefined;
  const withLabel = (e: CashEnvelope): CashEnvelope => {
    const out = { ...e };
    if (labelNow) out.label = labelNow;
    else delete out.label;
    if (kind) out.kind = kind;
    else delete out.kind;
    // กรุ๊ปปลายทางใช้กับประเภท 4 เท่านั้น — เปลี่ยนประเภทแล้วล้างทิ้ง
    if (kind === 'land_tip' && forGroup.trim()) out.forGroup = forGroup.trim();
    else delete out.forGroup;
    return out;
  };
  const savePacking = async () => {
    await saveEnvelope(withLabel(withPacking(env)), 'บันทึกการจัดซอง', `${name} · ${packed.length} รายการ`);
    clearDraft();
  };
  const seal = async () => {
    const snap = lines.filter((l) => mine.has(l.id));
    const sealedEnv = withLabel({ ...withPacking(env), sealed: { at: toISODateTime(new Date()), byName: '', faceTotals: totals.packed, lineSnapshot: snap } });
    await saveEnvelope(sealedEnv, 'ปิดซอง', `${name} · ยอดหน้าซอง ${fmtTotals(totals.packed)}`);
    clearDraft();
    onSealed?.(sealedEnv);
  };
  const unseal = () => {
    const rest: CashEnvelope = { ...env };
    delete rest.sealed;
    // เปิดซองแก้ไข = ยอดอาจเปลี่ยน — ยกเลิกการรอฝากด้วย (ปิดซองใหม่แล้วค่อยตั้งใหม่)
    delete rest.pendingDeposit;
    return saveEnvelope(rest, 'เปิดซองแก้ไขการจัด', name);
  };
  const remove = async () => {
    if (packed.length > 0 && !window.confirm(`ลบ${name}? รายการในซองจะกลับไปเป็น "ยังไม่ได้จัด"`)) return;
    await deleteEnvelope(env);
    clearDraft();
    onDeleted();
  };
  /**
   * ยกเลิกซองนี้ (กดเดียว) — ทำได้จนกว่าจะส่งมอบ · ซองที่ปิดแล้วจะถูกเปิดก่อนแล้วลบ (store ห้ามลบซองที่ปิดอยู่)
   * รายการในซองกลับไปเป็น "ยังไม่ได้จัด" · ส่งมอบแล้วต้องยกเลิกการส่งมอบก่อน
   */
  const cancelEnvelope = async () => {
    if (!window.confirm(`ยกเลิก${name}? ซองนี้จะถูกลบ และรายการในซองจะกลับไปเป็น "ยังไม่ได้จัด"`)) return;
    let target = env;
    if (env.sealed) {
      const rest: CashEnvelope = { ...env };
      delete rest.sealed;
      delete rest.pendingDeposit;
      await saveEnvelope(rest, 'เปิดซองเพื่อยกเลิก', name);
      target = rest;
    }
    await deleteEnvelope(target);
    clearDraft();
    onDeleted();
  };

  /* ---------------- 2) ส่งมอบ ---------------- */
  // ไม่เซ็น/ถ่ายรูปบนเครื่องการเงิน — ผู้รับยืนยันในเครื่องของตัวเอง (เจ้าหน้าที่: /staff · หัวหน้าทัวร์: แอปหัวหน้าทัวร์)
  const assignedStaff = staffOptions.filter((s) => s.assigned);
  /*
    เส้นทางซอง — 2 ขั้นต่อกัน (ตามรายละเอียดขั้นตอนจากฝ่ายการเงิน)
    ขั้น 1 เจ้าหน้าที่ส่งกรุ๊ป (route)
      เจ้าหน้าที่ประจำกรุ๊ป          own
      เจ้าหน้าที่ประจำกรุ๊ปอื่น (รับแทน) carrierToLeader  เลือกคน + รหัสกรุ๊ปที่เขาได้รับมอบหมาย
                                       แล้วเลือกว่านำไปส่ง หัวหน้าทัวร์ประจำกรุ๊ป / หัวหน้าทัวร์ประจำกรุ๊ปอื่น (= เลือกขั้น 2 ให้)
      ไม่มีเจ้าหน้าที่ส่งกรุ๊ปมารับ   none
      (ติ๊ก "ยังไม่รู้ว่าจะฝากไปกับใคร" เหนือการ์ด = รอฝาก: pendingTarget รู้กรุ๊ปแล้ว / pendingAny ยังไม่รู้กรุ๊ป)
    ขั้น 2 หัวหน้าทัวร์ (leaderRoute)
      หัวหน้าทัวร์ประจำกรุ๊ป                  main
      หัวหน้าทัวร์ประจำกรุ๊ปอื่น (รับแทน)      carrier  เลือกคน + รหัสกรุ๊ป แล้วเลือกว่านำส่งให้ (carrierDest)
                                              main = หัวหน้าทัวร์ประจำกรุ๊ป · otherLeader = หัวหน้าทัวร์ประจำกรุ๊ปอื่นอีกคน
                                              (คนนั้นเป็นผู้ถือต่อ ส่งต่ออีกทอดได้) · land = ส่งให้แลนด์ (ผู้ถือระบุชื่อแลนด์ + รูปตอนส่ง)
    ทุกทอดกดรับในแอปของตัวเอง ตรวจย้อนหลังได้
    (staffChoice / leaderChoice ด้านล่างคำนวณจาก route + leaderRoute — โค้ดส่วนฝากซองกรุ๊ปอื่นยังใช้ชุดเดิม)
  */
  type StaffChoice = 'staff' | 'carrierStaff' | 'none';
  type LeaderChoice = 'leader' | 'carrierLeader';
  type Route = 'own' | 'carrierToLeader' | 'pendingAny' | 'pendingTarget' | 'none';
  type LeaderRoute = 'main' | 'carrier';
  type CarrierDest = 'main' | 'otherLeader' | 'land';
  // ซองที่ตั้ง "รอฝาก" ไว้ — เปิดฟอร์มส่งมอบมาพร้อมค่าที่ตั้งไว้ แก้/บันทึกต่อได้จากตรงนี้เลย
  const pd0 = env.pendingDeposit;
  const pdStaff = pd0 && typeof pd0.staff === 'object' ? pd0.staff : undefined;
  const pdLeader = pd0 && typeof pd0.leader === 'object' ? pd0.leader : undefined;
  const pdStaffIsOwn = !!pdStaff && assignedStaff.some((s0) => s0.id === pdStaff.id);
  const [route, setRoute] = useState<Route>(() => {
    if (!pd0) return assignedStaff.length > 0 ? 'own' : 'none';
    if (pd0.staff === 'pending') return pd0.target ? 'pendingTarget' : 'pendingAny';
    if (pd0.staff === 'none') return 'none';
    return pdStaffIsOwn ? 'own' : 'carrierToLeader';
  });
  /** ติ๊ก "ยังไม่รู้ว่าจะฝากไปกับใคร" = รอฝาก — เอาติ๊กออกแล้วกลับไปตัวเลือกเดิม */
  const [routeBeforePending, setRouteBeforePending] = useState<Route>(assignedStaff.length > 0 ? 'own' : 'none');
  const isPending = route === 'pendingAny' || route === 'pendingTarget';
  /** ซองที่บันทึกรอฝากแล้ว — แสดงสรุปก่อน กด "แก้ไข" จึงเปิดฟอร์ม (กันกดเปลี่ยนโดยไม่ตั้งใจ) */
  const [editPending, setEditPending] = useState(false);
  const togglePending = (on: boolean) => {
    if (on) { if (!isPending) setRouteBeforePending(route); setRoute('pendingAny'); }
    else setRoute(routeBeforePending);
  };
  const [leaderRouteRaw, setLeaderRoute] = useState<LeaderRoute>(() => (pd0 && typeof pd0.leader === 'object' ? 'carrier' : 'main'));
  // ซองรอฝาก — ยังไม่รู้คนถือ จึงกำหนดหัวหน้าทัวร์คนอื่นต่อไม่ได้ ไปถึงหัวหน้าทัวร์ประจำกรุ๊ปเท่านั้น
  const leaderRoute: LeaderRoute = isPending ? 'main' : leaderRouteRaw;
  /** หัวหน้าทัวร์ประจำกรุ๊ปอื่น (รับแทน) นำส่งให้ใคร */
  const [carrierDest, setCarrierDest] = useState<CarrierDest>('main');
  /** หัวหน้าทัวร์ (รับแทน) นำส่งแลนด์เอง — ไม่ผ่านหัวหน้าทัวร์ประจำกรุ๊ป */
  const isToLand = leaderRoute === 'carrier' && carrierDest === 'land';
  const staffChoice: StaffChoice = route === 'own' ? 'staff' : route === 'none' ? 'none' : 'carrierStaff';
  const leaderChoice: LeaderChoice = leaderRoute === 'main' ? 'leader' : 'carrierLeader';
  // คนที่เลือกไว้ของแต่ละแบบฝาก — แยกกัน สลับไปมาแล้วไม่หาย
  const [carrierKeys, setCarrierKeys] = useState<{ carrierStaff: string; carrierLeader: string; secondLeader: string }>(() => ({
    carrierStaff: pdStaff && !pdStaffIsOwn ? `staff:${pdStaff.id}` : '',
    carrierLeader: pdLeader ? `leader:${pdLeader.id}` : '',
    secondLeader: '',
  }));
  // ผู้ที่ฝากได้ — หัวหน้าทัวร์มีกรุ๊ปที่ดูแลอยู่ (ยังไม่จบ) ไว้ระบุว่าไปกับกรุ๊ปไหน · เจ้าหน้าที่แสดงแค่ชื่อ
  const carrierOptions = useMemo(() => {
    const today = toISODate(new Date());
    /*
      กรุ๊ปที่ฝากไปด้วยได้ = กรุ๊ปของคนนั้นที่คอนเฟิร์มแล้ว (กรองที่ตัวเรียก) และ "ส่งทัน" ถึงหัวหน้าทัวร์ของกรุ๊ปนี้
      ซองต้องถึงหัวหน้าทัวร์ของกรุ๊ปนี้ "ก่อนกรุ๊ปนี้ออกเดินทาง" — ส่งให้กันวันไหนก็ได้ (ไม่ผูกกับวันที่กรุ๊ปของผู้ถือออกเดินทาง)
      · กรุ๊ปนี้ออกเดินทางไปแล้ว → ฝากไม่ทัน ไม่มีกรุ๊ปให้เลือก
      · กรุ๊ปของผู้ถือต้องยังไม่ออกเดินทาง (ยังมารับซองที่สำนักงานได้) — ใช้เกณฑ์เดียวกันทั้งเจ้าหน้าที่และหัวหน้าทัวร์
    */
    const ownStart = period?.startDate ?? '9999-12-31';
    /*
      pickup = มารับซองจากการเงิน (เจ้าหน้าที่ / หัวหน้าทัวร์รับแทน) → กรุ๊ปต้องยังไม่ออกเดินทาง
      handoff = หัวหน้าทัวร์ที่รับต่อจากหัวหน้าทัวร์ (รับแทน) — ไม่ได้มารับที่สำนักงาน ไม่ผูกกับวันออกเดินทาง → แค่กรุ๊ปยังไม่จบทริป
    */
    const groupsOf = (periodIds: string[], mode: 'pickup' | 'handoff' = 'pickup') => (ownStart < today ? [] : [...new Set(periodIds)]
      .map((id) => getTourPeriodById(id))
      .filter((p): p is NonNullable<typeof p> => !!p && p.internalId !== periodId && (mode === 'pickup' ? p.startDate >= today : p.endDate >= today))
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map((p) => ({ code: p.groupCode, start: p.startDate, dates: formatDateRange(p.startDate, p.endDate) })));
    // เฉพาะงานที่คอนเฟิร์มแล้ว — งานที่ยังรอคอนเฟิร์มอาจเปลี่ยนคน ซองจะไปผิดมือ
    const leaderAssign = loadActiveGuideAssignments().filter((a) => a.assignmentStatus === 'CONFIRMED');
    const staffAssign = loadSendOffAssignments().filter((a) => a.status === 'CONFIRMED');
    const people = [
      // เจ้าหน้าที่ส่งกรุ๊ป — กรุ๊ปที่เขาไปส่ง (ใช้เลือกว่าฝากไปกับกรุ๊ปไหน)
      ...staffOptions.filter((x) => !x.assigned).map((x) => ({
        key: `staff:${x.id}`, kind: 'staff' as const, id: x.id, name: x.name,
        groups: groupsOf(staffAssign.filter((a) => a.staffId === x.id).map((a) => a.periodId)),
      })),
      ...allLeaders.filter((l) => l.id !== leader?.id).map((l) => {
        const ids = leaderAssign.filter((a) => a.tourLeaderId === l.id).map((a) => a.periodId);
        return {
          key: `leader:${l.id}`, kind: 'leader' as const, id: l.id, name: `${l.firstName} ${l.lastName}`.trim(),
          groups: groupsOf(ids),
          handoffGroups: groupsOf(ids, 'handoff'),
        };
      }),
    ];
    return people.sort((a, b) => Number(b.groups.length > 0) - Number(a.groups.length > 0) || a.name.localeCompare(b.name, 'th'));
  }, [staffOptions, allLeaders, leader?.id, periodId, period?.startDate]);
  // รายชื่อให้เลือก = เฉพาะคนที่มีกรุ๊ปฝากไปด้วยได้ (คอนเฟิร์มแล้ว + ส่งทัน) — ต้องเลือกกรุ๊ปเสมอ คนที่ไม่มีจึงเลือกไม่ได้
  const staffCarrierList = carrierOptions.filter((c) => c.kind === 'staff' && c.groups.length > 0);
  const leaderCarrierList = carrierOptions.filter((c) => c.kind === 'leader' && c.groups.length > 0);
  /** หัวหน้าทัวร์ประจำกรุ๊ปอื่นที่รับต่อ — รับจากหัวหน้าทัวร์ (รับแทน) ไม่เกี่ยวกับการมารับที่สำนักงาน */
  const secondLeaderList = carrierOptions.flatMap((c) => (c.kind === 'leader' && c.handoffGroups && c.handoffGroups.length > 0 ? [{ ...c, groups: c.handoffGroups }] : []));
  const [staffId, setStaffId] = useState(() => (pdStaffIsOwn ? pdStaff!.id : assignedStaff[0]?.id ?? ''));

  /** ผู้รับจากการเงิน (ช่วงเจ้าหน้าที่) — ไม่ผ่านเจ้าหน้าที่ = undefined */
  const staffPerson = route === 'own'
    ? staffOptions.find((s) => s.id === staffId)
    : route === 'carrierToLeader' ? staffCarrierList.find((c) => c.key === carrierKeys.carrierStaff) : undefined;
  /** หัวหน้าทัวร์ที่ฝาก (ช่วงหัวหน้าทัวร์) — ส่งหัวหน้าทัวร์หลักตรง = undefined */
  const leaderCarrier = leaderChoice === 'carrierLeader' ? leaderCarrierList.find((c) => c.key === carrierKeys.carrierLeader) : undefined;
  // ฝากไปกับหัวหน้าทัวร์ — กรุ๊ปที่ไปด้วย = กรุ๊ปถัดไปที่เขาดูแล (บันทึกไว้ตรวจย้อนหลัง)
  // กรุ๊ปที่คนที่ฝากไปด้วย — ต้องเลือกเมื่อระบุชื่อ (ทั้งเจ้าหน้าที่และหัวหน้าทัวร์) · บันทึกไว้ตรวจย้อนหลัง
  const [viaKeys, setViaKeys] = useState<{ carrierStaff: string; carrierLeader: string; secondLeader: string }>(() => ({
    carrierStaff: '',
    carrierLeader: pdLeader?.viaGroup ?? '',
    secondLeader: '',
  }));
  const staffVia = route === 'carrierToLeader' && staffPerson ? viaKeys.carrierStaff : '';
  const via = leaderCarrier ? viaKeys.carrierLeader : '';
  /** หัวหน้าทัวร์ประจำกรุ๊ปอื่นอีกคน ที่หัวหน้าทัวร์ (รับแทน) นำส่งให้ — คนนั้นถือต่อ และส่งต่ออีกทอดได้ในแอปของตัวเอง */
  const secondLeader = leaderRoute === 'carrier' && carrierDest === 'otherLeader'
    ? secondLeaderList.find((c) => c.key === carrierKeys.secondLeader && c.id !== leaderCarrier?.id) : undefined;
  const secondVia = secondLeader ? viaKeys.secondLeader : '';
  const leaderName = leader?.name ?? 'หัวหน้าทัวร์ของกรุ๊ป';
  /*
    เลือกแบบฝากแต่ยังไม่ระบุคน = "รอฝากไปกับกรุ๊ปอื่น" — บันทึกได้ (ยังไม่ส่งมอบ)
    แล้วไปหยิบซองนี้ตอนทำส่งมอบของกรุ๊ปอื่น ฝากกับเจ้าหน้าที่/หัวหน้าทัวร์ของกรุ๊ปนั้น
  */
  /*
    รอฝากได้เฉพาะเมื่อ "ยังไม่มีใครรับซองจากการเงิน" —
    มีเจ้าหน้าที่รับแล้ว (ของกรุ๊ปนี้ / เลือกคนแล้ว) แต่ยังไม่เลือกหัวหน้าทัวร์ที่ฝาก = ต้องเลือกให้ครบ
    (เจ้าหน้าที่ต้องรู้ว่าจะไปส่งให้ใคร ไม่ใช่ปล่อยซองค้างที่การเงินทั้งที่มีคนพร้อมรับ)
  */
  const pendingStaff = route === 'pendingAny' || route === 'pendingTarget';
  const pending = pendingStaff;
  /*
    รอฝากแต่รู้แล้วว่าจะไปกับกรุ๊ปไหน (ยังไม่รู้คนถือ) — ล็อกซองให้กรุ๊ปนั้นหยิบได้กรุ๊ปเดียว
    กรุ๊ปที่เลือกได้ = กรุ๊ปก่อนเดินทางที่ส่งทัน ตามเกณฑ์เดียวกับเลือกคน (รอเจ้าหน้าที่: ออกเดินทางวันนี้–วันออกเดินทางของกรุ๊ปนี้ · รอแค่หัวหน้าทัวร์: ออกเดินทางวันนี้–วันกลับของกรุ๊ปนี้)
  */
  const [targetPeriodId, setTargetPeriodId] = useState(() => pd0?.target?.periodId ?? '');
  const targetOptions = useMemo(() => {
    if (!pending) return [];
    const today = toISODate(new Date());
    // ส่งให้หัวหน้าทัวร์กันวันไหนก็ได้ก่อนกรุ๊ปนี้ออก — กรุ๊ปที่ฝากต้องยังไม่ออกเดินทาง · กรุ๊ปนี้ออกไปแล้ว = ฝากไม่ทัน
    const ownStart = period?.startDate ?? '9999-12-31';
    if (ownStart < today) return [];
    return getAssignablePeriods()
      .filter((p) => p.internalId !== periodId && p.startDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.groupCode.localeCompare(b.groupCode));
  }, [pending, periodId, period?.startDate]);
  // กรุ๊ปที่เลือกไว้ใช้ไม่ได้แล้ว (เปลี่ยนแบบฝาก / เลยวัน) → ถือว่ายังไม่ระบุ
  const target = route === 'pendingTarget' ? targetOptions.find((p) => p.internalId === targetPeriodId) : undefined;
  // ค้นหารหัสกรุ๊ป — กรุ๊ปที่เลือกไว้ยังอยู่ในรายการเสมอ
  const [targetQuery, setTargetQuery] = useState('');
  /** คำค้นชื่อในช่องเลือกคนรับแทน / คนรับต่อ (แยกตามช่อง) */
  const [pickQuery, setPickQuery] = useState<Record<string, string>>({});
  const targetQ = targetQuery.trim().toUpperCase();
  const targetShown = targetQ
    ? targetOptions.filter((p) => p.internalId === target?.internalId || p.groupCode.toUpperCase().includes(targetQ))
    : targetOptions;
  /*
    ช่วงวันออกเดินทางที่ "ส่งทัน" — บอกผู้ใช้ตรง ๆ ว่าทำไมกรุ๊ปที่พิมพ์ไม่ขึ้น (เดิมขึ้นแค่ "ไม่พบ" ดูเหมือนข้อมูลหาย)
    ถ้าพิมพ์รหัสกรุ๊ปที่มีอยู่จริงแต่อยู่นอกช่วง → บอกวันออกเดินทางของกรุ๊ปนั้นเทียบให้เห็น
  */
  const targetRangeEnd = period?.startDate;
  // ช่วงปิดไปแล้ว (กรุ๊ปนี้ออกเดินทาง/จบทริปก่อนวันนี้) — ไม่มีกรุ๊ปไหนส่งทัน ต้องบอกตรง ๆ ไม่ใช่แสดงช่วงวันกลับหัว
  const targetRangeClosed = !!targetRangeEnd && targetRangeEnd < toISODate(new Date());
  const targetRangeText = targetRangeEnd && !targetRangeClosed ? `กรุ๊ปที่ยังไม่ออกเดินทาง · ส่งให้หัวหน้าทัวร์ก่อน ${formatDate(targetRangeEnd)}` : '';
  const targetEmptyMessage = (() => {
    if (targetRangeClosed) return `กรุ๊ปนี้ออกเดินทางไปแล้ว (${formatDate(targetRangeEnd!)}) — ฝากไปกับกรุ๊ปอื่นไม่ทัน`;
    const hit = targetQ ? getAssignablePeriods().find((p) => p.internalId !== periodId && p.groupCode.toUpperCase().includes(targetQ)) : undefined;
    if (hit) return `กรุ๊ป ${hit.groupCode} ออกเดินทางไปแล้ว (${formatDate(hit.startDate)}) — ฝากไปด้วยไม่ได้`;
    return `ไม่พบกรุ๊ปที่ตรงกับคำค้น — เลือกได้เฉพาะ${targetRangeText}`;
  })();
  /** ขั้น 1 (เจ้าหน้าที่) ยังขาดอะไร — ครบแล้วจึงแสดงขั้น 2 (หัวหน้าทัวร์) */
  const staffStepMissing = [
    route === 'own' && !staffPerson && 'เจ้าหน้าที่ส่งกรุ๊ป',
    route === 'carrierToLeader' && !staffPerson && 'เจ้าหน้าที่ประจำกรุ๊ปอื่น (รับแทน)',
    route === 'carrierToLeader' && !!staffPerson && !staffVia && 'รหัสกรุ๊ปของเจ้าหน้าที่ (รับแทน)',
  ].filter(Boolean) as string[];
  const handoverMissing = [
    ...staffStepMissing,
    route === 'pendingTarget' && !target && 'กรุ๊ปที่จะฝากไปด้วย',
    // หัวหน้าทัวร์ประจำกรุ๊ปรับจากการเงินเอง (ไม่ผ่านใครเลย) — ต้องมีหัวหน้าทัวร์ที่คอนเฟิร์มแล้ว
    route === 'none' && leaderRoute === 'main' && !leader && 'หัวหน้าทัวร์ประจำกรุ๊ป (ยังไม่มีที่คอนเฟิร์ม)',
    leaderChoice === 'carrierLeader' && !leaderCarrier && 'หัวหน้าทัวร์ประจำกรุ๊ปอื่น (รับแทน)',
    leaderChoice === 'carrierLeader' && !!leaderCarrier && !via && 'รหัสกรุ๊ปของหัวหน้าทัวร์ (รับแทน)',
    leaderRoute === 'carrier' && carrierDest === 'otherLeader' && !secondLeader && 'หัวหน้าทัวร์ประจำกรุ๊ปอื่นที่รับต่อ',
    !!secondLeader && !secondVia && 'รหัสกรุ๊ปของหัวหน้าทัวร์ที่รับต่อ',
  ].filter(Boolean) as string[];
  /** เส้นทางที่จะเกิดขึ้น — แสดงก่อนกดบันทึก */
  const plannedPath = [
    'การเงิน',
    staffPerson ? `${staffPerson.name} (เจ้าหน้าที่ส่งกรุ๊ป${staffVia ? ` · ${staffVia}` : ''})` : pendingStaff && `คนของ${target ? `กรุ๊ป ${target.groupCode}` : 'กรุ๊ปที่ดึงซองไป'} (เจ้าหน้าที่ / หัวหน้าทัวร์ — เลือกตอนกรุ๊ปนั้นทำส่งมอบ)`,
    leaderChoice === 'carrierLeader' && `${leaderCarrier?.name ?? 'หัวหน้าทัวร์ (รับแทน)'} (หัวหน้าทัวร์รับแทน${via ? ` · ${via}` : ''})`,
    isToLand ? 'แลนด์ (ระบุชื่อตอนส่ง)'
      : carrierDest === 'otherLeader' && leaderRoute === 'carrier' ? `${secondLeader?.name ?? 'หัวหน้าทัวร์ประจำกรุ๊ปอื่น'} (หัวหน้าทัวร์ประจำกรุ๊ปอื่น${secondVia ? ` · ${secondVia}` : ''})`
      : `${leaderName} (หัวหน้าทัวร์ประจำกรุ๊ป)`,
  ].filter(Boolean) as string[];

  /*
    เส้นทางซองแบบทีละทอด (แสดงก่อนกดบันทึก) — แต่ละทอด: บทบาท (บรรทัดเล็ก) + ใคร (ตัวหนา) + รายละเอียด
    ลำดับบนลงล่าง = ส่งต่อกันตามเส้น จึงไม่ต้องเขียน "รับจาก …" ซ้ำ
    แยกจาก plannedPath (ข้อความบรรทัดเดียวไว้บันทึกประวัติ)
  */
  type PathStep = { role: string; who: string; detail?: string; pending?: boolean; end?: boolean };
  const plannedSteps: PathStep[] = (() => {
    const ownCode = period?.groupCode ?? periodCodeOf(periodId);
    const steps: PathStep[] = [{ role: 'ผู้ส่งมอบ', who: 'การเงิน' }];
    if (staffPerson) {
      steps.push(route === 'own'
        ? { role: 'เจ้าหน้าที่ประจำกรุ๊ป', who: staffPerson.name, detail: `กรุ๊ป ${ownCode}` }
        : { role: 'เจ้าหน้าที่ประจำกรุ๊ปอื่น (รับแทน)', who: staffPerson.name, detail: staffVia ? `กรุ๊ป ${staffVia}` : undefined });
    } else if (route === 'carrierToLeader') {
      steps.push({ role: 'เจ้าหน้าที่ประจำกรุ๊ปอื่น (รับแทน)', who: 'ยังไม่ได้เลือก', pending: true });
    } else if (pendingStaff) {
      steps.push({
        role: 'ผู้ถือซองไปส่ง (รับแทน)',
        who: `คนของ${target ? `กรุ๊ป ${target.groupCode}` : 'กรุ๊ปที่ดึงซองไป'} (เจ้าหน้าที่ / หัวหน้าทัวร์)`,
        detail: 'เลือกตอนกรุ๊ปนั้นทำส่งมอบ',
        pending: true,
      });
      // ยังไม่รู้คนถือ → ทอดถัดไปยังกำหนดไม่ได้ (กรุ๊ปที่ดึงซองไปเป็นคนเลือก) — เส้นทางจบแค่นี้
      return steps;
    }
    if (leaderChoice === 'carrierLeader') {
      steps.push({ role: 'หัวหน้าทัวร์ประจำกรุ๊ปอื่น (รับแทน)', who: leaderCarrier?.name ?? 'ยังไม่ได้เลือก', detail: via ? `กรุ๊ป ${via}` : undefined, pending: !leaderCarrier });
    }
    if (isToLand) steps.push({ role: 'ผู้รับปลายทาง', who: 'แลนด์', detail: 'ผู้ถือซองระบุชื่อแลนด์และแนบรูปตอนส่ง', end: true });
    else if (leaderRoute === 'carrier' && carrierDest === 'otherLeader') {
      steps.push({ role: 'หัวหน้าทัวร์ประจำกรุ๊ปอื่น (รับต่อ)', who: secondLeader?.name ?? 'ยังไม่ได้เลือก', pending: !secondLeader, end: true,
        detail: [secondVia && `กรุ๊ป ${secondVia}`, 'ถือซองต่อ — นำส่งหัวหน้าทัวร์ประจำกรุ๊ป หรือส่งต่ออีกทอดได้'].filter(Boolean).join(' · ') });
    } else steps.push({ role: 'หัวหน้าทัวร์ประจำกรุ๊ป · ผู้รับปลายทาง', who: leaderName, pending: !leader, end: true });
    return steps;
  })();

  /** กล่องยืนยันที่ต้องแนบรูปถ่ายหลักฐาน — การเงินรับซองคืน (การเงินเป็นฝ่ายรับ) */
  const [photoStep, setPhotoStep] = useState<'return' | null>(null);

  /*
    ส่งมอบ = การเงินบันทึกให้ผู้รับรู้ว่ามีซองรอรับ ไม่ต้องแนบรูป —
    หลักฐานว่าซองเปลี่ยนมือจริงคือรูปที่ "ผู้รับ" ถ่ายตอนกดยืนยันรับในเครื่องของตัวเอง
    ผู้ถือคนแรก = เจ้าหน้าที่ (ถ้ามี) ไม่งั้นหัวหน้าทัวร์ที่ฝาก · หัวหน้าทัวร์ที่ฝากหลังเจ้าหน้าที่ = nextLeaderCarrier
  */
  /** บันทึก "รอฝากไปกับกรุ๊ปอื่น" — ยังไม่ส่งมอบ จำส่วนที่ระบุแล้วไว้ใช้ตอนหยิบไปฝาก */
  const savePending = () => {
    const pd: PendingDeposit = {
      at: toISODateTime(new Date()),
      byName: '',
      staff: 'pending',
      // ทอดหัวหน้าทัวร์ก็ให้กรุ๊ปที่ดึงซองไปเลือกเอง — เจ้าหน้าที่ส่งถึงหัวหน้าทัวร์ประจำกรุ๊ปตรง หรือฝากหัวหน้าทัวร์ของกรุ๊ปนั้น
      leader: 'pending',
      ...(target ? { target: { periodId: target.internalId, groupCode: target.groupCode } } : {}),
    };
    setEditPending(false);
    return saveEnvelope({ ...env, pendingDeposit: pd }, env.pendingDeposit ? 'แก้ไขรอฝากไปกับกรุ๊ปอื่น' : 'ตั้งรอฝากไปกับกรุ๊ปอื่น', `${name} · ${pendingDepositLabel(pd)} · ${plannedPath.slice(1).join(' → ')}`);
  };
  const cancelPending = () => {
    const rest: CashEnvelope = { ...env };
    delete rest.pendingDeposit;
    return saveEnvelope(rest, 'ยกเลิกรอฝากไปกับกรุ๊ปอื่น', name);
  };

  /** หัวหน้าทัวร์ที่คอนเฟิร์มแล้วของกรุ๊ปใดก็ได้ — ใช้กับซองของกรุ๊ปอื่นที่หยิบมาฝาก */
  const leaderOfPeriod = (pid: string) => {
    const a = loadActiveGuideAssignments().find((x) => x.periodId === pid && x.assignmentStatus === 'CONFIRMED');
    const l = a ? allLeaders.find((x) => x.id === a.tourLeaderId) : undefined;
    return l ? { id: l.id, name: `${l.firstName} ${l.lastName}`.trim() } : null;
  };
  /*
    ซองของกรุ๊ปอื่นที่ "รอฝาก" และฝากกับคนของกรุ๊ปนี้ได้ —
    รอเจ้าหน้าที่ → ต้องมีเจ้าหน้าที่ในการส่งมอบครั้งนี้ · รอหัวหน้าทัวร์ → ใช้หัวหน้าทัวร์หลักของกรุ๊ปนี้ (ต้องมี)
  */
  const thisGroupCode = period?.groupCode ?? periodCodeOf(periodId);
  /*
    คนของกรุ๊ปนี้ที่จะถือซองฝาก — ยังไม่ส่งมอบ = ตามที่เลือกในฟอร์ม · ส่งมอบแล้ว = ผู้ถือซองของกรุ๊ปนี้ (ฝากเพิ่มตามไปได้)
  */
  const handedCarrier = carrierOf(env.handover);
  const attachStaff = env.handover
    ? (handedCarrier?.kind === 'staff' ? { id: handedCarrier.id, name: handedCarrier.name } : undefined)
    : staffPerson ? { id: staffPerson.id, name: staffPerson.name } : undefined;
  /** หัวหน้าทัวร์ที่ถือซองของกรุ๊ปนี้ไป (ฝากส่ง) — ยังไม่ส่งมอบ = ตามฟอร์ม · ส่งมอบแล้ว = ตามที่บันทึก */
  const attachLeaderCarrier: { id: string; name: string; viaGroup?: string } | undefined = env.handover
    ? env.handover.nextLeaderCarrier ?? (handedCarrier?.kind === 'leader' ? { id: handedCarrier.id, name: handedCarrier.name, ...(env.handover.viaGroup ? { viaGroup: env.handover.viaGroup } : {}) } : undefined)
    : leaderCarrier && { id: leaderCarrier.id, name: leaderCarrier.name, ...(via ? { viaGroup: via } : {}) };
  /*
    ซองที่รอหัวหน้าทัวร์ (เลือกภายหลัง) — ทอดหัวหน้าทัวร์เลือกได้ต่อซอง ไม่จำเป็นต้องผ่านหัวหน้าทัวร์:
    · direct = ไม่ผ่านหัวหน้าทัวร์ — เจ้าหน้าที่ส่งถึงหัวหน้าทัวร์หลักของกรุ๊ปเจ้าของซองเอง (หรือหัวหน้าทัวร์ของกรุ๊ปนี้คือคนเดียวกัน)
    · leader:<id> = ฝากหัวหน้าทัวร์ของกรุ๊ปนี้ (คนที่ถือซองกรุ๊ปนี้ไป / หัวหน้าทัวร์หลักกรุ๊ปนี้)
  */
  type LeaderLegOption = { key: string; label: string; carrier?: { id: string; name: string; viaGroup?: string } };
  const leaderLegOptions = (x: CashEnvelope, staffSide: { id: string; name: string } | undefined): LeaderLegOption[] => {
    const owner = leaderOfPeriod(x.periodId);
    const ownerName = owner?.name ?? 'หัวหน้าทัวร์หลักของกรุ๊ปเจ้าของซอง';
    const sameAsOwner = (id: string) => !!owner && owner.id === id;
    const opts: LeaderLegOption[] = [];
    const ownerInThisGroup = (!!leader && sameAsOwner(leader.id)) || (!!attachLeaderCarrier && sameAsOwner(attachLeaderCarrier.id));
    if (staffSide || ownerInThisGroup) {
      opts.push({ key: 'direct', label: ownerInThisGroup ? `ส่งถึง ${ownerName} โดยตรง (ไปกับกรุ๊ปนี้อยู่แล้ว)` : `ไม่ผ่านหัวหน้าทัวร์ — ${staffSide!.name} ส่งถึง ${ownerName} เอง` });
    }
    if (attachLeaderCarrier && !sameAsOwner(attachLeaderCarrier.id)) {
      opts.push({ key: `leader:${attachLeaderCarrier.id}`, label: `ฝาก ${attachLeaderCarrier.name} (หัวหน้าทัวร์ที่ถือซองกรุ๊ปนี้ไป)`, carrier: { ...attachLeaderCarrier, viaGroup: attachLeaderCarrier.viaGroup ?? thisGroupCode } });
    }
    if (leader && !sameAsOwner(leader.id) && leader.id !== attachLeaderCarrier?.id) {
      opts.push({ key: `leader:${leader.id}`, label: `ฝาก ${leader.name} (หัวหน้าทัวร์หลักกรุ๊ปนี้)`, carrier: { id: leader.id, name: leader.name, viaGroup: thisGroupCode } });
    }
    return opts;
  };
  const [leaderPick, setLeaderPick] = useState<Record<string, string>>({});
  /** ซองของกรุ๊ปอื่นที่รอฝากทั้งหมด + เหตุผลถ้ายังฝากกับกรุ๊ปนี้ไม่ได้ (null = ติ๊กได้) */
  const waitingOthers = allEnvelopes
    .filter((x) => x.periodId !== periodId && x.pendingDeposit && x.sealed && !x.handover)
    .map((x) => {
      const pd = x.pendingDeposit!;
      const xp = getTourPeriodById(x.periodId);
      const reason =
        // ระบุกรุ๊ปที่จะฝากไว้แล้ว — กรุ๊ปอื่นหยิบไม่ได้
        pd.target && pd.target.periodId !== periodId ? `ระบุให้ฝากไปกับกรุ๊ป ${pd.target.groupCode}`
        // ทอดหัวหน้าทัวร์ยังเลือกได้ (leader 'pending') → กรุ๊ปที่ไม่มีเจ้าหน้าที่ฝากหัวหน้าทัวร์ของตัวเองได้ — ตรวจในเงื่อนไขถัดไป
        : pd.staff === 'pending' && pd.leader !== 'pending' && !attachStaff ? (env.handover ? 'ซองกรุ๊ปนี้ไม่ได้ฝากเจ้าหน้าที่ส่งกรุ๊ป' : 'เลือกเจ้าหน้าที่ส่งกรุ๊ปของกรุ๊ปนี้ก่อน')
          : pd.leader === 'pending' && leaderLegOptions(x, pd.staff === 'pending' ? attachStaff : pd.staff === 'none' ? undefined : pd.staff).length === 0 ? 'กรุ๊ปนี้ยังไม่มีหัวหน้าทัวร์ให้ฝาก'
            // ส่งทันไหม — เจ้าหน้าที่ไปส่งกรุ๊ปนี้ก่อน/วันเดียวกับกรุ๊ปเจ้าของซองออกเดินทาง · หัวหน้าทัวร์ออกเดินทางไม่หลังวันกลับของกรุ๊ปเจ้าของซอง
            : xp && xp.startDate < toISODate(new Date()) ? `กรุ๊ป ${xp.groupCode} ออกเดินทางไปแล้ว — ส่งไม่ทัน`
                : null;
      return { env: x, period: xp, reason, forHere: pd.target?.periodId === periodId };
    })
    // ซองที่ระบุให้ฝากกับกรุ๊ปนี้ขึ้นก่อน · ซองที่ระบุกรุ๊ปอื่นไว้ไปท้ายสุด
    .sort((a, b) => Number(b.forHere) - Number(a.forHere) || Number(!!a.env.pendingDeposit!.target) - Number(!!b.env.pendingDeposit!.target));
  const attachable = waitingOthers.filter((w) => !w.reason).map((w) => w.env);
  const [attachIds, setAttachIds] = useState<Set<string>>(new Set());
  // ค้นหารหัสกรุ๊ปในซองที่รอฝาก — ซองที่ติ๊กไว้แล้วยังแสดงอยู่เสมอ ไม่หายไปตอนเปลี่ยนคำค้น
  const [attachQuery, setAttachQuery] = useState('');
  const attachQ = attachQuery.trim().toUpperCase();
  const waitingShown = attachQ
    ? waitingOthers.filter((w) => attachIds.has(w.env.id) || (w.period?.groupCode ?? periodCodeOf(w.env.periodId)).toUpperCase().includes(attachQ))
    : waitingOthers;
  const toggleAttach = (id: string) => setAttachIds((s0) => {
    const n = new Set(s0);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  /** คนที่ถือซองฝากแต่ละทอด — เจ้าหน้าที่ / หัวหน้าทัวร์ที่ฝากส่ง / หัวหน้าทัวร์หลักของกรุ๊ปเจ้าของซอง */
  const attachRoute = (x: CashEnvelope) => {
    const pd = x.pendingDeposit!;
    const owner = leaderOfPeriod(x.periodId);
    const staffSide = pd.staff === 'pending' ? attachStaff : pd.staff === 'none' ? undefined : pd.staff;
    const legOptions = pd.leader === 'pending' ? leaderLegOptions(x, staffSide) : [];
    // ค่าเริ่มต้น = ตัวเลือกแรก (ส่งตรงถ้าทำได้) · ตัวที่เลือกไว้ใช้ไม่ได้แล้ว (เปลี่ยนคนในฟอร์ม) → กลับไปตัวแรก
    const leg = legOptions.find((o) => o.key === leaderPick[x.id]) ?? legOptions[0];
    const leaderSide = pd.leader === 'pending' ? leg?.carrier : pd.leader === 'main' ? undefined : pd.leader;
    return { owner, staffSide, leaderSide, legOptions, legKey: leg?.key ?? '' };
  };
  /** ฝากซองของกรุ๊ปอื่นไปกับคนของกรุ๊ปนี้ — ผู้รับปลายทาง = หัวหน้าทัวร์ของกรุ๊ปเจ้าของซอง */
  const handOverAttached = async (x: CashEnvelope) => {
    const { owner, staffSide, leaderSide } = attachRoute(x);
    const base = {
      at: toISODateTime(new Date()), byName: '', ...(owner ? { receiverId: owner.id } : {}), receiverName: owner?.name ?? 'หัวหน้าทัวร์ของกรุ๊ป',
      depositedWith: thisGroupCode, pendingBefore: x.pendingDeposit!,
    };
    const next: CashEnvelope = {
      ...x,
      handover: staffSide
        ? { ...base, receiverKind: 'staff', proxyName: staffSide.name, proxyStaffId: staffSide.id, viaGroup: thisGroupCode, ...(leaderSide ? { nextLeaderCarrier: leaderSide } : {}) }
        : leaderSide
          ? { ...base, receiverKind: 'leader', proxyName: leaderSide.name, proxyLeaderId: leaderSide.id, ...(leaderSide.viaGroup ? { viaGroup: leaderSide.viaGroup } : {}) }
          : { ...base, receiverKind: 'leader' },
    };
    delete next.pendingDeposit;
    const pathText = [staffSide && `${staffSide.name} (เจ้าหน้าที่ส่งกรุ๊ป)`, leaderSide && `${leaderSide.name} (หัวหน้าทัวร์ฝากส่ง)`, `${base.receiverName} (หัวหน้าทัวร์หลัก)`].filter(Boolean).join(' → ');
    await saveEnvelope(next, 'ส่งมอบซอง ฝากไปกับกรุ๊ปอื่น', `${envelopeName(x)} · ฝากไปกับกรุ๊ป ${thisGroupCode} · ${pathText}`);
  };

  const handOver = async () => {
    if (pending) {
      await savePending();
      return;
    }
    await handOverMain();
  };
  /** ฝากซองของกรุ๊ปอื่นที่ติ๊กไว้ไปกับคนของกรุ๊ปนี้ */
  const handOverAttachedPicked = async () => {
    for (const x of attachable.filter((e) => attachIds.has(e.id))) await handOverAttached(x);
    setAttachIds(new Set());
  };
  const pickedCount = attachable.filter((x) => attachIds.has(x.id)).length;

  const handOverMain = () => {
    // ส่งมอบจริงแล้ว — ล้างสถานะรอฝาก (ถ้ามี)
    const { pendingDeposit: _pd, ...envNoPending } = env;
    void _pd;
    const base = { at: toISODateTime(new Date()), byName: '', ...(leader ? { receiverId: leader.id } : {}), receiverName: leaderName };
    const next = leaderCarrier ? { id: leaderCarrier.id, name: leaderCarrier.name, ...(via ? { viaGroup: via } : {}) } : undefined;
    if (staffPerson) {
      return saveEnvelope(
        {
          ...envNoPending,
          handover: {
            ...base,
            receiverKind: 'staff',
            proxyName: staffPerson.name,
            proxyStaffId: staffPerson.id,
            ...(staffVia ? { viaGroup: staffVia } : {}),
            ...(next ? { nextLeaderCarrier: next } : {}),
            ...(secondLeader ? { finalLeaderCarrier: { id: secondLeader.id, name: secondLeader.name, ...(secondVia ? { viaGroup: secondVia } : {}) } } : {}),
            ...(isToLand ? { carrierToLand: true } : {}),
          },
        },
        staffChoice === 'carrierStaff' ? 'ส่งมอบซอง ฝากเจ้าหน้าที่ประจำกรุ๊ปอื่น (รับแทน)' : 'ส่งมอบซองให้เจ้าหน้าที่ส่งกรุ๊ป',
        `${name} · ${plannedPath.slice(1).join(' → ')} · รอ ${staffPerson.name} ยืนยันรับในพอร์ทัลของตัวเอง`,
      );
    }
    if (leaderCarrier) {
      return saveEnvelope(
        {
          ...envNoPending,
          handover: { ...base, receiverKind: 'leader', proxyName: leaderCarrier.name, proxyLeaderId: leaderCarrier.id, ...(via ? { viaGroup: via } : {}), ...(secondLeader ? { finalLeaderCarrier: { id: secondLeader.id, name: secondLeader.name, ...(secondVia ? { viaGroup: secondVia } : {}) } } : {}), ...(isToLand ? { carrierToLand: true } : {}) },
        },
        isToLand ? 'ส่งมอบซอง ฝากหัวหน้าทัวร์ (รับแทน) นำส่งแลนด์' : 'ส่งมอบซอง ฝากหัวหน้าทัวร์ประจำกรุ๊ปอื่น (รับแทน)',
        `${name} · ${plannedPath.slice(1).join(' → ')} · รอ ${leaderCarrier.name} ยืนยันรับในแอปของตัวเอง`,
      );
    }
    return saveEnvelope(
      { ...envNoPending, handover: { ...base, receiverKind: 'leader', receiverId: leader!.id, receiverName: leader!.name } },
      'ส่งมอบซองให้หัวหน้าทัวร์',
      `${name} · ${leader!.name} · รอหัวหน้าทัวร์ยืนยันรับในเครื่องตัวเอง`,
    );
  };

  /** ยังไม่มีผู้ตอบรับ → ยกเลิกการส่งมอบเดิม แล้วเลือกผู้รับใหม่ (หรือเปิดซองแก้ไขการจัดต่อได้) */
  const editHandover = () => {
    // ซองกรุ๊ปอื่นที่ฝากไว้ไม่ถูกยกเลิกตาม — แจ้งให้รู้ ถ้าจะเปลี่ยนด้วยต้องแก้แยกในหัวข้อ 3
    const others = allEnvelopes.filter((x) => x.periodId !== periodId && canEditHandover(x) && (x.handover!.depositedWith ?? x.handover!.viaGroup) === thisGroupCode).length;
    if (!window.confirm(`ยกเลิกการส่งมอบ${name}เดิม (${handoverReceiverText(env.handover!)}) เพื่อแก้ไข?${others > 0 ? `

ซองของกรุ๊ปอื่นที่ฝากไว้ ${others} ซองยังไม่ถูกยกเลิก — ถ้าจะเปลี่ยนด้วย ให้กด "แก้ไข · ยกเลิกฝาก" ในหัวข้อ 3` : ''}`)) return;
    const rest: CashEnvelope = { ...env };
    delete rest.handover;
    delete rest.staffHandoff;
    return saveEnvelope(rest, 'ยกเลิกการส่งมอบเพื่อแก้ไข', `${name} · เดิม: ${handoverReceiverText(env.handover!)}`);
  };

  /** เจ้าหน้าที่ส่งซองคืน → การเงินยืนยันว่าได้ซองคืนจริง แล้วซองกลับไปเป็น "รอส่งมอบ" (ส่งมอบใหม่ได้) */
  const receiveReturn = (photo: string) => {
    const r = env.staffReturn!;
    // รูปตอนเจ้าหน้าที่ส่งคืน (r.photo) ติดไปกับ lastReturn ด้วย ไม่หายไปพร้อม staffReturn
    const rest: CashEnvelope = { ...env, lastReturn: { ...r, receivedAt: toISODateTime(new Date()), receivedPhoto: photo } };
    delete rest.handover;
    delete rest.staffAck;
    delete rest.staffHandoff;
    delete rest.staffReturn;
    return saveEnvelope(rest, 'การเงินรับซองคืน', `${name} · คืนจาก ${r.staffName} · เหตุผล: ${r.reason}`, photo);
  };

  const face = env.sealed?.faceTotals ?? [];
  const total = envs.length;

  /**
   * ใบปะหน้าซอง — จัดวางแบบหน้าซองจดหมาย ขนาดซอง DL (220 × 110 มม. แนวนอน)
   * ผู้ส่ง (การเงิน) มุมซ้ายบน · กล่อง "ซองที่" มุมขวาบนแทนตำแหน่งแสตมป์ · ผู้รับ (หัวหน้าทัวร์) กลางซองแบบที่อยู่ผู้รับ
   * ยอดเงินในซองแถบล่าง — เขียน/พิมพ์ยอดไว้หน้าซอง ผู้รับไม่ต้องเปิดนับจนกว่าจะใช้
   * วันเดินทางแถบล่างขวา ตัวใหญ่เห็นชัด (ไม่พิมพ์เลขเอกสารเบิก EXP — ผู้รับไม่ได้ใช้)
   */
  const printLabel = () => {
    const w = window.open('', '_blank', 'width=960,height=560');
    if (!w || !env.sealed) return;
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const toName = leader?.name ?? env.handover?.receiverName ?? 'หัวหน้าทัวร์ของกรุ๊ป';
    const car = carrierOf(env.handover);
    const carrier = car ? `${carrierTitle(car.kind)} ${car.name}` : undefined;
    const totals = env.sealed.faceTotals.map((t) => `<div class="amt">${esc(formatCurrency(t.amount, t.currency))}</div>`).join('');
    w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบปะหน้าซอง ${esc(name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
@page{size:220mm 110mm;margin:0}
*{box-sizing:border-box}
html,body{margin:0}
body{font-family:'Sarabun',system-ui,sans-serif;color:#0f172a;background:#e2e8f0;display:flex;justify-content:center;align-items:center;min-height:100vh}
.env{position:relative;width:220mm;height:110mm;background:#fff;padding:7mm 9mm;display:flex;flex-direction:column;box-shadow:0 6px 24px rgba(15,23,42,.18)}
.env:before{content:'';position:absolute;inset:3mm;border:.3mm solid #cbd5e1;border-radius:2mm;pointer-events:none}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:6mm}
.from{font-size:9.5pt;line-height:1.35}
.from b{font-size:10.5pt}
.muted{color:#64748b}
.stamp{width:34mm;min-height:24mm;border:.5mm dashed #0f172a;border-radius:1.5mm;padding:2mm;text-align:center;display:flex;flex-direction:column;justify-content:center}
.stamp .no{font-size:18pt;font-weight:700;line-height:1}
.stamp .of{font-size:8.5pt}
.stamp .lbl{font-size:8.5pt;font-weight:600;margin-top:1mm;word-break:break-word}
.to{margin:3mm 0 0 62mm;font-size:10pt;line-height:1.45}
.to .cap{font-size:9pt;color:#64748b;letter-spacing:.3mm}
.to .name{font-size:17pt;font-weight:700;line-height:1.25;border-bottom:.3mm solid #94a3b8;padding-bottom:1mm;margin-bottom:1mm}
.to .group{font-size:12pt;font-weight:700}
.to .prog{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.bottom{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;border-top:.4mm solid #0f172a;padding-top:2mm}
.bottom .cap{font-size:9pt;color:#64748b}
.amt{font-size:20pt;font-weight:700;line-height:1.15}
.trip{text-align:right}
.trip .date{font-size:16pt;font-weight:700;line-height:1.15;white-space:nowrap}
@media print{body{background:#fff;min-height:0;display:block}.env{box-shadow:none}}
</style></head><body>
<div class="env">
  <div class="top">
    <div class="from"><span class="muted">จาก</span><br><b>ฝ่ายการเงิน</b><br><span class="muted">จัดซองโดย ${esc(env.sealed.byName)} · ${esc(formatDateTime(env.sealed.at))}</span></div>
    <div class="stamp"><div class="of">ซองที่</div><div class="no">${env.no}<span class="of"> / ${total}</span></div>${env.kind ? `<div class="lbl">${esc(ENVELOPE_KIND[env.kind].short)}</div>` : ''}${env.label ? `<div class="lbl">${esc(env.label)}</div>` : ''}</div>
  </div>
  <div class="to">
    <div class="cap">ถึง หัวหน้าทัวร์</div>
    <div class="name">${esc(toName)}</div>
    <div class="group">กรุ๊ป ${esc(period?.groupCode ?? periodCodeOf(periodId))}</div>
    <div class="prog">${esc(period?.displayName ?? '')}</div>
    ${carrier ? `<div class="muted">นำส่งโดย ${esc(carrier)}</div>` : ''}
    ${env.kind === 'land_tip' && env.forGroup ? `<div style="font-weight:700">ฝากจ่ายแลนด์ให้กรุ๊ป ${esc(env.forGroup)}</div>` : ''}
  </div>
  <div class="bottom">
    <div><div class="cap">ยอดเงินในซอง</div>${totals}</div>
    ${period ? `<div class="trip"><div class="cap">วันเดินทาง</div><div class="date">${esc(formatDateRange(period.startDate, period.endDate))}</div></div>` : ''}
  </div>
</div>
<script>(document.fonts ? document.fonts.ready : Promise.resolve()).then(function(){setTimeout(function(){window.print()},150)})</script>
</body></html>`);
    w.document.close();
  };

  /* หัวข้อ 3 แสดงเมื่อมีซองกรุ๊ปอื่นรอฝาก / ฝากมากับกรุ๊ปนี้แล้ว — ไม่แสดงตอนซองนี้เองยังรอเลือกคนฝาก หรือถูกส่งคืนการเงิน */
  const depositedHere = allEnvelopes.filter((x) => x.periodId !== periodId && !!x.handover
    && (x.handover.depositedWith ?? x.handover.viaGroup) === thisGroupCode);
  /** ยกเลิกฝากซองกรุ๊ปอื่น (ยังไม่มีผู้ตอบรับ) — ซองกลับไปรอฝากตามค่าเดิม แล้วติ๊กใหม่ / เลือกเส้นทางใหม่ได้ */
  const cancelDeposit = (x: CashEnvelope) => {
    const h = x.handover!;
    if (!window.confirm(`ยกเลิกฝาก${envelopeName(x)} ของกรุ๊ป ${getTourPeriodById(x.periodId)?.groupCode ?? periodCodeOf(x.periodId)}?
เดิม: ${handoverReceiverText(h)}
ซองจะกลับไปเป็น "รอฝาก" — ติ๊กฝากใหม่และเลือกเส้นทางใหม่ได้`)) return;
    const rest: CashEnvelope = { ...x, pendingDeposit: h.pendingBefore ?? { at: toISODateTime(new Date()), byName: '', staff: 'pending', leader: 'pending' } };
    delete rest.handover;
    delete rest.staffHandoff;
    return saveEnvelope(rest, 'ยกเลิกฝากไปกับกรุ๊ปอื่น', `${envelopeName(x)} · ยกเลิกฝากไปกับกรุ๊ป ${thisGroupCode} · เดิม: ${handoverReceiverText(h)}`);
  };
  /** ใครยืนยันรับแล้ว — แก้ไขไม่ได้ ต้องให้ผู้ถือส่งซองคืนการเงินก่อน */
  const lockedBy = (x: CashEnvelope) => x.leaderAck?.leaderName ?? x.staffAck?.staffName;
  const showAttach = stage !== 'packing' && !env.staffReturn && !(!env.handover && pending)
    && (waitingOthers.length > 0 || depositedHere.length > 0);
  const attachCarrierText = attachStaff ? ` ${attachStaff.name} (เจ้าหน้าที่ส่งกรุ๊ป)` : leader ? ` ${leader.name} (หัวหน้าทัวร์ของกรุ๊ปนี้)` : 'คนของกรุ๊ปนี้';
  /* ซองของกรุ๊ปอื่นที่ตั้ง "รอฝาก · เลือกภายหลัง" — ถามว่าจะฝากไปกับคนของกรุ๊ปนี้ด้วยไหม (ผู้รับปลายทาง = หัวหน้าทัวร์ของกรุ๊ปเจ้าของซอง) */
  const attachBox = waitingOthers.length > 0 && (
    <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
      <p className="text-xs font-semibold text-amber-900">
        มีซองของกรุ๊ปอื่นรอฝาก {waitingOthers.length} ซอง — ฝากไปกับกรุ๊ปนี้ด้วยไหม?
      </p>
      <p className="text-[11px] text-amber-800">ติ๊กซองที่จะฝากไปด้วย · ไม่ติ๊ก = ซองยังรอฝากต่อ เลือกกรุ๊ปอื่นภายหลังได้</p>
      <SearchBox
        value={attachQuery}
        onChange={setAttachQuery}
        onClear={() => setAttachQuery('')}
        label="ค้นหารหัสกรุ๊ป"
        placeholder="ค้นหารหัสกรุ๊ป เช่น CAN-261102G"
      />
      {waitingShown.length === 0 && <p className="px-2 py-1.5 text-xs zego-text-tertiary">ไม่พบกรุ๊ปที่ตรงกับ “{attachQuery.trim()}”</p>}
      {waitingShown.map(({ env: x, period: xp, reason, forHere }) => {
        const { owner, staffSide, leaderSide, legOptions, legKey } = attachRoute(x);
        const ownerCode = xp?.groupCode ?? periodCodeOf(x.periodId);
        // เส้นทางเต็มของซองฝาก — ให้เห็นว่าผ่านใคร และปลายทางคือหัวหน้าทัวร์ของกรุ๊ปเจ้าของซอง (ไม่ใช่ของกรุ๊ปนี้)
        const route = [
          staffSide && `${staffSide.name} (เจ้าหน้าที่ส่งกรุ๊ป)`,
          leaderSide && `${leaderSide.name} (หัวหน้าทัวร์ฝากส่ง${leaderSide.viaGroup ? ` · ${leaderSide.viaGroup}` : ''})`,
          `${owner?.name ?? 'หัวหน้าทัวร์ (ยังไม่คอนเฟิร์ม)'} (หัวหน้าทัวร์หลักของ ${ownerCode})`,
        ].filter(Boolean) as string[];
        return (
          <div key={x.id} className={cx('rounded-md bg-white/70 px-2 py-1.5 text-xs', reason && 'opacity-60')}>
          <label className={cx('flex items-start gap-2', reason ? 'cursor-not-allowed' : 'cursor-pointer')}>
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600" disabled={!!reason} checked={!reason && attachIds.has(x.id)} onChange={() => toggleAttach(x.id)} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5 font-medium zego-text">
                {xp?.groupCode ?? periodCodeOf(x.periodId)} · {envelopeName(x)}
                {forHere && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">ระบุให้ฝากกับกรุ๊ปนี้</span>}
              </span>
              <span className="block zego-text-secondary">
                {xp && `ออกเดินทาง ${formatDateRange(xp.startDate, xp.endDate)} · `}{pendingDepositLabel(x.pendingDeposit!)}
              </span>
              {!reason && (
                <span className="mt-0.5 flex flex-wrap items-center gap-1 zego-text">
                  <span className="zego-text-tertiary">เส้นทาง:</span>
                  {route.map((step, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <Icon name="chevronRight" className="h-3 w-3 zego-text-tertiary" />}
                      <span className={i === route.length - 1 ? 'font-semibold' : undefined}>{step}</span>
                    </span>
                  ))}
                </span>
              )}
              {reason && <span className="block zego-text-warning">ฝากไม่ได้: {reason}</span>}
            </span>
            <span className="shrink-0 font-semibold tabular-nums zego-text">{fmtTotals(x.sealed?.faceTotals ?? [])}</span>
          </label>
          {/* ซองรอหัวหน้าทัวร์ — เลือกได้ว่าทอดหัวหน้าทัวร์ไปทางไหน (ไม่จำเป็นต้องผ่านหัวหน้าทัวร์) */}
          {!reason && legOptions.length > 1 && (
            <label className="mt-1.5 block pl-6">
              <span className="mb-0.5 block zego-text-secondary">ทอดหัวหน้าทัวร์</span>
              <select
                aria-label={`ทอดหัวหน้าทัวร์ของ ${ownerCode} · ${envelopeName(x)}`}
                className="w-full rounded-lg border zego-border-color bg-white px-2 py-1.5 text-xs"
                value={legKey}
                onChange={(e) => { const v = e.target.value; setLeaderPick((m) => ({ ...m, [x.id]: v })); }}
              >
                {legOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </label>
          )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-5 rounded-xl border zego-border-color p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* หัวรายละเอียด: เลขซอง + สถานะ · ตอนจัดซองประเภท/ชื่ออยู่ในฟอร์มด้านล่างแล้ว จึงแสดงเฉพาะหลังปิดซอง */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold zego-text">ซอง {env.no}</h3>
            <EnvelopeStatusBadge env={env} />
          </div>
          {stage !== 'packing' && (
            <p className="text-xs zego-text-secondary">
              {[env.kind ? ENVELOPE_KIND[env.kind].label : '', env.label ?? ''].filter(Boolean).join(' · ') || '—'}
              {env.kind === 'land_tip' && env.forGroup ? ` · ฝากจ่ายแลนด์ให้กรุ๊ป ${env.forGroup}` : ''}
            </p>
          )}
        </div>
        {/*
          จัดการซอง — ปุ่มชัด ๆ ที่หัวซอง (เดิมเป็นลิงก์เล็กท้ายรายการ)
            จัดซองอยู่    : ยกเลิกซองนี้
            ปิดซองแล้ว    : แก้ไขการจัด (เปิดซอง) · ยกเลิกซองนี้ · พิมพ์ใบปะหน้า
            ส่งมอบแล้วขึ้นไป: พิมพ์ใบปะหน้าเท่านั้น (ต้องยกเลิกการส่งมอบก่อน)
        */}
        <div className="flex flex-wrap gap-2">
          {env.sealed && <Button variant="secondary" size="sm" icon="download" onClick={printLabel}>พิมพ์ใบปะหน้าซอง</Button>}
          {stage === 'sealed' && <Button variant="secondary" size="sm" icon="edit" onClick={() => void unseal()}>แก้ไขการจัด</Button>}
          {(stage === 'packing' || stage === 'sealed') && (
            <Button variant="danger" size="sm" icon="close" onClick={() => void (stage === 'packing' && packed.length === 0 ? remove() : cancelEnvelope())}>ยกเลิกซองนี้</Button>
          )}
        </div>
      </div>

      {env.notReceived && !env.leaderAck && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm" style={{ color: '#9f1239' }}>
          <p className="font-semibold">หัวหน้าทัวร์แจ้งไม่ได้รับซอง · {formatDateTime(env.notReceived.at)}</p>
          <p className="mt-0.5">{env.notReceived.note}</p>
        </div>
      )}
      {env.mismatch && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm" style={{ color: '#9f1239' }}>
          <p className="font-semibold">หัวหน้าทัวร์แจ้งยอดในซองไม่ตรง · {formatDateTime(env.mismatch.at)}</p>
          <p className="mt-0.5">{env.mismatch.note}</p>
        </div>
      )}
      {changed && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs zego-text-warning">
          เอกสารเบิกถูกแก้ไขหลังปิดซอง — ยอดหน้าซองอาจไม่ตรงเอกสารแล้ว ตรวจสอบก่อนส่งมอบ{stage === 'sealed' ? ' (กด “แก้ไขการจัด” ที่หัวซอง)' : ''}
        </p>
      )}

      {/* 1) จัดซอง */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h4 className="text-sm font-semibold zego-text">1. จัดเงินใส่ซองตามรายการเบิก</h4>
          {stage === 'packing' && (
            <button
              type="button"
              className="text-xs font-medium zego-text-info hover:underline"
              onClick={fillAll}
            >
              {allIn ? 'เอาออกทั้งหมด' : 'ใส่รายการที่ยังไม่จัดทั้งหมด'}
            </button>
          )}
        </div>
        {stage === 'packing' && (
          <div className="space-y-2">
            <div>
              <p className="mb-1.5 text-sm font-medium zego-text-secondary">ประเภทซอง <span className="text-rose-600">*</span></p>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="ประเภทซอง">
                {ENVELOPE_KIND_ORDER.map((k, i) => (
                  <label
                    key={k}
                    className={cx(
                      'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm',
                      kind === k ? 'border-emerald-400 bg-emerald-50/60' : 'zego-border-color hover:bg-emerald-50/30',
                    )}
                  >
                    <input type="radio" name={`kind-${env.id}`} className="mt-0.5 accent-emerald-600" checked={kind === k} onChange={() => setKind(k)} />
                    <span>
                      <span className="block zego-text">{i + 1}. {ENVELOPE_KIND[k].label}</span>
                      {ENVELOPE_KIND[k].hint && <span className="block text-xs zego-text-tertiary">{ENVELOPE_KIND[k].hint}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {kind === 'land_tip' && (
              <TextInput
                label="ฝากจ่ายแลนด์ให้กรุ๊ป"
                required
                value={forGroup}
                onChange={(e) => setForGroup(e.target.value)}
                placeholder="รหัสกรุ๊ปที่เงินนี้ฝากไปจ่ายแลนด์ เช่น CAN-261105G-AQ"
              />
            )}
            <TextInput
              label="ชื่อซองเพิ่มเติม"
              optional
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="เช่น ชื่อบริษัทแลนด์ (ไม่ต้องใส่ประเภทซ้ำ)"
              hint={`ชื่อที่แสดง: ${envelopeName({ no: env.no, kind, label: labelNow })}`}
            />
          </div>
        )}
        <div className="overflow-hidden rounded-lg border zego-border-color">
          {sections.map(({ doc, cats }) => (
            <div key={doc.id}>
              {docs.length > 1 && <p className="bg-slate-100 px-3 py-1.5 text-xs font-semibold zego-text">เอกสารเบิก {doc.id}</p>}
              {cats.map((sec) => (
                <div key={`${doc.id}-${sec.category}-${sec.rows[0].no}`}>
                  <p className="zego-surface-soft-bg px-3 py-1 text-[11px] font-semibold zego-text-secondary">{sec.category}</p>
                  <ul className="divide-y divide-[var(--zego-border-soft)]">
                    {sec.rows.map(({ key, no, line }) => {
                      const packing = stage === 'packing';
                      const on = mine.has(key);
                      const parts = otherParts(key);
                      const max = room(key);
                      // ซองอื่นจัดครบยอดแล้ว — ซองนี้ใส่เพิ่มไม่ได้
                      const full = !on && max <= 0;
                      const disabled = !packing || full;
                      // ยอดในซองนี้: กำลังจัด = ที่กรอก · ปิดแล้ว = ที่บันทึกไว้
                      const mineAmt = packing ? alloc[key] : savedAlloc[key];
                      const split = mineAmt !== undefined && mineAmt !== line.amount;
                      const over = packing && on && (!(alloc[key] > 0) || alloc[key] > max);
                      return (
                        <li key={key} className={cx('flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm', on && packing && 'bg-emerald-50/40', full && 'opacity-55')}>
                          {/* จอเล็ก: ชื่อรายการเต็มบรรทัด ยอดลงบรรทัดถัดไป — ไม่งั้นช่องกรอกยอดเบียดชื่อจนหายไปทั้งคำ */}
                          <label className={cx('flex min-w-0 flex-1 items-center gap-3 max-sm:basis-full', !disabled && 'cursor-pointer')}>
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-emerald-600"
                              checked={packing ? on : true}
                              disabled={disabled}
                              onChange={() => toggle(key)}
                            />
                            <span className="w-6 text-right text-xs tabular-nums zego-text-tertiary">{no}.</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate zego-text">{line.purpose}</span>
                              {line.description && <span className="block truncate text-xs zego-text-tertiary">{line.description}</span>}
                              {parts.length > 0 && (
                                <span className="mt-0.5 flex flex-wrap gap-1">
                                  {parts.map((p) => (
                                    <span key={p.no} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] tabular-nums zego-text-secondary">
                                      ซอง {p.no}: {formatCurrency(p.amount, line.currency)}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </span>
                          </label>
                          {packing && on ? (
                            // แบ่งรายการ: แก้ยอดที่ใส่ซองนี้ได้ (ค่าเริ่มต้น = ยอดที่ยังเหลือทั้งหมด) ส่วนที่เหลือไปใส่ซองอื่น
                            <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 max-sm:ml-auto">
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                max={max}
                                step="0.01"
                                aria-label={`ยอดที่ใส่ซองนี้ — ${line.purpose}`}
                                value={Number.isFinite(alloc[key]) ? alloc[key] : ''}
                                onChange={(e) => setAmount(key, e.target.value === '' ? NaN : Number(e.target.value))}
                                className={cx(
                                  'w-36 rounded-md border bg-white px-2 py-1 text-right font-semibold tabular-nums zego-text',
                                  over ? 'border-rose-400' : 'zego-border-color',
                                )}
                              />
                              <span className="text-xs zego-text-tertiary">{line.currency}</span>
                              <span className="w-full text-right text-[11px] tabular-nums zego-text-tertiary sm:w-auto">
                                {over ? <span className="text-rose-600">ใส่ได้ไม่เกิน {formatCurrency(max, line.currency)}</span> : `จาก ${formatCurrency(line.amount, line.currency)}`}
                              </span>
                            </span>
                          ) : (
                            <span className="shrink-0 text-right max-sm:ml-auto">
                              <span className="block font-semibold tabular-nums zego-text">{formatCurrency(mineAmt ?? line.amount, line.currency)}</span>
                              {split && <span className="block text-[11px] tabular-nums zego-text-tertiary">แบ่งจาก {formatCurrency(line.amount, line.currency)}</span>}
                              {packing && !full && parts.length > 0 && <span className="block text-[11px] tabular-nums zego-text-warning">เหลือ {formatCurrency(max, line.currency)}</span>}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg zego-surface-soft-bg px-3 py-2 text-sm">
          <div>
            <p className="text-xs zego-text-tertiary">ยอดเบิกทั้งกรุ๊ป</p>
            <p className="font-semibold tabular-nums zego-text">{fmtTotals(totals.required)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs zego-text-tertiary">{stage === 'packing' ? `ในซองนี้ ${packed.length} รายการ` : 'ยอดหน้าซอง'}</p>
            <p className="font-semibold tabular-nums zego-text-success">{stage === 'packing' ? fmtTotals(totals.packed) || '0' : fmtTotals(face)}</p>
          </div>
        </div>
        {stage === 'packing' ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => void savePacking()}>บันทึกไว้ก่อน</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void seal()}
              disabled={!sealable || !kindReady}
              title={!kindReady ? (kind === 'land_tip' ? 'ระบุกรุ๊ปที่ฝากจ่ายแลนด์ก่อน' : 'เลือกประเภทซองก่อน') : !sealable && packed.length > 0 ? 'ยอดที่ใส่ซองต้องมากกว่า 0 และไม่เกินยอดที่เหลือของรายการ' : undefined}
            >
              ปิดซอง · ยอดหน้าซอง {fmtTotals(totals.packed) || '—'}
            </Button>
          </div>
        ) : (
          // เปิดซองแก้ไข = ปุ่ม “แก้ไขการจัด” ที่หัวซองแล้ว ไม่ซ้ำตรงนี้
          <p className="text-xs zego-text-tertiary">
            ปิดซองโดย {env.sealed?.byName || '—'} · {env.sealed && formatDateTime(env.sealed.at)}
          </p>
        )}
      </section>

      {/* 2) ส่งมอบ */}
      {stage !== 'packing' && (
        <section id={`envelope-handover-${env.id}`} className="scroll-mt-4 space-y-2">
          <h4 className="text-sm font-semibold zego-text">2. ส่งมอบซอง</h4>
          {env.handover ? (
            <div className="grid gap-3 rounded-lg border zego-border-color p-3 sm:grid-cols-[1fr_auto_auto]">
              <div className="text-sm">
                <p className="font-semibold zego-text">{handoverReceiverText(env.handover)}</p>
                <p className="text-xs zego-text-tertiary">
                  {env.handover.receiverKind === 'staff' ? 'ฝากเจ้าหน้าที่ส่งกรุ๊ปนำส่ง' : env.handover.receiverKind === 'leader' ? (env.handover.proxyName ? 'หัวหน้าทัวร์ · มีผู้รับแทน' : 'หัวหน้าทัวร์ (รับเองโดยตรง)') : 'ผู้รับอื่น'}
                  {' · '}
                  {formatDateTime(env.handover.at)} · ส่งมอบโดย {env.handover.byName || '—'}
                </p>
                {env.staffReturn && (
                  <div className="mt-2 space-y-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <p className="font-semibold">{env.staffReturn.staffName} ส่งซองคืนการเงิน · {formatDateTime(env.staffReturn.at)}</p>
                    <p>เหตุผล: {env.staffReturn.reason}</p>
                    <ProofThumb src={env.staffReturn.photo} label={`${env.staffReturn.staffName} ส่งซองคืน`} />
                    <Button variant="primary" size="sm" icon="camera" onClick={() => setPhotoStep('return')}>ยืนยันรับซองคืน (แนบรูป)</Button>
                  </div>
                )}
                {/* กลับมาแก้ไข — บอกชัดว่าแก้ได้ไหม และแก้แล้วเกิดอะไรขึ้น */}
                {canEditHandover(env) ? (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                    <span>
                      <span className="font-semibold">ยังไม่มีผู้ตอบรับ — แก้ไขได้</span>
                      <span className="block">กดแก้ไข = ยกเลิกการส่งมอบนี้ แล้วเลือกผู้รับ/เส้นทางใหม่ (หรือเปิดซองแก้การจัดเงิน)</span>
                    </span>
                    <Button variant="secondary" size="sm" icon="edit" onClick={() => void editHandover()}>แก้ไขการส่งมอบ</Button>
                  </div>
                ) : !env.staffReturn && lockedBy(env) && (
                  <p className="mt-2 rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-secondary">
                    แก้ไขไม่ได้ — {lockedBy(env)} ยืนยันรับซองแล้ว · ถ้าต้องเปลี่ยน ให้ผู้ถือซองกด “ส่งซองคืนการเงิน” ในแอปของตัวเองก่อน
                  </p>
                )}
              </div>
              {env.handover.signature && (
                <figure className="text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={env.handover.signature} alt="ลายเซ็นผู้รับ" className="h-20 w-40 rounded border zego-border-color bg-white object-contain" />
                  <figcaption className="text-[11px] zego-text-tertiary">ลายเซ็นผู้รับ</figcaption>
                </figure>
              )}
              {env.handover.photo && (
                <figure className="text-center">
                  <ProofThumb src={env.handover.photo} label={`ส่งมอบ${name} · ${handoverReceiverText(env.handover)}`} />
                  <figcaption className="text-[11px] zego-text-tertiary">รูปผู้รับคู่ซอง</figcaption>
                </figure>
              )}
            </div>
          ) : env.pendingDeposit && !editPending ? (
            /* บันทึกรอฝากแล้ว — สรุปอ่านอย่างเดียว ต้องกด "แก้ไข" ก่อนจึงเปลี่ยนได้ */
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{pendingDepositLabel(env.pendingDeposit)}</span>
                  <span className="block">
                    {env.pendingDeposit.target
                      ? `ซองจะขึ้นให้ดึงไปใช้เฉพาะในหน้าส่งมอบของกรุ๊ป ${env.pendingDeposit.target.groupCode}`
                      : 'กรุ๊ปอื่นที่กำลังทำส่งมอบอยู่ ดึงซองนี้ไปฝากได้ทุกกรุ๊ป'}
                    {' '}· เลือกคนที่ถือซองตอนกรุ๊ปนั้นทำส่งมอบ
                  </span>
                  <span className="block text-amber-800/80">ซองยังอยู่ที่การเงิน · บันทึกเมื่อ {formatDateTime(env.pendingDeposit.at)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Button variant="secondary" size="sm" icon="edit" onClick={() => setEditPending(true)}>แก้ไข</Button>
                  <button type="button" onClick={() => void cancelPending()} className="font-medium underline">ยกเลิกรอฝาก</button>
                </span>
              </div>
            </div>
          ) : (
            <>
            {/* ยังไม่รู้คน/กรุ๊ป — ติ๊กเดียวจบ บันทึกเป็นรอฝาก (ยังไม่ส่งมอบ) ไม่ต้องไล่เลือกขั้นตอน · อยู่เหนือการ์ด */}
            <label className="flex cursor-pointer items-start gap-2 px-1">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-amber-600" checked={isPending} onChange={(e) => togglePending(e.target.checked)} />
              <span className="text-sm">
                <span className="block font-medium zego-text">ยังไม่รู้ว่าจะฝากไปกับใคร</span>
                <span className="block text-xs zego-text-secondary">บันทึกไว้ก่อน (ยังไม่ส่งมอบ) — ตอนทำส่งมอบของกรุ๊ปที่ฝาก ซองนี้จะขึ้นให้ติ๊กฝากไปด้วย แล้วนำส่ง {leaderName}</span>
              </span>
            </label>
            <div className="space-y-3 rounded-lg border zego-border-color p-3">
              {/* สถานะรอฝากปัจจุบัน — แก้ตัวเลือกด้านล่างแล้วบันทึกได้เลย (ระบุคนครบ = ส่งมอบจริง) */}
              {env.pendingDeposit && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <span>
                    <span className="font-semibold">สถานะ: {pendingDepositLabel(env.pendingDeposit)}</span>
                    {' '}— กำลังแก้ไข · ระบุคนครบแล้วบันทึก = ส่งมอบเลย
                  </span>
                  <button type="button" onClick={() => setEditPending(false)} className="font-medium underline">ยกเลิกการแก้ไข</button>
                </div>
              )}
              {/*
                เลือกทีละขั้น — 1) ใครรับซองจากการเงิน (3 หัวข้อ) 2) ตัวเลือกย่อยของหัวข้อนั้น พร้อมช่องเลือกคน/กรุ๊ปในตัว
                ด้านล่างสรุปเส้นทางซองที่จะเกิดขึ้นให้เห็นก่อนกดบันทึก
              */}
              {(() => {
                const top: 'own' | 'deposit' | 'none' = route === 'own' ? 'own' : route === 'none' ? 'none' : 'deposit';
                const radio = (
                  key: string, on: boolean, label: string, sub: string | undefined, onPick: () => void,
                  opts: { disabled?: boolean; children?: React.ReactNode; small?: boolean } = {},
                ) => (
                  <div key={key} className={cx('rounded-lg border bg-white', on ? 'border-emerald-500 ring-1 ring-emerald-500' : 'zego-border-color', opts.disabled && 'opacity-50')}>
                    <label className={cx('block px-3', opts.small ? 'py-1.5' : 'py-2', opts.disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
                      <span className={cx('flex items-center gap-2 font-medium zego-text', opts.small ? 'text-[13px]' : 'text-sm')}>
                        <input type="radio" name={`${key.split(':')[0]}-${env.id}`} className="accent-emerald-600" checked={on} disabled={opts.disabled} onChange={onPick} />
                        <span className="flex-1">{label}</span>
                      </span>
                      {sub && <span className="mt-0.5 block pl-6 text-xs zego-text-secondary">{sub}</span>}
                    </label>
                    {on && opts.children && <div className="space-y-2 px-3 pb-2.5 pl-9">{opts.children}</div>}
                  </div>
                );
                const select = (label: string, value: string, onChange: (v: string) => void, options: { value: string; label: string; disabled?: boolean }[], placeholder: string) => (
                  <label className="block text-xs">
                    <span className="mb-1 block font-medium zego-text-secondary">{label} <span className="text-rose-600">*</span></span>
                    <select className={cx('w-full rounded-lg border px-3 py-2 text-sm', value ? 'zego-border-color' : 'border-amber-300')} value={value} onChange={(e) => onChange(e.target.value)}>
                      <option value="">{placeholder}</option>
                      {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
                    </select>
                  </label>
                );
                /** เลือกคน (เจ้าหน้าที่/หัวหน้าทัวร์กรุ๊ปอื่น) แล้วต้องเลือกกรุ๊ปที่คนนั้นไปด้วย — เฉพาะกรุ๊ปที่เขาดูแลและส่งทัน */
                const carrierPicker = (k: 'carrierStaff' | 'carrierLeader' | 'secondLeader') => {
                  const list = k === 'carrierStaff' ? staffCarrierList
                    : k === 'secondLeader' ? secondLeaderList.filter((c) => c.key !== carrierKeys.carrierLeader) : leaderCarrierList;
                  const person = list.find((c) => c.key === carrierKeys[k]);
                  const q = (pickQuery[k] ?? '').trim().toLowerCase();
                  const shown = q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
                  const empty = k === 'secondLeader' ? 'ไม่มีหัวหน้าทัวร์ท่านอื่นที่มีกรุ๊ป' : 'ไม่มีคนที่มีกรุ๊ปส่งทัน';
                  const label = k === 'carrierStaff' ? 'เจ้าหน้าที่ประจำกรุ๊ปอื่น (รับแทน)' : k === 'secondLeader' ? 'หัวหน้าทัวร์ประจำกรุ๊ปอื่นที่รับต่อ' : 'หัวหน้าทัวร์ประจำกรุ๊ปอื่น (รับแทน)';
                  return (
                    // คน + รหัสกรุ๊ป อยู่บรรทัดเดียวกัน (มือถือเรียงลง)
                    <div className="grid items-end gap-2 sm:grid-cols-2">
                      {/* พิมพ์ค้นหาชื่อได้ — รหัสกรุ๊ปเลือกในช่องถัดไป */}
                      <Combobox
                        label={label}
                        required
                        value={person?.name ?? ''}
                        items={shown}
                        getKey={(c) => c.key}
                        getLabel={(c) => c.name}
                        onSearch={(v) => setPickQuery((m) => ({ ...m, [k]: v }))}
                        onSelect={(c) => {
                          setCarrierKeys((m) => ({ ...m, [k]: c?.key ?? '' }));
                          // เปลี่ยนคน → กรุ๊ปเดิมใช้ไม่ได้ · มีกรุ๊ปเดียวเลือกให้เลย
                          setViaKeys((m) => ({ ...m, [k]: c?.groups.length === 1 ? c.groups[0].code : '' }));
                        }}
                        placeholder={list.length ? 'พิมพ์ค้นหาชื่อ' : empty}
                        emptyMessage={list.length ? 'ไม่พบชื่อที่ค้นหา' : empty}
                      />
                      {person && select(`รหัสกรุ๊ปที่ ${person.name} ได้รับมอบหมาย`, viaKeys[k], (v) => setViaKeys((m) => ({ ...m, [k]: v })),
                        person.groups.map((g) => ({ value: g.code, label: `${g.code} · ${g.dates}` })), '— เลือกกรุ๊ป —')}
                    </div>
                  );
                };
                const ownStaffPicker = (label: string) => (assignedStaff.length > 1
                  ? select(label, staffId, setStaffId, assignedStaff.map((x) => ({ value: x.id, label: x.name })), '— เลือก —')
                  : <p className="text-xs zego-text-secondary">{label}: <span className="font-medium zego-text">{assignedStaff[0]?.name ?? '—'}</span></p>);
                const targetPicker = (
                  <div className="space-y-1">
                    {/* พิมพ์ค้นหาในช่องเลือกได้เลย */}
                    <Combobox
                      label="ฝากไปกับกรุ๊ป"
                      required
                      value={target?.groupCode ?? ''}
                      items={targetShown.map((p) => ({ id: p.internalId, code: p.groupCode, dates: formatDateRange(p.startDate, p.endDate) }))}
                      getKey={(o) => o.id}
                      getLabel={(o) => o.code}
                      getSubLabel={(o) => o.dates || undefined}
                      onSearch={setTargetQuery}
                      onSelect={(o) => setTargetPeriodId(o?.id ?? '')}
                      placeholder="พิมพ์ค้นหารหัสกรุ๊ป เช่น CKG-261009A"
                      emptyMessage={targetEmptyMessage}
                      placement="top"
                    />
                    <p className="text-xs zego-text-tertiary">
                      {target ? `เฉพาะกรุ๊ป ${target.groupCode} หยิบซองนี้ไปฝากได้ — กรุ๊ปอื่นจะเห็นแต่ติ๊กไม่ได้`
                        : targetRangeClosed ? targetEmptyMessage : `เลือกได้: ${targetRangeText}`}
                    </p>
                    {pd0?.target && !target && route === 'pendingTarget' && (
                      <p className="text-xs font-semibold zego-text-warning">กรุ๊ป {pd0.target.groupCode} ที่ระบุไว้ ส่งไม่ทันแล้ว — เลือกกรุ๊ปใหม่</p>
                    )}
                  </div>
                );
                return (
                  <div className="space-y-2" role="radiogroup" aria-label="ใครรับซองจากการเงิน">
                    {isPending ? (
                      <div className="space-y-1.5" role="radiogroup" aria-label="ฝากไปกับกรุ๊ปไหน">
                        {radio('pend:target', route === 'pendingTarget', 'รู้กรุ๊ปแล้ว — ยังไม่รู้คน', 'ซองจะขึ้นให้ดึงไปใช้เฉพาะในหน้าส่งมอบของกรุ๊ปที่เลือก · เลือกคนที่ฝากตอนนั้น',
                          () => setRoute('pendingTarget'), { children: targetPicker })}
                        {radio('pend:any', route === 'pendingAny', 'ยังไม่รู้กรุ๊ป',
                          targetRangeClosed ? targetEmptyMessage : `กรุ๊ปอื่นที่กำลังทำส่งมอบอยู่ ดึงซองนี้ไปฝากได้ทุกกรุ๊ป · ส่งให้หัวหน้าทัวร์ก่อน ${period ? formatDate(period.startDate) : 'กรุ๊ปนี้ออกเดินทาง'}`,
                          () => setRoute('pendingAny'))}
                      </div>
                    ) : (<>
                    <p className="flex items-center gap-1.5 text-sm font-semibold zego-text">
                      <Icon name="users" className="h-4 w-4 zego-text-secondary" />
                      ขั้นที่ 1 · เจ้าหน้าที่ส่งกรุ๊ป — ใครรับซองจากการเงิน
                    </p>
                    {radio('top:own', top === 'own', 'เจ้าหน้าที่ประจำกรุ๊ป',
                      assignedStaff.length > 0 ? assignedStaff.map((x) => x.name).join(', ') : 'ยังไม่ได้จัดเจ้าหน้าที่ให้กรุ๊ปนี้',
                      () => setRoute('own'),
                      { disabled: assignedStaff.length === 0, children: assignedStaff.length > 1 ? ownStaffPicker('เจ้าหน้าที่ที่รับ') : undefined })}
                    {radio('top:deposit', top === 'deposit', 'เจ้าหน้าที่ประจำกรุ๊ปอื่น', 'รับแทน — เจ้าหน้าที่ประจำกรุ๊ปมารับเองไม่ได้',
                      () => setRoute('carrierToLeader'),
                      {
                        children: (
                          <>
                            {carrierPicker('carrierStaff')}
                            {/* นำไปส่งใคร — เลือกแล้วตั้งขั้นที่ 2 ให้ตรงกัน */}
                            <div className="space-y-1.5" role="radiogroup" aria-label="เจ้าหน้าที่ (รับแทน) นำไปส่ง">
                              <p className="text-xs font-medium zego-text-secondary">นำไปส่ง <span className="text-rose-600">*</span></p>
                              {radio('dep:main', leaderRoute === 'main', 'หัวหน้าทัวร์ประจำกรุ๊ป', leader?.name, () => setLeaderRoute('main'), { small: true })}
                              {radio('dep:other', leaderRoute === 'carrier', 'หัวหน้าทัวร์ประจำกรุ๊ปอื่น', 'เลือกคนในขั้นที่ 2', () => setLeaderRoute('carrier'), { small: true })}
                            </div>
                          </>
                        ),
                      })}
                    {radio('top:none', top === 'none', 'ไม่มีเจ้าหน้าที่ส่งกรุ๊ปมารับ', 'ฝั่งหัวหน้าทัวร์รับซองจากการเงินเอง', () => setRoute('none'))}

                    {/* ขั้นที่ 2 — หัวหน้าทัวร์: ขึ้นหลังเลือกขั้นที่ 1 ครบ */}
                    <p className="flex items-center gap-1.5 pt-2 text-sm font-semibold zego-text">
                      <Icon name="guide" className="h-4 w-4 zego-text-secondary" />
                      ขั้นที่ 2 · หัวหน้าทัวร์
                    </p>
                    {staffStepMissing.length > 0 ? (
                      <p className="rounded-lg border border-dashed zego-border-color px-3 py-2 text-xs zego-text-tertiary">เลือกขั้นที่ 1 ให้ครบก่อน</p>
                    ) : (
                      <div className="space-y-1.5" role="radiogroup" aria-label="หัวหน้าทัวร์">
                        {radio('lead:main', leaderRoute === 'main', 'หัวหน้าทัวร์ประจำกรุ๊ป',
                          `${leader?.name ?? 'ยังไม่มีหัวหน้าทัวร์ที่คอนเฟิร์ม'}${route === 'none' ? ' — มารับซองเอง' : ''}`, () => setLeaderRoute('main'))}
                        {radio('lead:carrier', leaderRoute === 'carrier', 'หัวหน้าทัวร์ประจำกรุ๊ปอื่น',
                          route === 'none' ? 'รับแทน — มารับซองจากการเงิน' : 'รับแทน — รับต่อจากเจ้าหน้าที่ส่งกรุ๊ป', () => setLeaderRoute('carrier'),
                          {
                            children: (
                              <>
                                {carrierPicker('carrierLeader')}
                                <div className="space-y-1.5" role="radiogroup" aria-label="หัวหน้าทัวร์ (รับแทน) นำส่งให้">
                                  <p className="text-xs font-medium zego-text-secondary">นำส่งให้ <span className="text-rose-600">*</span></p>
                                  {radio('dest:main', carrierDest === 'main', 'หัวหน้าทัวร์ประจำกรุ๊ป', leader?.name, () => setCarrierDest('main'), { small: true })}
                                  {radio('dest:otherLeader', carrierDest === 'otherLeader', 'หัวหน้าทัวร์ประจำกรุ๊ปอื่น', 'คนนั้นถือต่อ และส่งต่ออีกทอดได้',
                                    () => setCarrierDest('otherLeader'), { small: true, children: carrierPicker('secondLeader') })}
                                  {radio('dest:land', carrierDest === 'land', 'ส่งให้แลนด์', 'ผู้ถือซองระบุชื่อแลนด์และแนบรูปตอนส่ง', () => setCarrierDest('land'), { small: true })}
                                </div>
                              </>
                            ),
                          })}
                      </div>
                    )}
                    </>)}

                    {/* เส้นทางซองที่จะเกิดขึ้น — เส้นเวลาบนลงล่าง */}
                    <div className="rounded-lg zego-surface-soft-bg px-3 py-2.5">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                        <p className="text-xs font-semibold zego-text">เส้นทางซองของกรุ๊ป {thisGroupCode}</p>
                        {pending && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">ตอนนี้ซองยังอยู่ที่การเงิน · รอกรุ๊ปอื่นดึงไปฝาก</span>
                        )}
                      </div>
                      <ol>
                        {plannedSteps.map((st, i) => {
                          const last = i === plannedSteps.length - 1;
                          return (
                            <li key={i} className="relative flex gap-2.5 pb-2.5 last:pb-0">
                              {/* เส้นเชื่อมไปทอดถัดไป */}
                              {!last && <span aria-hidden className={cx('absolute left-[9px] top-5 bottom-0 w-px', st.pending || plannedSteps[i + 1].pending ? 'border-l border-dashed border-amber-400' : 'bg-[var(--zego-border)]')} />}
                              <span className={cx('relative z-[1] flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                                st.end ? 'bg-emerald-600 text-white' : st.pending ? 'border border-dashed border-amber-500 bg-amber-50 text-amber-700' : 'bg-white zego-text-secondary ring-1 ring-[var(--zego-border)]')}>{i + 1}</span>
                              <span className="min-w-0 text-xs leading-snug">
                                <span className="block text-[11px] zego-text-tertiary">{st.role}</span>
                                <span className={cx('block font-semibold', st.pending ? 'zego-text-warning' : 'zego-text')}>{st.who}</span>
                                {st.detail && <span className="block zego-text-secondary">{st.detail}</span>}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  </div>
                );
              })()}

              {handoverMissing.length > 0 && <p className="text-xs zego-text-warning">ยังขาด: {handoverMissing.join(' · ')}</p>}
              <div className="flex justify-end">
                <Button variant="primary" onClick={() => void handOver()} disabled={handoverMissing.length > 0 || changed}>
                  {pending
                    ? `${env.pendingDeposit ? 'บันทึกการแก้ไข' : 'บันทึกไว้ก่อน'} · ยังไม่ส่งมอบ (รอเลือกคนที่ฝาก)`
                    : `บันทึกส่งมอบ${name}`}
                </Button>
              </div>
            </div>
            </>
          )}
        </section>
      )}

      {/* 3) ซองของกรุ๊ปอื่นที่ฝากไปด้วย — แยกหัวข้อจากซองของกรุ๊ปนี้ ไม่ให้สับสน */}
      {showAttach && (
        <section className="space-y-2">
          <div>
            <h4 className="text-sm font-semibold zego-text">3. ซองของกรุ๊ปอื่นที่ฝากไปด้วย</h4>
            <p className="text-xs zego-text-secondary">
              ไม่ใช่ซองของกรุ๊ปนี้ — ฝากไปกับ{attachCarrierText} แล้วนำส่งหัวหน้าทัวร์ของกรุ๊ปเจ้าของซอง
            </p>
          </div>
          {attachBox}
          {depositedHere.length > 0 && (
            <div className="space-y-1 rounded-lg border zego-border-color px-3 py-2">
              <p className="text-xs font-semibold zego-text-secondary">ฝากไปกับกรุ๊ปนี้แล้ว {depositedHere.length} ซอง</p>
              {depositedHere.map((x) => {
                const who = lockedBy(x);
                return (
                  <div key={x.id} className="space-y-1 rounded-md border zego-border-color px-2 py-1.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 font-medium zego-text">{getTourPeriodById(x.periodId)?.groupCode ?? periodCodeOf(x.periodId)} · {envelopeName(x)}</span>
                      <EnvelopeStatusBadge env={x} />
                      <span className="shrink-0 font-semibold tabular-nums zego-text">{fmtTotals(x.sealed?.faceTotals ?? [])}</span>
                    </div>
                    <p className="zego-text-secondary">{handoverReceiverText(x.handover!)}</p>
                    {canEditHandover(x) ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-sky-50 px-2 py-1.5 text-sky-900">
                        <span>ยังไม่มีผู้ตอบรับ — แก้ไขได้: ยกเลิกฝาก แล้วซองกลับไปรอฝาก (ติ๊กใหม่ / เลือกเส้นทางใหม่ด้านบน)</span>
                        <Button variant="secondary" size="sm" icon="edit" onClick={() => void cancelDeposit(x)}>แก้ไข · ยกเลิกฝาก</Button>
                      </div>
                    ) : who && (
                      <p className="zego-text-tertiary">แก้ไขไม่ได้ — {who} ยืนยันรับซองแล้ว</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {attachable.length > 0 && (
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => void handOverAttachedPicked()} disabled={pickedCount === 0}>
                ฝากซองกรุ๊ปอื่นไปด้วย{pickedCount > 0 ? ` ${pickedCount} ซอง` : ''}
              </Button>
            </div>
          )}
        </section>
      )}

      {photoStep === 'return' && env.staffReturn && (
        <PhotoConfirmModal
          title={`ยืนยันรับ${name}คืน`}
          description={`คืนจาก ${env.staffReturn.staffName} · ยอดหน้าซอง ${fmtTotals(face)}`}
          confirmLabel="ยืนยันรับซองคืน"
          photoHint="ถ่ายรูปซองที่ได้รับคืน ให้เห็นหน้าซองชัดเจน"
          onClose={() => setPhotoStep(null)}
          onConfirm={async (photo) => { await receiveReturn(photo); setPhotoStep(null); }}
        />
      )}

      {/* 3/4) ผู้รับยืนยันในเครื่องของตัวเอง — เจ้าหน้าที่ (ถ้าฝาก) → หัวหน้าทัวร์ */}
      {env.handover && (
        <section className="space-y-1">
          <h4 className="text-sm font-semibold zego-text">{showAttach ? 4 : 3}. ยืนยันการรับ (ในเครื่องของผู้รับ)</h4>
          <ul className="space-y-1 rounded-lg zego-surface-soft-bg px-3 py-2 text-sm">
            {carrierOf(env.handover) && (
              <>
                <li className={env.staffAck ? 'zego-text-success' : 'zego-text-secondary'}>
                  {env.staffAck
                    ? `✓ ${env.staffAck.staffName} (${carrierTitle(carrierOf(env.handover)!.kind)}) ยืนยันรับซอง${env.handover.relayFrom ? ` ต่อจาก ${env.handover.relayFrom}` : 'จากการเงิน'} · ${formatDateTime(env.staffAck.at)}`
                    : `รอ ${env.handover.proxyName} (${carrierTitle(carrierOf(env.handover)!.kind)}) ยืนยันรับในแอปของตัวเอง`}{' '}
                  <ProofThumb src={env.staffAck?.photo} label={`${env.staffAck?.staffName ?? ''} รับซองจากการเงิน`} />
                </li>
                {env.staffHandoff && (
                  <li className="zego-text-success">
                    ✓ ส่งต่อให้{env.handover.receiverKind === 'other' ? ` ${env.handover.receiverName} (ผู้รับคนอื่น)` : 'หัวหน้าทัวร์'} · {formatDateTime(env.staffHandoff.at)}{' '}
                    <ProofThumb src={env.staffHandoff.photo} label={`ส่งต่อให้ ${env.handover.receiverName}`} />
                  </li>
                )}
              </>
            )}
            <li className={env.leaderAck ? 'zego-text-success' : 'zego-text-secondary'}>
              {env.leaderAck
                ? `✓ ${env.leaderAck.leaderName} ยืนยันรับซองแล้ว${env.leaderAck.fromStaffName ? ` (รับต่อจาก ${env.leaderAck.fromStaffName})` : ''} · ${formatDateTime(env.leaderAck.at)}`
                : `รอ${leader ? ` ${leader.name}` : 'หัวหน้าทัวร์'} กดยืนยันรับซองในเครื่องของตัวเอง`}{' '}
              <ProofThumb src={env.leaderAck?.photo} label={`${env.leaderAck?.leaderName ?? ''} รับซอง`} />
            </li>
            {env.leaderForward && (
              <li className="zego-text-success">
                ✓ {env.leaderForward.byName} ส่งต่อให้ {env.leaderForward.toName} · {formatDateTime(env.leaderForward.at)}
                {env.leaderForward.note ? ` · ${env.leaderForward.note}` : ''}{' '}
                <ProofThumb src={env.leaderForward.photo} label={`ส่งต่อให้ ${env.leaderForward.toName}`} />
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
