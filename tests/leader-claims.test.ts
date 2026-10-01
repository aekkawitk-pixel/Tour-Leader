import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeLeaderClaim, tipRateFor, tripDays } from '../src/lib/logic/leaderClaims';
import type { ExpenseRequest } from '../src/types';

const rates = { byCountry: { JAPAN: 300, CHINA: 200 }, byProgram: { 'โอซาก้า คามิโคจิ': 450 } };

test('อัตราค่าทิป: โปรแกรมเฉพาะชนะประเทศ · ไม่มีอัตรา = null', () => {
  assert.deepEqual(tipRateFor({ countryName: 'JAPAN', displayName: 'โอซาก้า คามิโคจิ' }, rates), { rate: 450, source: 'program' });
  assert.deepEqual(tipRateFor({ countryName: 'japan ', displayName: 'โตเกียว ฟูจิ' }, rates), { rate: 300, source: 'country' });
  assert.equal(tipRateFor({ countryName: 'EGYPT', displayName: 'ไคโร' }, rates), null);
});

test('จำนวนวันเดินทาง นับวันแรกและวันสุดท้าย', () => {
  assert.equal(tripDays('2026-10-01', '2026-10-06'), 6);
  assert.equal(tripDays('2026-10-01', '2026-10-01'), 1);
  assert.equal(tripDays('2026-10-01', null), 1);
});

const claim = (kind: 'per_diem' | 'tip', status: ExpenseRequest['status']): ExpenseRequest => ({
  id: `EXP-${kind}-${status}`, jobId: 'P1', category: 'leader_fee', claimKind: kind, requesterId: 'L1', requesterName: 'x',
  requestedAt: '2026-10-07T10:00', lines: [], totalTHB: 0, bankAccount: { bank: '', accountNoMasked: '', accountName: '', branch: '' },
  note: '', status, history: [],
});

test('ใบเบิกที่ยังมีผล: แยกตามประเภท · ใบที่ยกเลิก/ไม่อนุมัติไม่นับ', () => {
  const list = [claim('tip', 'rejected'), claim('per_diem', 'submitted')];
  assert.equal(activeLeaderClaim(list, 'P1', 'L1', 'per_diem')?.id, 'EXP-per_diem-submitted');
  assert.equal(activeLeaderClaim(list, 'P1', 'L1', 'tip'), null);
  assert.equal(activeLeaderClaim(list, 'P2', 'L1', 'per_diem'), null);
});
