/**
 * ทักษะและความถนัด — กันบั๊ก "เลือกแล้วกดบันทึก แต่ข้อมูลหาย"
 *
 * ต้นเหตุเดิม: รายการที่เลือกไว้ในช่องแต่ยังไม่กดปุ่ม "เพิ่ม" ค้างอยู่ใน state ของ
 * SkillSection เท่านั้น ตอนกดบันทึกจึงถูกทิ้งเงียบ ๆ ทั้งที่ระบบขึ้นว่าบันทึกสำเร็จ
 * แก้โดยแยกตรรกะการเพิ่มออกมาเป็น appendSkillFromMaster() แล้วให้ทั้งปุ่ม "เพิ่ม"
 * และตอนกดบันทึกเรียกใช้ตัวเดียวกัน
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { appendSkillFromMaster } from '@/components/leaders/TourSkillEditor';
import type { MasterItem, TourTypeSkill } from '@/types';

const OPTIONS: MasterItem[] = [
  { id: 'M-021', code: 'SKILL_SALES', name: 'ทำยอดขายเก่ง', order: 1, active: true },
  { id: 'M-022', code: 'SKILL_VIP', name: 'ดูแลลูกค้า VIP', order: 2, active: true },
];

const skill = (masterId: string, name: string): TourTypeSkill => ({
  id: `TS-${masterId}`,
  masterId,
  category: 'work_skill',
  code: 'X',
  name,
  level: 'good',
});

describe('เพิ่มทักษะและความถนัด', () => {
  test('เลือกรายการที่ยังไม่มี → เพิ่มได้ และผูก category/master ถูกต้อง', () => {
    const result = appendSkillFromMaster([], 'M-021', OPTIONS, 'work_skill');
    assert.ok('next' in result, 'ต้องเพิ่มสำเร็จ');
    assert.equal(result.next.length, 1);
    assert.equal(result.next[0].masterId, 'M-021');
    assert.equal(result.next[0].name, 'ทำยอดขายเก่ง');
    assert.equal(result.next[0].category, 'work_skill');
    assert.equal(result.next[0].level, 'good');
  });

  test('ไม่ได้เลือกอะไร → แจ้ง error ไม่เพิ่มเงียบ ๆ', () => {
    const result = appendSkillFromMaster([], '', OPTIONS, 'work_skill');
    assert.ok('error' in result);
    assert.match(result.error, /กรุณาเลือก/);
  });

  test('เลือกรายการที่มีอยู่แล้ว → แจ้ง error ไม่เพิ่มซ้ำ', () => {
    const existing = [skill('M-021', 'ทำยอดขายเก่ง')];
    const result = appendSkillFromMaster(existing, 'M-021', OPTIONS, 'work_skill');
    assert.ok('error' in result);
    assert.match(result.error, /ถูกเพิ่มไว้แล้ว/);
  });

  test('เลือก id ที่ไม่มีใน Master → แจ้ง error', () => {
    const result = assertError(appendSkillFromMaster([], 'M-999', OPTIONS, 'work_skill'));
    assert.match(result, /ไม่พบรายการนี้/);
  });

  test('ไม่แตะรายการเดิม — คืนอาร์เรย์ใหม่ ต่อท้ายของเดิมครบ', () => {
    const existing = [skill('M-021', 'ทำยอดขายเก่ง')];
    const result = appendSkillFromMaster(existing, 'M-022', OPTIONS, 'work_skill');
    assert.ok('next' in result);
    assert.equal(result.next.length, 2);
    assert.equal(result.next[0], existing[0], 'รายการเดิมต้องเป็นตัวเดิม ไม่ถูกสร้างใหม่');
    assert.notEqual(result.next, existing, 'ต้องคืนอาร์เรย์ใหม่ (ไม่ mutate)');
    assert.equal(existing.length, 1, 'อาร์เรย์เดิมต้องไม่ถูกแก้');
  });

  test('ทักษะคนละหมวดที่ masterId เดียวกัน ไม่ถือว่าซ้ำ', () => {
    const existing = [{ ...skill('M-021', 'ทำยอดขายเก่ง'), category: 'customer_group' as const }];
    const result = appendSkillFromMaster(existing, 'M-021', OPTIONS, 'work_skill');
    assert.ok('next' in result, 'คนละหมวดต้องเพิ่มได้');
    assert.equal(result.next.length, 2);
  });

  test('id ของรายการใหม่ไม่ซ้ำกัน แม้เพิ่มติด ๆ กัน', () => {
    const a = appendSkillFromMaster([], 'M-021', OPTIONS, 'work_skill');
    const b = appendSkillFromMaster([], 'M-021', OPTIONS, 'work_skill');
    assert.ok('next' in a && 'next' in b);
    assert.notEqual(a.next[0].id, b.next[0].id);
  });
});

/** ช่วยให้ TypeScript แคบชนิดเป็นกรณี error */
function assertError(r: { next: TourTypeSkill[] } | { error: string }): string {
  assert.ok('error' in r, 'ต้องเป็นกรณี error');
  return r.error;
}
