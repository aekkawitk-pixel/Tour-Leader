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

import { flightNoOf } from '../src/lib/logic/airlines';

test('เลขเที่ยวบิน — ไม่ต่อรหัสสายการบินซ้ำ', () => {
  assert.equal(flightNoOf({ airlineCode: 'NH', flightNumber: 'NH806' }), 'NH806');
  assert.equal(flightNoOf({ airlineCode: '3U', flightNumber: '3U3772' }), '3U3772');
  assert.equal(flightNoOf({ airlineCode: 'TG', flightNumber: '640' }), 'TG640');
  assert.equal(flightNoOf({ airlineCode: 'tg', flightNumber: 'tg 640' }), 'TG640');
  assert.equal(flightNoOf({ airlineCode: '', flightNumber: 'FD634' }), 'FD634');
  assert.equal(flightNoOf(null), '');
});

import { tripAirports } from '../src/lib/logic/airlines';

test('สนามบินขาไป/ขากลับ — กลับคนละสนามบินต้องเห็นทั้งคู่', () => {
  const thai = (c: string) => ['BKK', 'DMK', 'CNX'].includes(c);
  const s = (from: string, to: string) => ({ fromAirportCode: from, toAirportCode: to });
  assert.deepEqual(tripAirports({ sectors: [s('BKK', 'NRT'), s('NRT', 'DMK')] }, thai), { out: 'BKK', back: 'DMK' });
  assert.deepEqual(tripAirports({ sectors: [s('BKK', 'NRT'), s('NRT', 'BKK')] }, thai), { out: 'BKK', back: 'BKK' });
  // จบต่างประเทศ (ขาเดียว/ข้อมูลไม่ครบ) — ไม่นับเป็นขากลับ
  assert.deepEqual(tripAirports({ sectors: [s('BKK', 'IST'), s('IST', 'TLL')] }, thai), { out: 'BKK', back: '' });
  // ไม่มี sector — ใช้สนามบินต้นทางของพีเรียด
  assert.deepEqual(tripAirports({ departureAirportCode: 'dmk', sectors: [] }, thai), { out: 'DMK', back: '' });
});
