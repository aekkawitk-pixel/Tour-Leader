import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinationBreakdown, resolveDestination } from '../src/lib/logic/destinations';

test('ปลายทาง — จับคู่ชื่ออังกฤษกับ Country Master ได้ธง + ชื่อไทย', () => {
  assert.deepEqual(resolveDestination('JAPAN'), { key: 'JP', label: 'ญี่ปุ่น', flag: '🇯🇵', alpha2: 'jp' });
  assert.equal(resolveDestination('KOREA').label, 'เกาหลีใต้');
  assert.equal(resolveDestination('china').label, 'จีน');
  // ไม่มีชื่อประเทศ — ใช้สนามบินปลายทางหน้ารหัสกรุ๊ป
  assert.equal(resolveDestination(null, 'HRB-261211A-CZXJ').label, 'จีน');
  assert.equal(resolveDestination('', 'HAN-261003F-FD').label, 'เวียดนาม');
  assert.deepEqual(resolveDestination('EUROPE'), { key: 'EUROPE', label: 'Europe', flag: '🌍' });
});

test('ปลายทาง — เรียงจากจำนวนงานมากไปน้อย', () => {
  const list = destinationBreakdown([
    { countryName: 'CHINA' }, { countryName: 'JAPAN' }, { countryName: 'JAPAN' }, { countryName: 'VIETNAM' }, { countryName: 'JAPAN' }, { countryName: 'CHINA' },
  ]);
  assert.deepEqual(list.map((d) => [d.label, d.count]), [['ญี่ปุ่น', 3], ['จีน', 2], ['เวียดนาม', 1]]);
});

test('ปลายทาง — ไม่เชื่อรหัสประเทศของ Zego (จีน = CH ≠ สวิตเซอร์แลนด์)', () => {
  // countryCode ไม่ได้ใช้แล้ว — ชื่อ CHINA ต้องได้จีนเสมอ
  assert.equal(destinationBreakdown([{ countryName: 'CHINA', groupCode: 'HRB-261211A-CZXJ' }])[0].label, 'จีน');
});
