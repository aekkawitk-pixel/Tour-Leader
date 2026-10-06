import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupsReadyToClear, moneyGroupIds } from '../src/lib/logic/clearQueue';
import type { Appointment, ExpenseRequest } from '../src/types';

const today = '2026-10-20';
const period = (id: string, endDate: string) => ({ internalId: id, startDate: '2026-10-01', endDate });
const perDiem = (jobId: string, status: ExpenseRequest['status'] = 'submitted') =>
  ({ id: `PD-${jobId}`, jobId, category: 'leader_fee', claimKind: 'per_diem', status, lines: [], history: [], requestedAt: '2026-10-15' }) as unknown as ExpenseRequest;
const receipt = (jobId: string, status: ExpenseRequest['status']) =>
  ({ id: `R-${jobId}`, jobId, category: 'actual', status, lines: [], history: [], requestedAt: '2026-10-15' }) as unknown as ExpenseRequest;

test('กรุ๊ปพร้อมนัดเคลียร์ — จบทริป + ทำครบ · ไม่ขึ้นถ้ามีนัดแล้ว / ปิดแล้ว / ยังไม่จบทริป / ยังไม่ครบ', () => {
  const expenses = [
    perDiem('READY-OLD'), perDiem('READY-NEW'),
    perDiem('BOOKED'), perDiem('CLOSED'), perDiem('TRAVELING'),
    perDiem('FIX'), receipt('FIX', 'revise'),
    perDiem('NO-PERDIEM', 'draft'),
  ];
  const appointments = [{ id: 'A1', kind: 'clear', jobId: 'BOOKED', status: 'pending' } as Appointment];
  const out = groupsReadyToClear({
    periods: [
      period('READY-NEW', '2026-10-15'), period('READY-OLD', '2026-10-05'), period('BOOKED', '2026-10-05'),
      period('CLOSED', '2026-10-05'), period('TRAVELING', '2026-10-25'), period('FIX', '2026-10-05'), period('NO-PERDIEM', '2026-10-05'),
    ],
    today, envelopes: [], expenses, appointments, closedIds: new Set(['CLOSED']),
  });
  assert.deepEqual(out.map((c) => c.periodId), ['READY-OLD', 'READY-NEW']); // จบทริปนานสุดก่อน
});

test('นัดที่ยกเลิกแล้วไม่นับ — กรุ๊ปกลับมาให้นัดใหม่', () => {
  const out = groupsReadyToClear({
    periods: [period('G', '2026-10-05')], today, envelopes: [], expenses: [perDiem('G')],
    appointments: [{ id: 'A', kind: 'clear', jobId: 'G', status: 'cancelled' } as Appointment], closedIds: new Set(),
  });
  assert.deepEqual(out.map((c) => c.periodId), ['G']);
});

test('กรุ๊ปที่มีความเคลื่อนไหวทางเงิน — ใบเสร็จ / เบี้ยเลี้ยง (ไม่นับที่ยกเลิก)', () => {
  assert.deepEqual(moneyGroupIds([], [perDiem('A'), receipt('B', 'submitted'), receipt('C', 'cancelled')]).sort(), ['A', 'B']);
});
