import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLockLabel, detectDevice, hashPin, validateNewPin } from '../src/lib/logic/guideDevice';

test('อุปกรณ์ — เดาเครื่องจาก User-Agent', () => {
  assert.deepEqual(
    detectDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'),
    { name: 'iPhone', kind: 'phone', os: 'ios' },
  );
  // iPad รุ่นใหม่แสร้งเป็น Mac — แยกด้วยจอสัมผัส
  assert.equal(detectDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5).name, 'iPad');
  assert.equal(detectDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0).name, 'Mac');
  assert.deepEqual(
    detectDevice('Mozilla/5.0 (Linux; Android 14; SM-A556E Build/UP1A.231005.007) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36'),
    { name: 'SM-A556E', kind: 'phone', os: 'android' },
  );
  // Chrome ซ่อนรุ่นเครื่องเป็น "K"
  assert.equal(detectDevice('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36').name, 'Android');
  assert.equal(detectDevice('Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 Chrome/126.0 Safari/537.36').kind, 'tablet');
  assert.equal(detectDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0').kind, 'desktop');
  assert.equal(detectDevice('').name, 'เบราว์เซอร์นี้');
});

test('อุปกรณ์ — กติกา PIN ใหม่', () => {
  assert.equal(validateNewPin('48213', '48213'), 'PIN ต้องเป็นตัวเลข 6 หลัก');
  assert.equal(validateNewPin('48a137', '48a137'), 'PIN ต้องเป็นตัวเลข 6 หลัก');
  assert.equal(validateNewPin('111111', '111111'), 'PIN ง่ายเกินไป — ห้ามใช้เลขเดียวกันทั้งหมด');
  assert.equal(validateNewPin('123456', '123456'), 'PIN ง่ายเกินไป — ห้ามใช้เลขเรียงกัน');
  assert.equal(validateNewPin('654321', '654321'), 'PIN ง่ายเกินไป — ห้ามใช้เลขเรียงกัน');
  assert.equal(validateNewPin('482137', '482173'), 'PIN ใหม่ทั้งสองช่องไม่ตรงกัน');
  assert.equal(validateNewPin('482137', '482137'), null);
});

test('อุปกรณ์ — แฮช PIN ผูกกับหัวหน้าทัวร์ และไม่ใช่ PIN ตรง ๆ', () => {
  const h = hashPin('TL-000001', '482137');
  assert.match(h, /^[0-9a-f]{8}$/);
  assert.notEqual(h, '482137');
  assert.equal(h, hashPin('TL-000001', '482137'));
  assert.notEqual(h, hashPin('TL-000002', '482137'));
  assert.notEqual(h, hashPin('TL-000001', '482138'));
});

test('อุปกรณ์ — ป้ายล็อกอัตโนมัติ', () => {
  assert.equal(autoLockLabel(0), 'ทันที');
  assert.equal(autoLockLabel(5), '5 นาที');
  assert.equal(autoLockLabel(45), '45 นาที');
});
