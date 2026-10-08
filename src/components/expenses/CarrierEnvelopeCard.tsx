'use client';

/**
 * ผู้ถือซองระหว่างทาง (ไม่ใช่ปลายทาง) — ใช้ร่วมกันระหว่างพอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป (/staff/envelopes)
 * และหัวหน้าทัวร์ที่ถูกฝากซองไปส่งให้กรุ๊ปอื่น (พอร์ทัลหัวหน้าทัวร์)
 *
 * ทอดของผู้ถือซอง: รับซอง (จากการเงิน หรือจากผู้ถือคนก่อน) → ส่งต่อให้หัวหน้าทัวร์ของกรุ๊ป / ผู้รับคนอื่น /
 * ฝากต่อคนในระบบ (คนนั้นกดรับในแอปต่อ) / ส่งคืนการเงิน — ทุกทอดแนบรูป และบันทึกชื่อคนกดในประวัติของซอง
 * จึงไล่ตรวจย้อนหลังได้ว่าซองอยู่กับใครช่วงไหน แม้คนรับไม่ใช่หัวหน้าทัวร์หลักของกรุ๊ป (ดู Timeline ของกรุ๊ป กรองทีละซองได้)
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, Card } from '@/components/ui/Primitives';
import { TextArea, TextInput } from '@/components/ui/FormField';
import { PhotoConfirmModal, ProofThumb } from '@/components/expenses/EnvelopeProofPhoto';
import { EnvelopeStatusBadge, StatusPill } from '@/components/expenses/CashEnvelopeDrawer';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { loadSendOffStaff } from '@/services/sendOffStaffStore';
import { sendOffStaffName } from '@/lib/logic/sendOffStaff';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { formatCurrency, formatDateRange, formatDateTime, toISODateTime } from '@/lib/format';
import { carrierTitle, envelopeName, envelopeStage, sumAmounts, type CarrierKind, type CashEnvelope } from '@/lib/logic/cashEnvelope';

const fmt = (list: { amount: number; currency: string }[]) => list.map((f) => formatCurrency(f.amount, f.currency)).join(' · ');

/** คนในระบบที่ฝากต่อได้ */
export interface RelayTarget { key: string; kind: CarrierKind; id: string; name: string }

/**
 * การกระทำของผู้ถือซอง (me) — บันทึกด้วยชื่อ/รหัสของผู้กด · ใช้ฟิลด์ทอดเดียวกัน (staffAck / staffHandoff / staffReturn)
 * ไม่ว่าผู้ถือจะเป็นเจ้าหน้าที่ส่งกรุ๊ปหรือหัวหน้าทัวร์ฝากส่ง
 */
