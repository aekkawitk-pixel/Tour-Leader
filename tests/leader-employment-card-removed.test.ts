/**
 * Card “รายละเอียดการร่วมงาน (หัวหน้าทัวร์ประจำ)” ถูกนำออกจากหน้าจอ
 *
 * ครอบคลุมข้อกำหนดที่เสี่ยงพังเงียบ ๆ หลังเอาช่องกรอกออก:
 *   • บันทึกได้โดยไม่ต้องกรอก รหัสพนักงาน / วันที่เริ่มรูปแบบนี้ / สถานะการร่วมงาน
 *   • ข้อมูลเดิมของคนที่เคยกรอกไว้ต้องไม่หาย เมื่อเปิดแก้ไขแล้วกดบันทึก
 *   • รหัสหัวหน้าทัวร์และรูปแบบการร่วมงานไม่เปลี่ยน
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyLeaderForm,
  formToLeader,
  leaderToForm,
  type LeaderFormState,
} from '@/modules/tour-leaders/mappers';
import { validateLeaderForm } from '@/modules/tour-leaders/validation';
import type { ContactChannel, LanguageSkill } from '@/types';

const TODAY = '2026-07-14';
const BUILD = { routes: [], actor: 'tester', now: '2026-07-14T10:00:00Z', today: TODAY };
const VCTX = { existingLeaders: [], isNew: true, today: TODAY };

const phone = (): ContactChannel => ({
  id: 'CC-1',
  type: 'phone',
  value: '081-234-5678',
  isPrimary: true,
});

/** ภาษา 1 รายการ — เป็นข้อบังคับเดิมของฟอร์ม ไม่เกี่ยวกับ Card ที่ถูกนำออก */
const thaiLanguage = (): LanguageSkill => ({
  id: 'L-1',
  languageCode: 'TH',
  languageName: 'ไทย',
  isNativeLanguage: true,
  standard: 'GENERAL',
  levelCode: null,
  levelName: null,
  levelRank: null,
});

/** หัวหน้าทัวร์ประจำที่กรอกครบตามที่ยังเหลือบนหน้าจอ — ไม่กรอก 4 ช่องที่ถูกนำออก */
const regularForm = (): LeaderFormState => ({
  ...emptyLeaderForm('TL-900', TODAY),
  personType: 'thai',
  leaderType: 'regular',
  firstName: 'ชัยมงคล',
  lastName: 'ตติยวงศ์วิวัฒน์',
  nickname: 'ออดโต้',
  birthDate: '1990-01-01',
  nationalIdNumber: '1234567890123',
  nationalIdExpiresAt: '2030-01-01',
  address: {
    houseNo: '99/1',
    province: 'กรุงเทพมหานคร',
    provinceCode: '10',
    postalCode: '10230',
    countryId: 'C-TH',
  },
  idCardSameAsCurrent: true,
  contacts: [phone()],
  languages: [thaiLanguage()],
  // 4 ช่องที่ถูกนำออกจากหน้าจอ — ผู้ใช้กรอกไม่ได้อีกแล้ว
  employeeCode: '',
  team: '',
  workStatus: undefined,
});

describe('นำ Card รายละเอียดการร่วมงาน (หัวหน้าทัวร์ประจำ) ออกจากหน้าจอ', () => {
  test('บันทึกหัวหน้าทัวร์ประจำได้โดยไม่ต้องกรอกรหัสพนักงาน/วันที่เริ่มรูปแบบนี้/สถานะการร่วมงาน', () => {
    const result = validateLeaderForm(regularForm(), VCTX);
    assert.equal(result.errors.length, 0, `ยังมี error: ${JSON.stringify(result.errors)}`);
  });

  test('ไม่มี validation ที่อ้างถึง 4 ฟิลด์ที่ถูกนำออก', () => {
    const removed = ['employeeCode', 'team', 'workStatus', 'typeStartDate'];
    const result = validateLeaderForm(regularForm(), VCTX);
    for (const field of removed) {
      assert.ok(
        !result.errors.some((e) => e.field === field),
        `ห้ามบังคับกรอก "${field}" — ไม่มีช่องกรอกบนหน้าจอแล้ว`,
      );
    }
  });

  test('เพิ่มใหม่แล้วรหัสหัวหน้าทัวร์และรูปแบบการร่วมงานถูกต้อง', () => {
    const record = formToLeader(regularForm(), BUILD);
    assert.equal(record.id, 'TL-900');
    assert.equal(record.leaderType, 'regular');
  });

  test('ข้อมูลเดิม (รหัสพนักงาน/หน่วยงาน/สถานะการร่วมงาน) ไม่หายเมื่อเปิดแก้ไขแล้วบันทึก', () => {
    // คนที่ถูกสร้างไว้ก่อนหน้านี้ — มีข้อมูลครบใน 4 ฟิลด์ที่เพิ่งถูกซ่อน
    const legacy = {
      ...formToLeader(regularForm(), BUILD),
      employeeCode: 'EMP-0125',
      team: 'ทีมยุโรป',
      workStatus: 'active' as const,
      typeStartDate: '2024-03-01',
    };

    // เปิดหน้าแก้ไข (leaderToForm) แล้วกดบันทึกโดยไม่แตะอะไร (formToLeader)
    const saved = formToLeader(leaderToForm(legacy), { ...BUILD, existing: legacy });

    assert.equal(saved.employeeCode, 'EMP-0125', 'รหัสพนักงานเดิมต้องไม่หาย');
    assert.equal(saved.team, 'ทีมยุโรป', 'หน่วยงาน/ทีมเดิมต้องไม่หาย');
    assert.equal(saved.workStatus, 'active', 'สถานะการร่วมงานเดิมต้องไม่หาย');
    assert.equal(saved.typeStartDate, '2024-03-01', 'วันที่เริ่มรูปแบบนี้เดิมต้องไม่หาย');
    assert.equal(saved.id, legacy.id, 'ห้ามเปลี่ยนรหัสหัวหน้าทัวร์');
    assert.equal(saved.leaderType, 'regular');
  });

  test('ข้อมูลเก่าที่ไม่มี 4 ฟิลด์นี้เลย ก็เปิดและบันทึกได้ตามปกติ', () => {
    const legacy = formToLeader(regularForm(), BUILD);
    const raw = legacy as unknown as Record<string, unknown>;
    delete raw.employeeCode;
    delete raw.team;
    delete raw.workStatus;

    const form = leaderToForm(legacy);
    assert.equal(validateLeaderForm(form, { ...VCTX, isNew: false }).errors.length, 0);

    const saved = formToLeader(form, { ...BUILD, existing: legacy });
    assert.equal(saved.id, legacy.id);
    assert.equal(saved.leaderType, 'regular');
  });
});
