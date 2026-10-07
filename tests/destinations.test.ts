import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinationBreakdown, resolveDestination } from '../src/lib/logic/destinations';

test('ปลายทาง — จับคู่ชื่ออังกฤษกับ Country Master ได้ธง + ชื่อไทย', () => {
  assert.deepEqual(resolveDestination('JAPAN'), { key: 'JP', label: 'ญี่ปุ่น', flag: '🇯🇵', alpha2: 'jp' });
  assert.equal(resolveDestination('KOREA').label, 'เกาหลีใต้');
  assert.equal(resolveDestination('china').label, 'จีน');
  assert.equal(resolveDestination(null, 'C-VN').label, 'เวียดนาม');
  assert.deepEqual(resolveDestination('EUROPE'), { key: 'EUROPE', label: 'Europe', flag: '🌍' });
});

test('ปลายทาง — เรียงจากจำนวนงานมากไปน้อย', () => {
  const list = destinationBreakdown([
    { countryName: 'CHINA' }, { countryName: 'JAPAN' }, { countryName: 'JAPAN' }, { countryName: 'VIETNAM' }, { countryName: 'JAPAN' }, { countryName: 'CHINA' },
  ]);
  assert.deepEqual(list.map((d) => [d.label, d.count]), [['ญี่ปุ่น', 3], ['จีน', 2], ['เวียดนาม', 1]]);
});
