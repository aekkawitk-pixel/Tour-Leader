import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listGuideAlerts } from '../src/lib/logic/guideAlerts';
import type { GuidePeriodAssignment } from '../src/services/guideAssignmentStore';
import type { TourPeriodMaster } from '../src/data/schedule/masterTypes';
import type { CashEnvelope } from '../src/lib/logic/cashEnvelope';
import type { Appointment } from '../src/types';

const TODAY = '2026-10-06';
const period = (id: string, startDate: string, endDate: string) =>
  ({ internalId: id, groupCode: id, displayName: `โปรแกรม ${id}`, startDate, endDate } as TourPeriodMaster);
const periods = new Map([
  ['P1', period('P1', '2026-10-08', '2026-10-12')],
  ['P2', period('P2', '2026-09-01', '2026-09-05')],
]);
const assign = (periodId: string, assignedAt: string, tourLeaderId = 'L1'): GuidePeriodAssignment => ({
  assignmentId: `GA-lead-${periodId}`, periodId, tourLeaderId, role: 'lead', assignmentStatus: 'CONFIRMED',
  assignedBy: 'ผู้จัด', assignedAt, confirmedAt: assignedAt,
});
const base = {
  leaderId: 'L1',
  today: TODAY,
  periodById: (id: string) => periods.get(id) ?? null,
  envelopes: [] as CashEnvelope[],
  appointments: [] as Appointment[],
};

test('งานใหม่ — จัดให้ไม่นาน ยังไม่จบทริป ยังไม่เปิดดู', () => {
  const alerts = listGuideAlerts({ ...base, assignments: [assign('P1', '2026-10-01T00:00')] });
  assert.deepEqual(alerts.map((a) => a.kind), ['new_job']);
  assert.equal(alerts[0].href, '/guide/jobs/P1');
});

test('งานใหม่ — ไม่นับงานที่เปิดดูแล้ว งานเก่าเกิน 14 วัน งานที่จบทริปแล้ว และงานของคนอื่น', () => {
  const alerts = listGuideAlerts({
    ...base,
    assignments: [
      { ...assign('P1', '2026-10-01T00:00'), leaderSeenAt: '2026-10-02T09:00' },
      { ...assign('P1', '2026-09-01T00:00'), assignmentId: 'old' },
      assign('P2', '2026-08-25T00:00'),
      { ...assign('P1', '2026-10-01T00:00', 'L2'), assignmentId: 'other' },
    ],
  });
  assert.equal(alerts.length, 0);
});

test('ซองรอรับ — รวมเป็นรายการเดียวต่อกรุ๊ป · ซองที่รับแล้วไม่นับ', () => {
  const env = (id: string, ack: boolean): CashEnvelope => ({
    id, periodId: 'P1', no: 1, packedLineIds: ['x'], history: [],
    sealed: { at: 't', byName: 'fin', faceTotals: [], lineSnapshot: [] },
    handover: { at: 't', byName: 'fin', receiverKind: 'leader', receiverId: 'L1', receiverName: 'L1' },
    ...(ack ? { leaderAck: { at: 't', leaderId: 'L1', leaderName: 'L1' } } : {}),
  } as CashEnvelope);
  const alerts = listGuideAlerts({ ...base, assignments: [], envelopes: [env('E1', false), env('E2', false), env('E3', true)] });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, 'envelope');
  assert.equal(alerts[0].title, 'มีซองรอรับ 2 ซอง');
});

test('นัดหมายรอยืนยัน — เฉพาะของตัวเอง สถานะรอยืนยัน และยังไม่เลยวันนัด', () => {
  const apt = (id: string, date: string, status: Appointment['status'], leaderId = 'L1') =>
    ({ id, date, time: '10:00', leaderId, status, jobId: '', staffName: 'การเงิน' } as Appointment);
  const alerts = listGuideAlerts({
    ...base,
    assignments: [],
    appointments: [apt('A1', '2026-10-07', 'pending'), apt('A2', '2026-10-07', 'confirmed'), apt('A3', '2026-10-01', 'pending'), apt('A4', '2026-10-07', 'pending', 'L2')],
  });
  assert.deepEqual(alerts.map((a) => a.id), ['apt-A1']);
});
