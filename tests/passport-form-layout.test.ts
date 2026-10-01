/**
 * เทสต์ผังฟอร์มหนังสือเดินทาง (PASSPORT_FORM_GROUPS)
 *
 * ผังนี้ใช้ร่วมกันทั้งฟอร์ม "เพิ่มเล่ม" และ "แก้ไขเล่ม" — ถ้าผังตกช่องไหนไป
 * ช่องนั้นจะกรอกไม่ได้ทั้งสองหน้าจอพร้อมกัน เทสต์ชุดนี้จึงกันไว้
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PASSPORT_FIELD_ORDER,
  PASSPORT_FORM_GROUPS,
  PASSPORT_SENSITIVE_FIELDS,
  type PassportFieldKey,
} from '@/data/leaders/passportBookTypes';

describe('PASSPORT_FORM_GROUPS — ผังฟอร์มหนังสือเดินทาง', () => {
  const inLayout = PASSPORT_FORM_GROUPS.flatMap((g) => g.keys);

  test('ครอบคลุมทุกช่องของเล่ม — ไม่มีช่องไหนหายจากฟอร์ม', () => {
    const missing = PASSPORT_FIELD_ORDER.filter((k) => !inLayout.includes(k));
    assert.deepEqual(missing, [], 'ช่องเหล่านี้ไม่อยู่ในผังฟอร์ม จึงกรอกไม่ได้');
  });

  test('ไม่มีช่องที่ไม่มีอยู่จริงในเล่ม', () => {
    const unknown = inLayout.filter((k) => !PASSPORT_FIELD_ORDER.includes(k));
    assert.deepEqual(unknown, []);
  });

  test('ไม่มีช่องซ้ำข้ามกลุ่ม', () => {
    assert.equal(new Set(inLayout).size, inLayout.length);
  });

  test('ทุกกลุ่มมีชื่อและมีช่องอย่างน้อย 1 ช่อง', () => {
    for (const g of PASSPORT_FORM_GROUPS) {
      assert.ok(g.title.trim(), 'กลุ่มต้องมีชื่อ');
      assert.ok(g.keys.length > 0, `กลุ่ม "${g.title}" ไม่มีช่อง`);
      assert.ok([1, 2, 3].includes(g.cols), `กลุ่ม "${g.title}" ระบุจำนวนคอลัมน์ไม่ถูกต้อง`);
    }
  });

  test('MRZ อยู่กลุ่มท้ายสุดและกินเต็มความกว้าง (ข้อความยาวมาก)', () => {
    const last = PASSPORT_FORM_GROUPS[PASSPORT_FORM_GROUPS.length - 1];
    assert.deepEqual(last.keys, ['mrzLine1', 'mrzLine2']);
    assert.equal(last.cols, 1);
  });

  test('ช่องอ่อนไหวยังอยู่ในผัง (ต้องกรอก/ตรวจได้ แม้ถูกปิดบังตอนแสดง)', () => {
    for (const key of PASSPORT_SENSITIVE_FIELDS as PassportFieldKey[]) {
      assert.ok(inLayout.includes(key), `${key} หายจากผังฟอร์ม`);
    }
  });
});
