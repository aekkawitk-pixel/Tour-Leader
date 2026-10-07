import { test } from 'node:test';
import assert from 'node:assert/strict';
import { airlineBreakdown, airlineCodeOf, airlineName } from '../src/lib/logic/airlines';

test('สายการบิน — ใช้ airlineCode ก่อน ไม่มีจึงดูท้ายรหัสกรุ๊ป', () => {
  assert.equal(airlineCodeOf({ airlineCode: 'tg', groupCode: 'NRT-261008J-NH' }), 'TG');
  assert.equal(airlineCodeOf({ airlineCode: null, groupCode: 'NRT-261008J-NH' }), 'NH');
  assert.equal(airlineCodeOf({ groupCode: 'CKG-261101A-3U' }), '3U');
  assert.equal(airlineCodeOf({ groupCode: 'ABC' }), '');
  assert.equal(airlineName('NH'), 'ANA');
  assert.equal(airlineName('ZZ'), 'ZZ');
});

test('สายการบิน — เรียงมาก→น้อย · ไม่ทราบไว้ท้าย', () => {
  const list = airlineBreakdown([
    { groupCode: 'CKG-261101A-3U' }, { groupCode: 'KIX-261105C-MM' }, { groupCode: 'CKG-261125A-3U' }, { groupCode: 'X' }, { groupCode: 'HND-261110K-NH' }, { groupCode: 'CAN-261121G-3U' },
  ]);
  assert.deepEqual(list.map((a) => [a.code, a.count]), [['3U', 3], ['NH', 1], ['MM', 1], ['', 1]]);
});
