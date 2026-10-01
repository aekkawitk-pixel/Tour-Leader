/**
 * ประเภทบุคคล (personType) — ค่าเริ่มต้นและการคงค่าเดิม
 *
 * หลักการ: ใช้ค่าเริ่มต้น "บุคคลสัญชาติไทย" เฉพาะตอนสร้างใหม่ หรือเมื่อข้อมูลเดิมไม่เคยระบุ
 * ห้ามเขียนทับค่าที่บันทึกไว้แล้ว และห้ามบันทึกเป็นค่าว่าง
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyLeaderForm, leaderToForm, formToLeader } from '@/modules/tour-leaders/mappers';
import { DEFAULT_PERSON_TYPE } from '@/modules/tour-leaders/constants';
import { TOUR_LEADER_PROFILES } from '@/data/leaders/tourLeaderMaster.seed';
import { profileToTourLeader } from '@/data/leaders/adapter';
import type { TourLeader } from '@/types';

const TODAY = '2026-07-13';
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const base = profileToTourLeader(TOUR_LEADER_PROFILES[0]);
const ctx = { countries: [], routes: [], today: TODAY, actor: 'ผู้ทดสอบ' };

describe('ค่าเริ่มต้นเมื่อสร้างใหม่', () => {
  test('AC1 ฟอร์มใหม่ต้องเป็น "บุคคลสัญชาติไทย"', () => {
    assert.equal(DEFAULT_PERSON_TYPE, 'thai');
    assert.equal(emptyLeaderForm('TL-000999', TODAY).personType, 'thai');
  });

  test('AC5 บันทึกฟอร์มใหม่แล้วต้องไม่เป็นค่าว่าง', () => {
    const saved = formToLeader(emptyLeaderForm('TL-000999', TODAY), ctx as never);
    assert.equal(saved.personType, 'thai');
  });
});

describe('เปิดแก้ไขข้อมูลเดิม', () => {
  test('AC3 ค่าที่บันทึกไว้ว่า "บุคคลต่างชาติ" ต้องไม่ถูกเปลี่ยนกลับ', () => {
    const leader: TourLeader = { ...base, personType: 'foreigner' };
    assert.equal(leaderToForm(leader).personType, 'foreigner');
  });

  test('AC3 ค่าที่บันทึกไว้ว่า "บุคคลสัญชาติไทย" ต้องคงเดิม', () => {
    const leader: TourLeader = { ...base, personType: 'thai' };
    assert.equal(leaderToForm(leader).personType, 'thai');
  });

  test('เปิดแก้ไขซ้ำหลายครั้งค่าต้องไม่เพี้ยน', () => {
    const leader: TourLeader = { ...base, personType: 'foreigner' };
    for (let i = 0; i < 3; i++) assert.equal(leaderToForm(leader).personType, 'foreigner');
  });

  test('ข้อมูลเก่าที่ไม่เคยระบุ → ใช้ค่าเริ่มต้น (ไม่ปล่อยว่าง)', () => {
    const leader = { ...base, personType: undefined } as TourLeader;
    assert.equal(leaderToForm(leader).personType, 'thai');
  });
});

describe('การบันทึก', () => {
  test('AC5 บันทึกค่าที่เลือกไว้จริงเสมอ ไม่ทับด้วยค่าเริ่มต้น', () => {
    const form = { ...emptyLeaderForm('TL-000999', TODAY), personType: 'foreigner' as const };
    assert.equal(formToLeader(form, ctx as never).personType, 'foreigner');
  });

  test('AC5 ฟอร์มไม่มีค่า → บันทึกเป็นค่าเริ่มต้น ไม่ใช่ null/undefined', () => {
    const form = { ...emptyLeaderForm('TL-000999', TODAY), personType: undefined };
    const saved = formToLeader(form, ctx as never);
    assert.equal(saved.personType, 'thai');
    assert.notEqual(saved.personType, undefined);
  });

  test('ไป-กลับ record → form → record แล้วค่าไม่เปลี่ยน', () => {
    for (const pt of ['thai', 'foreigner'] as const) {
      const leader: TourLeader = { ...base, personType: pt };
      assert.equal(formToLeader(leaderToForm(leader), ctx as never).personType, pt);
    }
  });
});

describe('UI — ต้องไม่มีทางเลือกค่าว่าง', () => {
  const FILES = [
    '../src/components/leaders/GeneralInfoStep.tsx',
    '../src/components/leaders/LeaderSectionEditModal.tsx',
  ];

  test('AC5 dropdown ประเภทบุคคลไม่มี placeholder ให้เลือกเป็นค่าว่าง', () => {
    for (const f of FILES) {
      const src = read(f);
      const block = src.match(/label="ประเภทบุคคล"[\s\S]{0,600}?\/>/)?.[0] ?? '';
      assert.ok(block, `${f}: ต้องหา dropdown เจอ`);
      assert.equal(block.includes('placeholder='), false, `${f}: ต้องไม่มี placeholder`);
      assert.equal(block.includes('|| undefined'), false, `${f}: ต้องไม่แปลงค่าว่างเป็น undefined`);
      assert.ok(block.includes('DEFAULT_PERSON_TYPE'), `${f}: ต้อง fallback เป็นค่าเริ่มต้น`);
    }
  });

  test('ข้อ5 เปลี่ยนประเภทต้องถามยืนยันก่อนล้างข้อมูลเดิม', () => {
    const src = read('../src/components/leaders/GeneralInfoStep.tsx');
    assert.ok(src.includes('requestPersonTypeChange'), 'ต้องผ่านตัวขอเปลี่ยนที่มีการยืนยัน');
    assert.ok(src.includes('hasDataOfCurrentType()'), 'ต้องตรวจว่ามีข้อมูลเดิมก่อนล้าง');
    assert.ok(src.includes('setPendingPersonType'), 'ต้องพักไว้รอผู้ใช้ยืนยัน ไม่ล้างทันที');
  });
});
