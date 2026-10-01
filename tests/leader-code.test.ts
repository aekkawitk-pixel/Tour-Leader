/**
 * เทสต์การสร้างรหัสหัวหน้าทัวร์อัตโนมัติ (TL-0001, TL-0002, …)
 *   - รูปแบบและการเพิ่มลำดับจากรหัสล่าสุด
 *   - ตัวจ่ายรหัส (allocator) ที่กันรหัสซ้ำเมื่อบันทึกพร้อมกัน
 *   - repository ออกรหัสจริงที่ฝั่ง service ไม่พึ่งค่าจากหน้าจอ
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  createLeaderCodeAllocator,
  formatLeaderCode,
  generateLeaderCode,
  nextLeaderCodeFromCodes,
  parseLeaderCodeNumber,
} from '@/modules/tour-leaders/utils';
import { LEADER_CODE_PATTERN } from '@/modules/tour-leaders/constants';
import { tourLeaderRepository } from '@/modules/tour-leaders/repository';
import { emptyLeaderForm, type LeaderFormState } from '@/modules/tour-leaders/mappers';
import type { TourLeader } from '@/types';

const TODAY = '2026-07-14';
const BUILD = { routes: [], actor: 'tester', now: '2026-07-14T10:00:00Z', today: TODAY };

/* -------------------------------- รูปแบบรหัส -------------------------------- */

describe('รูปแบบรหัสหัวหน้าทัวร์', () => {
  test('เติมศูนย์ให้ครบ 4 หลัก', () => {
    assert.equal(formatLeaderCode(1), 'TL-0001');
    assert.equal(formatLeaderCode(2), 'TL-0002');
    assert.equal(formatLeaderCode(13), 'TL-0013');
  });

  test('ลำดับเกิน 4 หลักไม่ถูกตัดทอน', () => {
    assert.equal(formatLeaderCode(12345), 'TL-12345');
  });

  test('รหัสที่สร้างต้องผ่าน LEADER_CODE_PATTERN', () => {
    assert.match(formatLeaderCode(1), LEADER_CODE_PATTERN);
    assert.match(formatLeaderCode(9999), LEADER_CODE_PATTERN);
    // ข้อมูลเดิม 3 หลักยังใช้ได้
    assert.match('TL-001', LEADER_CODE_PATTERN);
    // รูปแบบผิดต้องไม่ผ่าน
    assert.doesNotMatch('TL-12', LEADER_CODE_PATTERN);
    assert.doesNotMatch('XX-0001', LEADER_CODE_PATTERN);
  });

  test('อ่านลำดับตัวเลขจากรหัส (case-insensitive) และปฏิเสธรูปแบบผิด', () => {
    assert.equal(parseLeaderCodeNumber('TL-0012'), 12);
    assert.equal(parseLeaderCodeNumber('TL-001'), 1);
    assert.equal(parseLeaderCodeNumber('tl-5'), 5);
    assert.equal(parseLeaderCodeNumber('  TL-0009  '), 9);
    assert.equal(parseLeaderCodeNumber('TL-'), null);
    assert.equal(parseLeaderCodeNumber('TL-01a'), null);
    assert.equal(parseLeaderCodeNumber('JOB-0001'), null);
  });
});

/* ---------------------------- เพิ่มลำดับจากรหัสล่าสุด ---------------------------- */

describe('หารหัสถัดไปจากชุดรหัสที่มีอยู่', () => {
  test('ยังไม่มีรหัสใด → เริ่มที่ TL-0001', () => {
    assert.equal(nextLeaderCodeFromCodes([]), 'TL-0001');
  });

  test('เพิ่มจากค่าสูงสุดขึ้น 1 (ไม่ใช่จำนวนรายการ)', () => {
    assert.equal(nextLeaderCodeFromCodes(['TL-001', 'TL-012', 'TL-007']), 'TL-0013');
  });

  test('ข้ามรหัสที่รูปแบบไม่ตรง', () => {
    assert.equal(nextLeaderCodeFromCodes(['TL-005', 'ขยะ', '', 'JOB-2026-001']), 'TL-0006');
  });

  test('generateLeaderCode เพิ่มจากรายการหัวหน้าทัวร์ที่มีอยู่', () => {
    const existing = [{ id: 'TL-011' }, { id: 'TL-012' }] as TourLeader[];
    assert.equal(generateLeaderCode(existing), 'TL-0013');
    assert.equal(generateLeaderCode([]), 'TL-0001');
  });
});

/* ------------------------ ตัวจ่ายรหัส (กันรหัสซ้ำ) ------------------------ */

