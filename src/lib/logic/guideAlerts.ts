/**
 * กระดิ่งแจ้งเตือนของพอร์ทัลหัวหน้าทัวร์ — เฉพาะเรื่องที่ต้องทำจริง (แทนการนับ "งานรอคอนเฟิร์ม" เดิม
 * ซึ่งเป็น 0 เสมอ เพราะผู้จัดมอบหมายงาน = คอนเฟิร์มทันที)
 *
 *   ได้รับงานใหม่      — งานที่จัดให้ภายใน NEW_JOB_DAYS วัน ยังไม่จบทริป และยังไม่เคยเปิดดูรายละเอียด
 *   มีซองรอรับ         — ซองที่ส่งถึงคุณแล้ว (หรือกำลังนำมาส่ง) ยังไม่กดยืนยันรับ · รวมเป็นรายการเดียวต่อกรุ๊ป
 *   นัดหมายรอยืนยัน    — นัดที่เจ้าหน้าที่นัดคุณไว้ สถานะรอยืนยัน และยังไม่เลยวันนัด
 */

import type { Appointment } from '@/types';
import type { GuidePeriodAssignment } from '@/services/guideAssignmentStore';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';
import { leaderEnvelopeState, type CashEnvelope } from './cashEnvelope';
import { tripEnded } from './tripPhase';
import { addDays, formatDate, formatDateRange } from '@/lib/format';

/** งานที่จัดให้ภายในกี่วันจึงนับเป็น "งานใหม่" — กันงานเก่าทั้งหมดขึ้นเป็นงานใหม่ในครั้งแรกที่ใช้ */
export const NEW_JOB_DAYS = 14;

export type GuideAlertKind = 'new_job' | 'envelope' | 'appointment';

export interface GuideAlert {
  id: string;
  kind: GuideAlertKind;
  title: string;
  detail: string;
  href: string;
}

export function listGuideAlerts(input: {
  leaderId: string | null;
  today: string;
  assignments: GuidePeriodAssignment[];
  periodById: (id: string) => TourPeriodMaster | null;
  seenJobIds: Set<string>;
  envelopes: CashEnvelope[];
  appointments: Appointment[];
}): GuideAlert[] {
  const { leaderId, today, periodById } = input;
  if (!leaderId) return [];
  const out: GuideAlert[] = [];

  const recentFrom = addDays(today, -NEW_JOB_DAYS);
  for (const a of input.assignments) {
    if (a.tourLeaderId !== leaderId || a.assignmentStatus !== 'CONFIRMED' || input.seenJobIds.has(a.assignmentId)) continue;
    if (a.assignedAt.slice(0, 10) < recentFrom) continue;
    const p = periodById(a.periodId);
    if (!p || tripEnded(p, today)) continue;
    out.push({
      id: `job-${a.assignmentId}`,
      kind: 'new_job',
      title: `ได้รับงานใหม่ ${p.groupCode}`,
      detail: `${p.displayName} · ${formatDateRange(p.startDate, p.endDate)}`,
      href: `/guide/jobs/${encodeURIComponent(a.periodId)}`,
    });
  }

  const envCount = new Map<string, number>();
  for (const e of input.envelopes) {
    const s = leaderEnvelopeState(e, leaderId);
    if (s === 'to_ack' || s === 'in_transit') envCount.set(e.periodId, (envCount.get(e.periodId) ?? 0) + 1);
  }
  for (const [periodId, n] of envCount) {
    const p = periodById(periodId);
    out.push({
      id: `env-${periodId}`,
      kind: 'envelope',
      title: `มีซองรอรับ ${n} ซอง`,
      detail: p ? `${p.groupCode} · ${formatDateRange(p.startDate, p.endDate)}` : periodId,
      href: '/guide/finance?tab=before',
    });
  }

  for (const ap of input.appointments) {
    if (ap.leaderId !== leaderId || ap.status !== 'pending' || ap.date < today) continue;
    const p = ap.jobId ? periodById(ap.jobId) : null;
    out.push({
      id: `apt-${ap.id}`,
      kind: 'appointment',
      title: 'นัดหมายรอยืนยัน',
      detail: `${formatDate(ap.date)} ${ap.time} น.${p ? ` · ${p.groupCode}` : ''} · ${ap.staffName}`,
      href: '/guide/settlement/appointments',
    });
  }

  return out;
}
