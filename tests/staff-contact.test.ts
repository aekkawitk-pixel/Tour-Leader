import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStaffContact } from '../src/lib/logic/sendOffStaff';

const ok = { phone: '081-234-5678', email: '', ecName: '', ecPhone: '' };

test('แก้ข้อมูลติดต่อเอง — เบอร์โทรบังคับ · อีเมลไม่บังคับแต่ต้องถูกรูปแบบ · ผู้ติดต่อฉุกเฉินมีชื่อต้องมีเบอร์', () => {
  assert.deepEqual(validateStaffContact(ok), {});
  assert.deepEqual(validateStaffContact({ ...ok, phone: '' }), { phone: 'กรุณาระบุเบอร์โทร' });
  assert.ok(validateStaffContact({ ...ok, phone: '12345' }).phone);
  assert.deepEqual(validateStaffContact({ ...ok, phone: '02 123 4567' }), {});
  assert.ok(validateStaffContact({ ...ok, email: 'abc' }).email);
  assert.deepEqual(validateStaffContact({ ...ok, email: 'a@b.co' }), {});
  assert.ok(validateStaffContact({ ...ok, ecName: 'แม่' }).ecPhone);
  assert.deepEqual(validateStaffContact({ ...ok, ecName: 'แม่', ecPhone: '0899999999' }), {});
});

test('อายุงาน / อายุ — ปีเดือนเต็ม (ยังไม่ถึงวันที่ของเดือน = ยังไม่ครบเดือน)', async () => {
  const { fullYearsMonths, tenureLabel } = await import('../src/lib/logic/sendOffStaff');
  assert.deepEqual(fullYearsMonths('2024-07-15', '2026-10-06'), { years: 2, months: 2 });
  assert.deepEqual(fullYearsMonths('1990-10-06', '2026-10-06'), { years: 36, months: 0 });
  assert.deepEqual(fullYearsMonths('1990-10-07', '2026-10-06'), { years: 35, months: 11 });
  assert.equal(fullYearsMonths('2027-01-01', '2026-10-06'), null);
  assert.equal(tenureLabel('2024-07-15', '2026-10-06'), '2 ปี 2 เดือน');
  assert.equal(tenureLabel('2026-09-20', '2026-10-06'), 'ไม่ถึง 1 เดือน');
  assert.equal(tenureLabel('2025-10-06', '2026-10-06'), '1 ปี');
  assert.equal(tenureLabel(undefined, '2026-10-06'), null);
});
