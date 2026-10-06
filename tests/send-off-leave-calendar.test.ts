import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeLeaveOn, leaveDatesLabel, leaveRangesOf, type SendOffLeaveRecord } from '../src/lib/logic/sendOffStaffLeave';

const rec = (id: string, startDate: string, endDate: string, status: SendOffLeaveRecord['status']) =>
  ({ id, staffId: 'S', type: 'personal', startDate, endDate, reason: '', status, requestedBy: 'x', requestedAt: '2026-10-01T09:00' }) as SendOffLeaveRecord;

test('ปฏิทินการลา — วันที่มีคำขอที่ยังมีผล (รอคอนเฟิร์ม/คอนเฟิร์มแล้ว) · ปฏิเสธ/ยกเลิก ไม่นับ', () => {
  const all = [rec('A', '2026-10-10', '2026-10-12', 'pending'), rec('B', '2026-10-15', '2026-10-15', 'approved'), rec('C', '2026-10-20', '2026-10-20', 'rejected'), rec('D', '2026-10-21', '2026-10-21', 'cancelled')];
  assert.equal(activeLeaveOn(all, '2026-10-11')?.id, 'A');
  assert.equal(activeLeaveOn(all, '2026-10-15')?.id, 'B');
  assert.equal(activeLeaveOn(all, '2026-10-20'), null);
  assert.equal(activeLeaveOn(all, '2026-10-21'), null);
  assert.equal(activeLeaveOn(all, '2026-10-13'), null);
});

test('วันที่เลือก → ช่วงที่ติดกัน (คำขอละช่วง) · ข้ามเดือนได้', () => {
  assert.deepEqual(leaveRangesOf(['2026-10-15', '2026-10-06', '2026-10-10', '2026-10-09']), [
    { startDate: '2026-10-06', endDate: '2026-10-06' },
    { startDate: '2026-10-09', endDate: '2026-10-10' },
    { startDate: '2026-10-15', endDate: '2026-10-15' },
  ]);
  assert.deepEqual(leaveRangesOf(['2026-10-31', '2026-11-01']), [{ startDate: '2026-10-31', endDate: '2026-11-01' }]);
});

test('ข้อความวันที่เลือก', () => {
  assert.equal(leaveDatesLabel(['2026-10-06', '2026-10-09', '2026-10-10', '2026-10-15']), '6, 9–10, 15 ต.ค.');
  assert.equal(leaveDatesLabel(['2026-10-30', '2026-11-05']), '30 ต.ค., 5 พ.ย.');
  assert.equal(leaveDatesLabel(['2026-10-31', '2026-11-01', '2026-11-03']), '31 ต.ค.–1, 3 พ.ย.');
  assert.equal(leaveDatesLabel([]), '');
});
