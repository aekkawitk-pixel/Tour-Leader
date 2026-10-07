import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceDocFallback, parseTravelDates } from '../src/lib/logic/advanceDocFallback';

test('เอกสารเบิก — ข้อมูลสำรองเมื่อไม่พบกรุ๊ปใน Master', () => {
  const f = advanceDocFallback({
    groupCode: 'KIX-261001K-MM',
    programName: 'ZGKIX-2648MM : โอซาก้า คามิโคจิ ชิราคาวาโกะ เกียวโต ชมใบไม้เปลี่ยนสี (อิสระ 1 วัน) 6 วัน 4 คืน',
    travelDates: '01/10/26 - 06/10/26',
  });
  assert.equal(f.startDate, '2026-10-01');
  assert.equal(f.endDate, '2026-10-06');
  assert.equal(f.countryName, 'JAPAN');
  assert.equal(f.programName, 'โอซาก้า คามิโคจิ ชิราคาวาโกะ เกียวโต ชมใบไม้เปลี่ยนสี (อิสระ 1 วัน) 6 วัน 4 คืน');
});

test('เอกสารเบิก — อ่านวันเดินทางหลายรูปแบบ / อ่านไม่ได้ = null', () => {
  assert.deepEqual(parseTravelDates('01/10/2569 – 06/10/2569'), { startDate: '2026-10-01', endDate: '2026-10-06' });
  assert.deepEqual(parseTravelDates('5/11/26'), { startDate: '2026-11-05', endDate: '2026-11-05' });
  assert.equal(parseTravelDates(''), null);
  assert.equal(parseTravelDates('ไม่ระบุ'), null);
  assert.equal(advanceDocFallback(undefined).countryName, '');
});