export function useCarrierActions(me: { kind: CarrierKind; id: string; name: string }) {
  const { saveEnvelope, leaders } = useDemo();
  const title = carrierTitle(me.kind);

  /**
   * หัวหน้าทัวร์ที่คอนเฟิร์มแล้วของกรุ๊ป ณ ตอนนี้ — อ่านใหม่ทุกครั้ง ไม่ใช้ชื่อที่ติดมากับการส่งมอบ
   * (ตอนการเงินส่งมอบอาจยังไม่มีหัวหน้าทัวร์ ชื่อในซองจึงเป็นแค่ "หัวหน้าทัวร์ของกรุ๊ป")
   */
  const leaderOf = (periodId: string) => {
    const a = loadActiveGuideAssignments().find((x) => x.periodId === periodId && x.assignmentStatus === 'CONFIRMED');
    const l = a ? leaders.find((x) => x.id === a.tourLeaderId) : undefined;
    return l ? { id: l.id, name: `${l.firstName} ${l.lastName}`.trim() } : null;
  };

  /** คนในระบบที่ฝากต่อได้ — ไม่รวมตัวเอง และไม่รวมหัวหน้าทัวร์ของกรุ๊ป (ส่งให้ตรงด้วยปุ่มส่งมอบ) */
  const relayTargetsFor = (periodId: string): RelayTarget[] => {
    const groupLeader = leaderOf(periodId)?.id;
    const ls: RelayTarget[] = leaders
      .filter((l) => l.id !== groupLeader && !(me.kind === 'leader' && l.id === me.id))
      .map((l) => ({ key: `leader:${l.id}`, kind: 'leader' as const, id: l.id, name: `${l.firstName} ${l.lastName}`.trim() }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));
    const ss: RelayTarget[] = loadSendOffStaff()
      .filter((x) => x.status !== 'disabled' && !(me.kind === 'staff' && x.id === me.id))
      .map((x) => ({ key: `staff:${x.id}`, kind: 'staff' as const, id: x.id, name: sendOffStaffName(x) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));
    return [...ss, ...ls];
  };

  /*
    หลัก "คนรับเป็นคนถ่าย" — รับซอง: บังคับรูป · ส่งต่อให้คนในระบบ / ส่งคืนการเงิน: ไม่บังคับ (คนรับถ่ายตอนกดรับเอง)
    ส่งให้คนนอกระบบ (แลนด์ / ผู้รับไม่ใช่คนที่กำหนด) ยังบังคับ เพราะคนรับกดยืนยันในแอปไม่ได้ · photo '' = ไม่ได้แนบ
    กล่องยืนยันพร้อมรูปคือขั้นยืนยันแล้ว จึงไม่ถาม window.confirm ซ้ำอีกชั้น
  */
  const receive = async (env: CashEnvelope, photo: string) => {
    const h = env.handover;
    await saveEnvelope(
      { ...env, staffAck: { at: toISODateTime(new Date()), staffId: me.id, staffName: me.name, photo } },
      `${title}ยืนยันรับซอง`,
      `${envelopeName(env)} · ${h?.relayFrom ? `รับต่อจาก ${h.relayFrom}` : `รับจากการเงิน${h?.byName ? ` (${h.byName})` : ''}`}`,
      photo,
    );
  };

  /**
   * ส่งต่อให้หัวหน้าทัวร์ของกรุ๊ป หรือคนอื่นที่มารับจริง (other) — ต้องมีหัวหน้าทัวร์ที่คอนเฟิร์มแล้วเสมอ
   * การเงินกำหนดให้ฝากต่อหัวหน้าทัวร์กรุ๊ปอื่น (nextLeaderCarrier) → ส่งต่อให้คนนั้นแทน (เป็นผู้ถือซองคนใหม่)
   */
  const passOn = async (env: CashEnvelope, photo: string, other?: { name: string; reason: string }) => {
    /*
      การเงินกำหนดให้นำส่งแลนด์ (carrierToLand) — ทอดสุดท้ายของผู้ถือ ไม่ผ่านหัวหน้าทัวร์ประจำกรุ๊ป
      บันทึกเป็น "รับแล้วโดยผู้ถือคนนี้ + ส่งต่อให้แลนด์" (leaderAck + leaderForward) ซองจึงจบเส้นทางที่นี่
    */
    const lastHop = !env.handover?.nextLeaderCarrier && !env.handover?.nextStaffCarrier && !env.handover?.finalLeaderCarrier;
    if (env.handover?.carrierToLand && lastHop && other) {
      const at = toISODateTime(new Date());
      await saveEnvelope(
        {
          ...env,
          handover: { ...env.handover, receiverKind: 'other', receiverId: undefined, receiverName: other.name },
          staffHandoff: { at, staffName: me.name, photo },
          leaderAck: { at, leaderId: me.id, leaderName: me.name, photo },
          leaderForward: { at, byName: me.name, toName: other.name, ...(other.reason ? { note: other.reason } : {}), photo },
        },
        `${title}ส่งซองให้แลนด์`,
        `${envelopeName(env)} · ${me.name} → ${other.name}${other.reason ? ` · ${other.reason}` : ''}`,
        photo,
      );
      return;
    }
    /* คนอื่นมารับแทน → ส่งต่อให้เจ้าหน้าที่ประจำกรุ๊ป (nextStaffCarrier) เป็นผู้ถือซองคนใหม่ แล้วคนนั้นนำส่งหัวหน้าทัวร์ต่อ */
    const nextStaff = env.handover?.nextStaffCarrier;
    if (nextStaff && !other) {
      const h = { ...env.handover! };
      delete h.proxyLeaderId;
      delete h.nextStaffCarrier;
      const moved: CashEnvelope = {
        ...env,
        handover: { ...h, receiverKind: 'staff', proxyName: nextStaff.name, proxyStaffId: nextStaff.id, relayFrom: `${title} ${me.name}` },
      };
      delete moved.staffAck;
      delete moved.staffHandoff;
      await saveEnvelope(
        moved,
        `${title}ส่งต่อให้เจ้าหน้าที่ส่งกรุ๊ปประจำกรุ๊ป`,
        `${envelopeName(env)} · ${me.name} → ${nextStaff.name} · รอ ${nextStaff.name} กดรับในพอร์ทัลของตัวเอง แล้วนำส่ง ${env.handover!.receiverName}`,
        photo,
      );
      return;
    }
    /* หัวหน้าทัวร์ (รับแทน) ทอดถัดไป — ถ้ามีทั้ง 2 ทอด ส่ง nextLeaderCarrier ก่อน แล้วค่อย finalLeaderCarrier */
    const next = env.handover?.nextLeaderCarrier ?? env.handover?.finalLeaderCarrier;
    if (next && !other) {
      const h = { ...env.handover! };
      delete h.proxyStaffId;
      if (h.nextLeaderCarrier) delete h.nextLeaderCarrier;
      else delete h.finalLeaderCarrier;
      const moved: CashEnvelope = {
        ...env,
        handover: {
          ...h,
          receiverKind: 'leader',
          proxyName: next.name,
          proxyLeaderId: next.id,
          relayFrom: `${title} ${me.name}`,
          ...(next.viaGroup ? { viaGroup: next.viaGroup } : {}),
        },
      };
      delete moved.staffAck;
      delete moved.staffHandoff;
      await saveEnvelope(
        moved,
        `${title}ส่งต่อให้หัวหน้าทัวร์ (ฝากส่ง)`,
        `${envelopeName(env)} · ${me.name} → ${next.name}${next.viaGroup ? ` (ไปกับกรุ๊ป ${next.viaGroup})` : ''} · รอ ${next.name} กดรับในแอปของตัวเอง แล้วนำไปส่ง ${env.handover!.receiverName}`,
        photo,
      );
      return;
    }
    const leader = leaderOf(env.periodId);
    if (!leader) return;
    await saveEnvelope(
      {
        ...env,
        handover: other
          ? { ...env.handover!, receiverKind: 'other', receiverId: undefined, receiverName: other.name }
          : { ...env.handover!, receiverId: leader.id, receiverName: leader.name },
        staffHandoff: { at: toISODateTime(new Date()), staffName: me.name, ...(photo ? { photo } : {}) },
      },
      other ? `${title}ส่งต่อให้ผู้รับคนอื่น` : `${title}ส่งต่อให้หัวหน้าทัวร์`,
      other
        ? `${envelopeName(env)} · ${me.name} → ${other.name} (แทน ${leader.name}) · เหตุผล: ${other.reason}`
        : `${envelopeName(env)} · ${me.name} → ${leader.name} · รอหัวหน้าทัวร์ยืนยันรับ`,
      photo,
    );
  };

  /**
   * ฝากต่อให้คนในระบบ — เปลี่ยนผู้ถือซองเป็นคนใหม่ (ล้างทอดรับ/ส่งต่อของคนเดิม) คนใหม่ต้องกดรับในแอปของตัวเอง
   * เก็บชื่อคนฝาก (relayFrom) ไว้ให้ผู้รับเห็นว่ารับต่อจากใคร · ประวัติเก็บทุกทอด
   */
  const relay = async (env: CashEnvelope, photo: string, t: RelayTarget) => {
    const h = { ...env.handover! };
    delete h.proxyStaffId;
    delete h.proxyLeaderId;
    const next: CashEnvelope = {
      ...env,
      handover: {
        ...h,
        receiverKind: t.kind === 'staff' ? 'staff' : 'leader',
        proxyName: t.name,
        relayFrom: `${title} ${me.name}`,
        ...(t.kind === 'staff' ? { proxyStaffId: t.id } : { proxyLeaderId: t.id }),
      },
    };
    delete next.staffAck;
    delete next.staffHandoff;
    await saveEnvelope(
      next,
      'ฝากต่อให้ผู้ถือซองคนใหม่',
      `${envelopeName(env)} · ${me.name} → ${carrierTitle(t.kind)} ${t.name} · รอ ${t.name} กดรับในแอปของตัวเอง`,
      photo,
    );
  };

  /** ติดปัญหาหน้างาน → ส่งซองคืนการเงิน (รอการเงินยืนยันรับคืน ซองยังไม่ถือว่ากลับถึงการเงินจนกว่าจะยืนยัน) */
  const giveBack = async (env: CashEnvelope, reason: string, photo: string) => {
    await saveEnvelope(
      { ...env, staffReturn: { at: toISODateTime(new Date()), staffId: me.id, staffName: me.name, reason, ...(photo ? { photo } : {}) } },
      `${title}ส่งซองคืนการเงิน`,
      `${envelopeName(env)} · เหตุผล: ${reason} · รอการเงินยืนยันรับคืน`,
      photo,
    );
  };

  return { leaderOf, relayTargetsFor, receive, passOn, relay, giveBack };
}

/**
 * ซองที่ต้องส่งของกรุ๊ปเดียว (1 ซองหรือหลายซอง) ในการ์ดเดียว — หัวกรุ๊ปและขั้นตอนแสดงครั้งเดียว
 * ซองละ 1 แถวสั้น ๆ · ปุ่มยืนยันทำกับทุกซองที่อยู่ขั้นเดียวกันพร้อมกัน ด้วยรูปหลักฐานรูปเดียว (ถ่ายรวมทุกซอง)
 * แต่ละซองยังบันทึกประวัติ/รูปแยกของตัวเอง
 */
export function CarrierEnvelopeCard({
  envs,
  leader,
  onReceive,
  onPassOn,
  onReturn,
  relayTargets = [],
  onRelay,
}: {
  envs: CashEnvelope[];
  /** หัวหน้าทัวร์ที่คอนเฟิร์มแล้วของกรุ๊ป — null = ยังไม่มี ส่งมอบไม่ได้ */
  leader: { id: string; name: string } | null;
  onReceive: (env: CashEnvelope, photo: string) => Promise<void>;
  onPassOn: (env: CashEnvelope, photo: string, other?: { name: string; reason: string }) => Promise<void>;
  onReturn: (env: CashEnvelope, reason: string, photo: string) => Promise<void>;
  /** คนในระบบที่ฝากต่อได้ (เจ้าหน้าที่ส่งกรุ๊ป / หัวหน้าทัวร์คนอื่น) — คนนั้นต้องกดรับในแอปของตัวเองต่อ */
  relayTargets?: RelayTarget[];
  onRelay?: (env: CashEnvelope, photo: string, target: RelayTarget) => Promise<void>;
}) {
  const p = getTourPeriodById(envs[0].periodId);
  /** กล่องยืนยันที่เปิดอยู่ — ทุกทอดต้องแนบรูปถ่ายก่อนกดยืนยัน */
  const [mode, setMode] = useState<'receive' | 'handoff' | 'other' | 'return' | 'relay' | null>(null);
  const [relayKey, setRelayKey] = useState('');
  const relayTarget = relayTargets.find((t) => t.key === relayKey);
  const [otherName, setOtherName] = useState('');
  const [reason, setReason] = useState('');
  const allReceive = envs.filter((e) => envelopeStage(e) === 'handed_over' && !e.staffAck && !e.staffReturn);
  const allHolding = envs.filter((e) => !!e.staffAck && !e.staffHandoff && !e.staffReturn);
  /**
   * ซองที่ไม่เลือก (ทำบางซองได้ เช่น รับมาแค่ซองเดียว / คืนการเงินแค่ซองเดียว) — ค่าเริ่มต้นเลือกทุกซอง
   * เก็บเป็น "ที่ไม่เลือก" ซองที่เพิ่งเข้าขั้นนี้จึงถูกเลือกเองโดยไม่ต้องรีเซ็ต
   */
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set());
  const togglePick = (id: string) => setUnpicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  // มีให้เลือกเฉพาะเมื่อขั้นเดียวกันมีมากกว่า 1 ซอง
  const pickable = (e: CashEnvelope) => (allReceive.length > 1 && allReceive.includes(e)) || (allHolding.length > 1 && allHolding.includes(e));
  const toReceive = allReceive.filter((e) => !unpicked.has(e.id));
  const holding = allHolding.filter((e) => !unpicked.has(e.id));
  const receiverName = leader?.name ?? envs[0].handover!.receiverName;
  /** ส่งมอบให้ใคร: หัวหน้าทัวร์ที่ฝากต่อ (การเงินกำหนดไว้) หรือหัวหน้าทัวร์ของกรุ๊ป */
  const plannedNext = envs.map((e) => e.handover?.nextLeaderCarrier ?? e.handover?.finalLeaderCarrier).find(Boolean);
  const plannedStaff = envs.find((e) => e.handover?.nextStaffCarrier)?.handover?.nextStaffCarrier;
  /** การเงินกำหนดให้นำส่งแลนด์ — ทอดสุดท้ายต้องระบุชื่อผู้รับ */
  // เฉพาะผู้ถือทอดสุดท้าย — ยังมีคนต้องรับต่อ (เจ้าหน้าที่ → หัวหน้าทัวร์คนอื่น) ให้ส่งต่อตามปกติก่อน
  const toLand = envs.some((e) => e.handover?.carrierToLand && !e.handover.nextLeaderCarrier && !e.handover.nextStaffCarrier && !e.handover.finalLeaderCarrier);
  const handoffTo = toLand ? { name: 'แลนด์', carrier: false, note: '' }
    : plannedNext ? { name: plannedNext.name, carrier: true, note: ' (หัวหน้าทัวร์ประจำกรุ๊ปอื่น)' }
      : plannedStaff ? { name: plannedStaff.name, carrier: true, note: ' (เจ้าหน้าที่ประจำกรุ๊ป)' }
        : leader ? { name: leader.name, carrier: false, note: '' } : null;
  const closeForm = () => { setMode(null); setOtherName(''); setReason(''); setRelayKey(''); };
  /** ทำทีละซอง (บันทึกประวัติแยกของแต่ละซอง) แล้วปิดกล่อง */
  const runAll = async (list: CashEnvelope[], fn: (e: CashEnvelope) => Promise<void>) => {
    for (const e of list) await fn(e);
    closeForm();
  };
  const many = (list: CashEnvelope[]) => (list.length > 1 ? ` ${list.length} ซอง` : '');
  const summary = (list: CashEnvelope[]) => list.map((e) => `${envelopeName(e)} · ${fmt(e.sealed?.faceTotals ?? [])}`).join(' | ');
  const total = fmt(sumAmounts(envs.flatMap((e) => e.sealed?.faceTotals ?? [])));
  const h0 = envs[0].handover!;

  return (
    <li>
      <Card className="space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold zego-text">{p?.groupCode ?? envs[0].periodId}</p>
            <p className="line-clamp-1 text-xs zego-text-secondary">{p?.displayName}</p>
            {p && <p className="text-xs zego-text-tertiary">เดินทาง {formatDateRange(p.startDate, p.endDate)}</p>}
          </div>
          {envs.length === 1 ? <EnvelopeStatusBadge env={envs[0]} short /> : <StatusPill label={`${envs.length} ซอง`} tone="violet" />}
        </div>

        {/* ซองละแถว — ชื่อ ยอด สถานะ รูปหลักฐานของแต่ละทอด */}
        <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg zego-surface-soft-bg text-xs">
          {envs.map((env) => (
            <li key={env.id} className="space-y-0.5 px-3 py-2">
              {pickable(env) ? (
                <label className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 shrink-0 accent-emerald-600" checked={!unpicked.has(env.id)} onChange={() => togglePick(env.id)} />
                    <span className="truncate font-semibold zego-text">{envelopeName(env)}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums zego-text">{fmt(env.sealed?.faceTotals ?? [])}</span>
                </label>
              ) : (
                <p className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-semibold zego-text">{envelopeName(env)}</span>
                  <span className="shrink-0 font-semibold tabular-nums zego-text">{fmt(env.sealed?.faceTotals ?? [])}</span>
                </p>
              )}
              {envs.length > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <EnvelopeStatusBadge env={env} short />
                  <span className="flex items-center gap-1">
                    <ProofThumb src={env.staffAck?.photo} label={`รับซองจากการเงิน · ${envelopeName(env)}`} />
                    <ProofThumb src={env.staffHandoff?.photo} label={`ส่งต่อให้ ${env.handover!.receiverName} · ${envelopeName(env)}`} />
                  </span>
                </div>
              )}
              {envs.length === 1 && (env.staffAck || env.staffHandoff) && (
                <span className="flex items-center gap-1">
                  <ProofThumb src={env.staffAck?.photo} label={`รับซองจากการเงิน · ${envelopeName(env)}`} />
                  <ProofThumb src={env.staffHandoff?.photo} label={`ส่งต่อให้ ${env.handover!.receiverName} · ${envelopeName(env)}`} />
                </span>
              )}
              {env.staffReturn && (
                <div className="flex items-start justify-between gap-2 text-amber-900">
                  <p>ส่งคืนการเงิน {formatDateTime(env.staffReturn.at)} — รอการเงินยืนยันรับคืน (เหตุผล: {env.staffReturn.reason})</p>
                  <ProofThumb src={env.staffReturn.photo} label={`ส่งซองคืนการเงิน · ${envelopeName(env)}`} />
                </div>
              )}
              {env.staffHandoff && (
                <p style={{ color: '#5b21b6' }}>
                  {env.handover!.receiverKind === 'other'
                    ? `ส่งให้ ${env.handover!.receiverName} แล้ว — รอหัวหน้าทัวร์ยืนยันรับ`
                    : `รอ ${env.handover!.receiverName} ยืนยันรับในเครื่องของตัวเอง`}
                </p>
              )}
            </li>
          ))}
          {envs.length > 1 && (
            <li className="flex justify-between gap-2 px-3 py-1.5 font-semibold zego-text">
              <span>รวม</span>
              <span className="tabular-nums">{total}</span>
            </li>
          )}
        </ul>

        <p className="text-xs zego-text-secondary">
          {toLand
            ? <>นำส่ง: <span className="font-medium zego-text">แลนด์</span> (ระบุชื่อตอนส่ง · ไม่ผ่านหัวหน้าทัวร์ประจำกรุ๊ป)</>
            : plannedStaff
              ? <>ส่งต่อให้เจ้าหน้าที่ประจำกรุ๊ป: <span className="font-medium zego-text">{plannedStaff.name}</span></>
            : plannedNext
              ? <>ส่งต่อให้หัวหน้าทัวร์ประจำกรุ๊ปอื่น: <span className="font-medium zego-text">{plannedNext.name}</span>{envs.some((e) => e.handover?.carrierToLand) ? ' — แล้วนำส่งแลนด์' : ''}</>
              : <>ส่งให้หัวหน้าทัวร์: <span className="font-medium zego-text">{leader ? leader.name : 'ยังไม่มีหัวหน้าทัวร์ที่คอนเฟิร์ม'}</span></>}
          <span className="zego-text-tertiary">
            {h0.relayFrom ? ` · ฝากต่อจาก ${h0.relayFrom}` : ` · การเงินฝากให้คุณ ${formatDateTime(h0.at)}${h0.byName ? ` โดย ${h0.byName}` : ''}`}
          </span>
        </p>
        {/* ขั้นตอนบรรทัดเดียว — สถานะของแต่ละซองบอกแล้วว่าถึงขั้นไหน */}
        <p className="text-[11px] zego-text-tertiary">
          {toLand
            ? 'รับซอง → ส่งให้แลนด์ (ระบุชื่อแลนด์ + แนบรูป) — จบที่คุณ'
            : plannedStaff
              ? `รับซอง → ส่งต่อให้ ${plannedStaff.name} (เจ้าหน้าที่ประจำกรุ๊ป) → เจ้าหน้าที่นำส่งหัวหน้าทัวร์ของกรุ๊ป`
              : 'รับซอง → ส่งต่อให้หัวหน้าทัวร์ของกรุ๊ป (หรือฝากต่อคนในระบบ) → หัวหน้าทัวร์ยืนยันรับในเครื่องของตัวเอง'}
        </p>

        {(allReceive.length > 1 || allHolding.length > 1) && (
          <p className="text-[11px] zego-text-tertiary">ติ๊กเลือกซองที่จะทำรายการ — ทำบางซองก่อนได้ ที่เหลือทำทีหลัง</p>
        )}
        {allReceive.length > 0 && (
          <Button variant="primary" className="w-full" icon="camera" disabled={toReceive.length === 0} onClick={() => setMode('receive')}>
            {toReceive.length === 0 ? 'เลือกซองที่ได้รับก่อน' : `ยืนยันรับซอง${many(toReceive)} (แนบรูป)`}
          </Button>
        )}
        {/* ถือซองอยู่ — ส่งมอบได้เมื่อกรุ๊ปมีหัวหน้าทัวร์ที่คอนเฟิร์มแล้ว หรือการเงินกำหนดให้ฝากต่อหัวหน้าทัวร์คนอื่น */}
        {allHolding.length > 0 && !handoffTo && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            กรุ๊ปนี้ยังไม่มีหัวหน้าทัวร์ที่คอนเฟิร์ม — ยังส่งมอบไม่ได้ ติดต่อผู้จัดสเก็ต หรือส่งซองคืนการเงิน
          </p>
        )}
        {allHolding.length > 0 && (
          <div className="space-y-2">
            <Button variant="primary" className="w-full" icon={toLand ? 'camera' : 'check'} disabled={!handoffTo || holding.length === 0} onClick={() => setMode('handoff')}>
              {holding.length === 0 ? 'เลือกซองที่จะส่งมอบก่อน' : handoffTo ? `ส่งมอบ${many(holding)}ให้ ${handoffTo.name}${handoffTo.note}${toLand ? ' (แนบรูป)' : ''}` : 'ส่งมอบให้หัวหน้าทัวร์'}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              {/* ฝากต่อให้คนในระบบ (เจ้าหน้าที่/หัวหน้าทัวร์คนอื่น) — คนนั้นกดรับในแอปต่อ ไล่ตรวจย้อนหลังได้ทุกทอด */}
              {onRelay && relayTargets.length > 0 && (
                <Button variant="secondary" size="sm" className="col-span-2 justify-center" disabled={holding.length === 0} onClick={() => setMode('relay')}>
                  ฝากต่อให้คนในระบบ
                </Button>
              )}
              <Button variant="secondary" size="sm" className="justify-center" disabled={!leader || toLand || holding.length === 0} onClick={() => setMode('other')}>
                ผู้รับไม่ใช่คนที่กำหนด
              </Button>
              <Button variant="secondary" size="sm" className="justify-center" disabled={holding.length === 0} onClick={() => setMode('return')}>
                ส่งซองคืนการเงิน
              </Button>
            </div>
          </div>
        )}

        {/* กล่องยืนยันของแต่ละทอด — ต้องแนบรูปถ่ายก่อนจึงกดยืนยันได้ · ทำกับทุกซองในขั้นเดียวกัน */}
        {mode === 'receive' && (
          <PhotoConfirmModal
            title={`ยืนยันรับซอง${many(toReceive)}`}
            description={summary(toReceive)}
            confirmLabel="ยืนยันรับซอง"
            photoHint={toReceive.length > 1 ? 'ถ่ายรูปซองทั้งหมดที่ได้รับรวมกัน ให้เห็นหน้าซองและยอดเงินชัดเจน' : 'ถ่ายรูปซองที่ได้รับ ให้เห็นหน้าซองและยอดเงินชัดเจน'}
            onClose={closeForm}
            onConfirm={(photo) => runAll(toReceive, (e) => onReceive(e, photo))}
          />
        )}
        {mode === 'handoff' && handoffTo && toLand && (
          <PhotoConfirmModal
            title={`ส่งซอง${many(holding)}ให้แลนด์`}
            description={summary(holding)}
            confirmLabel="ยืนยันส่งมอบ"
            photoHint="ถ่ายรูปผู้รับคู่กับซอง ณ จุดส่งมอบ"
            canConfirm={!!otherName.trim()}
            onClose={closeForm}
            onConfirm={(photo) => runAll(holding, (e) => onPassOn(e, photo, { name: otherName.trim(), reason: reason.trim() }))}
          >
            <TextInput label="ชื่อแลนด์ / ผู้รับ" required value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="เช่น บริษัท ABC Travel / Mr. Wang" />
            <TextArea label="หมายเหตุ" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ไม่บังคับ" />
          </PhotoConfirmModal>
        )}
        {mode === 'handoff' && handoffTo && !toLand && (
          <PhotoConfirmModal
            title={`ส่งมอบซอง${many(holding)}ให้ ${handoffTo.name}`}
            description={summary(holding)}
            confirmLabel="ยืนยันส่งมอบ"
            photoOptional
            photoHint={`${handoffTo.name} เป็นคนถ่ายรูปตอนกดยืนยันรับในแอปของตัวเอง — แนบรูปฝั่งคุณเพิ่มได้ถ้าต้องการ`}
            onClose={closeForm}
            onConfirm={(photo) => runAll(holding, (e) => onPassOn(e, photo))}
          />
        )}
        {mode === 'other' && (
          <PhotoConfirmModal
            title={`ส่งมอบให้ผู้รับคนอื่น (แทน ${receiverName})`}
            description={summary(holding)}
            confirmLabel="ยืนยันส่งมอบ"
            photoHint="ถ่ายรูปผู้รับจริงคู่กับซอง ณ จุดส่งมอบ"
            canConfirm={!!otherName.trim() && !!reason.trim()}
            onClose={closeForm}
            onConfirm={(photo) => runAll(holding, (e) => onPassOn(e, photo, { name: otherName.trim(), reason: reason.trim() }))}
          >
            <TextInput label="ชื่อผู้รับจริง" required value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="ชื่อ-นามสกุล ผู้ที่รับซอง" />
            <TextArea label="เหตุผล" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น หัวหน้าทัวร์ฝากเพื่อนร่วมทีมรับแทน" />
          </PhotoConfirmModal>
        )}
        {mode === 'relay' && onRelay && (
          <PhotoConfirmModal
            title={`ฝากต่อซอง${many(holding)}`}
            description={summary(holding)}
            confirmLabel="ยืนยันฝากต่อ"
            photoOptional
            photoHint="ผู้รับฝากเป็นคนถ่ายรูปตอนกดรับในแอปของตัวเอง — แนบรูปฝั่งคุณเพิ่มได้ถ้าต้องการ"
            canConfirm={!!relayTarget}
            onClose={closeForm}
            onConfirm={(photo) => runAll(holding, (e) => onRelay(e, photo, relayTarget!))}
          >
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium zego-text-secondary">ฝากต่อให้ <span className="text-rose-600">*</span></span>
              <select className="w-full rounded-lg border zego-border-color px-3 py-2" value={relayKey} onChange={(e) => setRelayKey(e.target.value)}>
                <option value="">— เลือก —</option>
                {(['leader', 'staff'] as const).map((k) => {
                  const list = relayTargets.filter((t) => t.kind === k);
                  return list.length > 0 && (
                    <optgroup key={k} label={k === 'leader' ? 'หัวหน้าทัวร์' : 'เจ้าหน้าที่ส่งกรุ๊ป'}>
                      {list.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
                    </optgroup>
                  );
                })}
              </select>
            </label>
            <p className="text-xs zego-text-tertiary">ผู้รับฝากต้องกดรับซองในแอปของตัวเอง แล้วนำไปส่ง {receiverName} ต่อ</p>
          </PhotoConfirmModal>
        )}
        {mode === 'return' && (
          <PhotoConfirmModal
            title={`ส่งซองคืนการเงิน${many(holding)}`}
            description={summary(holding)}
            confirmLabel="ยืนยันส่งคืน"
            photoOptional
            photoHint="การเงินเป็นคนถ่ายรูปตอนกดรับซองคืน — แนบรูปฝั่งคุณเพิ่มได้ถ้าต้องการ"
            canConfirm={!!reason.trim()}
            onClose={closeForm}
            onConfirm={(photo) => runAll(holding, (e) => onReturn(e, reason.trim(), photo))}
          >
            <TextArea label="เหตุผล" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น กรุ๊ปเลื่อนเดินทาง / ไม่พบหัวหน้าทัวร์ที่สนามบิน" />
          </PhotoConfirmModal>
        )}
      </Card>
    </li>
  );
}