describe('ตัวจ่ายรหัสหัวหน้าทัวร์ (allocator)', () => {
  test('ออกรหัสเรียงลำดับจากรหัสตั้งต้น', () => {
    const alloc = createLeaderCodeAllocator(['TL-012']);
    assert.equal(alloc.allocate(), 'TL-0013');
    assert.equal(alloc.allocate(), 'TL-0014');
    assert.equal(alloc.allocate(), 'TL-0015');
  });

  test('ตัวจ่ายเปล่าเริ่มที่ TL-0001', () => {
    const alloc = createLeaderCodeAllocator();
    assert.equal(alloc.allocate(), 'TL-0001');
    assert.equal(alloc.allocate(), 'TL-0002');
  });

  test('รหัสที่ออกไปแล้วถูกจองไว้ (has = true, ไม่แบ่งตัวพิมพ์)', () => {
    const alloc = createLeaderCodeAllocator(['TL-001']);
    assert.equal(alloc.has('TL-001'), true);
    assert.equal(alloc.has('tl-001'), true);
    assert.equal(alloc.has('TL-0099'), false);
    const code = alloc.allocate();
    assert.equal(alloc.has(code), true);
    assert.equal(alloc.has(code.toLowerCase()), true);
  });

  test('บันทึกพร้อมกัน (จองก่อน await) → ไม่มีรหัสซ้ำเลย', () => {
    // จำลองหลายคำขอที่ "จอง" รหัสติด ๆ กันแบบ synchronous เหมือนตอนบันทึกพร้อมกัน
    const alloc = createLeaderCodeAllocator(['TL-012']);
    const codes = Array.from({ length: 50 }, () => alloc.allocate());
    assert.equal(new Set(codes).size, 50, 'ทุกรหัสต้องไม่ซ้ำกัน');
    assert.equal(codes[0], 'TL-0013');
    assert.equal(codes[49], 'TL-0062');
  });

  test('reset → ล้างและตั้งชุดรหัสตั้งต้นใหม่', () => {
    const alloc = createLeaderCodeAllocator(['TL-020']);
    assert.equal(alloc.allocate(), 'TL-0021');
    alloc.reset(['TL-005']);
    assert.equal(alloc.has('TL-020'), false);
    assert.equal(alloc.allocate(), 'TL-0006');
  });
});

/* --------------------- repository: ออกรหัสจริงฝั่งเซิร์ฟเวอร์ --------------------- */

describe('repository.save — สร้างรหัสฝั่งเซิร์ฟเวอร์', () => {
  const newForm = (screenId: string): LeaderFormState => ({
    ...emptyLeaderForm(screenId, TODAY),
    firstName: 'สมชาย',
    lastName: 'ทดสอบ',
  });

  test('รายการใหม่ได้รหัสจากเซิร์ฟเวอร์ ไม่ใช่ค่าที่ค้างบนหน้าจอ', async () => {
    const result = await tourLeaderRepository.save({
      ...BUILD,
      form: newForm('TL-900'), // ค่าหลอกจากหน้าจอ ต้องไม่ถูกนำไปใช้
      countries: [],
    });
    assert.equal(result.isNew, true);
    assert.notEqual(result.leader.id, 'TL-900');
    assert.match(result.leader.id, /^TL-\d{4}$/);
  });

  test('บันทึกพร้อมกันหลายรายการ → รหัสไม่ซ้ำกัน', async () => {
    const results = await Promise.all([
      tourLeaderRepository.save({ ...BUILD, form: newForm('TL-900'), countries: [] }),
      tourLeaderRepository.save({ ...BUILD, form: newForm('TL-900'), countries: [] }),
      tourLeaderRepository.save({ ...BUILD, form: newForm('TL-900'), countries: [] }),
    ]);
    const ids = results.map((r) => r.leader.id);
    assert.equal(new Set(ids).size, ids.length, 'ทุกรหัสต้องไม่ซ้ำกัน');
    ids.forEach((id) => assert.match(id, /^TL-\d{4}$/));
  });

  test('แก้ไขรายการเดิม → คงรหัสเดิม ไม่ออกรหัสใหม่', async () => {
    const created = await tourLeaderRepository.save({
      ...BUILD,
      form: newForm('TL-900'),
      countries: [],
    });
    const existing = created.leader;

    const edited = await tourLeaderRepository.save({
      ...BUILD,
      form: { ...newForm(existing.id), id: existing.id, firstName: 'สมหญิง' },
      existing,
      countries: [],
    });
    assert.equal(edited.isNew, false);
    assert.equal(edited.leader.id, existing.id);
    assert.equal(edited.leader.firstName, 'สมหญิง');
  });
});
