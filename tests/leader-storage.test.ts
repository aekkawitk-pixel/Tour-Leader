/**
 * เทสต์การคงอยู่ของข้อมูลหัวหน้าทัวร์ (regression: กดบันทึกแล้วรีเฟรชหน้าแล้วข้อมูลหาย)
 *
 * ครอบคลุม:
 *   • บันทึกแล้วอ่านกลับได้ (จำลอง refresh = อ่านใหม่จาก storage)
 *   • upsert ตาม id → กดบันทึกซ้ำหลายครั้งไม่เกิดรายการซ้ำ
 *   • merge ส่วนต่างทับข้อมูลนำเข้า — รายการนำเข้าไม่หาย ไม่ซ้ำ
 *   • เขียนไม่สำเร็จ (โควตาเต็ม) ต้อง throw ไม่ใช่กลืนเงียบ ๆ
 *   • รหัสหัวหน้าทัวร์ใหม่ต้องไม่ซ้ำ แม้บันทึกหลายรอบ/หลังรีเฟรช
 *
 * รันด้วย: npm test
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { StorageWriteError } from '@/services/browserStorage';
import {
  LEADER_STORAGE_KEY,
  loadLeaderRecords,
  mergeLeaderRecords,
  removeLeaderRecord,
  upsertLeaderRecord,
} from '@/services/leader-storage';
import { createLeaderCodeAllocator } from '@/modules/tour-leaders/utils';
import type { TourLeader } from '@/types';

const leader = (over: Partial<TourLeader>): TourLeader =>
  ({
    id: 'TL-0001',
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    nickname: '',
    active: true,
    status: 'available',
    leaderType: 'general',
    contacts: [],
    languages: [],
    assignedCountries: [],
    routeSkills: [],
    tourSkills: [],
    employmentHistory: [],
    documents: [],
    auditLog: [],
    address: { houseNo: '', countryId: 'C-TH' },
    updatedAt: '2026-07-13',
    ...over,
  }) as unknown as TourLeader;

/* ------------------ localStorage จำลอง (เทสต์รันนอกเบราว์เซอร์) ------------------ */

interface FakeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** `quotaAfter` = ยอมให้เขียนได้กี่ครั้ง ก่อนจะโยน QuotaExceededError */
function fakeStorage(quotaAfter = Infinity): FakeStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  let writes = 0;
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      writes += 1;
      if (writes > quotaAfter) {
        const err = new Error('exceeded the quota');
        err.name = 'QuotaExceededError';
        throw err;
      }
      data.set(key, value);
    },
    removeItem: (key) => { data.delete(key); },
  };
}

const globalWithWindow = globalThis as { window?: { localStorage: FakeStorage } };

function installStorage(storage: FakeStorage) {
  globalWithWindow.window = { localStorage: storage };
}

beforeEach(() => { installStorage(fakeStorage()); });
afterEach(() => { delete globalWithWindow.window; });

/* ----------------------------- คงอยู่หลังรีเฟรช ----------------------------- */

describe('leader-storage — ข้อมูลต้องไม่หายหลังรีเฟรช', () => {
  test('บันทึกแล้วอ่านกลับได้ (อ่านใหม่ = จำลองการรีเฟรชหน้า)', () => {
    upsertLeaderRecord(leader({ id: 'TL-0353', firstName: 'ใหม่' }));
    const afterRefresh = loadLeaderRecords();
    assert.equal(afterRefresh.length, 1);
    assert.equal(afterRefresh[0].id, 'TL-0353');
    assert.equal(afterRefresh[0].firstName, 'ใหม่');
  });

  test('แก้ไขซ้ำหลายครั้งด้วย id เดิม → มีรายการเดียว ไม่เกิดข้อมูลซ้ำ', () => {
    upsertLeaderRecord(leader({ id: 'TL-0353', firstName: 'รอบ1' }));
    upsertLeaderRecord(leader({ id: 'TL-0353', firstName: 'รอบ2' }));
    upsertLeaderRecord(leader({ id: 'TL-0353', firstName: 'รอบ3' }));
    const rows = loadLeaderRecords();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].firstName, 'รอบ3');
  });

  test('เพิ่มหลายคน → รายการใหม่สุดขึ้นก่อน และไม่ทับกัน', () => {
    upsertLeaderRecord(leader({ id: 'TL-0353', firstName: 'คนแรก' }));
    upsertLeaderRecord(leader({ id: 'TL-0354', firstName: 'คนที่สอง' }));
    assert.deepEqual(loadLeaderRecords().map((l) => l.id), ['TL-0354', 'TL-0353']);
  });

  test('แก้ไขรายการเดิมไม่ย้ายลำดับของรายการที่เพิ่มใหม่', () => {
    upsertLeaderRecord(leader({ id: 'TL-0353' }));
    upsertLeaderRecord(leader({ id: 'TL-0354' }));
    upsertLeaderRecord(leader({ id: 'TL-0353', firstName: 'แก้แล้ว' }));
    assert.deepEqual(loadLeaderRecords().map((l) => l.id), ['TL-0354', 'TL-0353']);
  });

  test('ลบส่วนต่างแล้วกลับไปใช้ข้อมูลนำเข้า', () => {
    upsertLeaderRecord(leader({ id: 'TL-0353' }));
    assert.equal(removeLeaderRecord('TL-0353').length, 0);
    assert.equal(loadLeaderRecords().length, 0);
  });

  test('ข้อมูลใน storage เสีย → ไม่พัง และไม่คืนค่าขยะ', () => {
    const store = fakeStorage();
    store.setItem(LEADER_STORAGE_KEY, '{ ไม่ใช่ JSON');
    installStorage(store);
    assert.deepEqual(loadLeaderRecords(), []);
  });

  test('ข้อมูลใน storage เป็นรายการที่ไม่มี id → ถูกกรองทิ้ง', () => {
    const store = fakeStorage();
    store.setItem(LEADER_STORAGE_KEY, JSON.stringify([{ firstName: 'ไม่มี id' }, leader({ id: 'TL-0353' })]));
    installStorage(store);
    assert.deepEqual(loadLeaderRecords().map((l) => l.id), ['TL-0353']);
  });
});

/* -------------------- รวมส่วนต่างกับข้อมูลนำเข้า (แหล่งเดียว) -------------------- */

describe('mergeLeaderRecords', () => {
  const base = [
    leader({ id: 'TL-000001', firstName: 'นำเข้า1' }),
    leader({ id: 'TL-000002', firstName: 'นำเข้า2' }),
  ];

  test('ไม่มีส่วนต่าง → คืนข้อมูลนำเข้าเดิมทั้งหมด', () => {
    assert.deepEqual(mergeLeaderRecords(base, []).map((l) => l.id), ['TL-000001', 'TL-000002']);
  });

  test('แก้ไขรายการนำเข้า → ทาบค่าใหม่ทับที่ตำแหน่งเดิม จำนวนไม่เปลี่ยน', () => {
    const merged = mergeLeaderRecords(base, [leader({ id: 'TL-000002', firstName: 'แก้แล้ว' })]);
    assert.equal(merged.length, 2);
    assert.deepEqual(merged.map((l) => l.id), ['TL-000001', 'TL-000002']);
    assert.equal(merged[1].firstName, 'แก้แล้ว');
  });

  test('รายการที่เพิ่มใหม่ขึ้นก่อนข้อมูลนำเข้า และไม่ทำให้รายการนำเข้าหาย', () => {
    const merged = mergeLeaderRecords(base, [leader({ id: 'TL-0353', firstName: 'เพิ่มเอง' })]);
    assert.deepEqual(merged.map((l) => l.id), ['TL-0353', 'TL-000001', 'TL-000002']);
  });

  test('ผลลัพธ์ไม่มี id ซ้ำ แม้ส่วนต่างมีทั้งรายการใหม่และรายการที่แก้', () => {
    const merged = mergeLeaderRecords(base, [
      leader({ id: 'TL-0353' }),
      leader({ id: 'TL-000001', firstName: 'แก้' }),
    ]);
    const ids = merged.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(merged.length, 3);
  });
});

/* --------------------------- บันทึกไม่สำเร็จต้องรู้ตัว --------------------------- */

describe('เขียนไม่สำเร็จต้อง throw (ห้ามแจ้งว่าบันทึกสำเร็จทั้งที่ไม่ได้บันทึก)', () => {
  test('โควตาเต็ม → โยน StorageWriteError พร้อมสาเหตุจริง', () => {
    installStorage(fakeStorage(0));
    assert.throws(
      () => upsertLeaderRecord(leader({ id: 'TL-0353' })),
      (err: unknown) =>
        err instanceof StorageWriteError && /พื้นที่จัดเก็บ.*เต็ม/.test((err as Error).message),
    );
  });

  test('localStorage ใช้ไม่ได้ → โยน StorageWriteError', () => {
    globalWithWindow.window = {} as { localStorage: FakeStorage };
    assert.throws(() => upsertLeaderRecord(leader({ id: 'TL-0353' })), StorageWriteError);
  });
});

/* ------------------------------ รหัสใหม่ห้ามซ้ำ ------------------------------ */

describe('รหัสหัวหน้าทัวร์ใหม่ต้องไม่ซ้ำ', () => {
  test('add() เพิ่มรหัสที่มีอยู่จริงโดยไม่ล้างรหัสที่จองไว้แล้ว', () => {
    const alloc = createLeaderCodeAllocator(['TL-000001', 'TL-000352']);
    const first = alloc.allocate(); // จองไว้ แต่ยังไม่ถูกบันทึกลง storage
    assert.equal(first, 'TL-0353');

    // ซิงก์รหัสที่มีอยู่จริง (ยังไม่มี TL-0353) — ต้องไม่ทำให้รหัสที่จองไว้หลุด
    alloc.add(['TL-000001', 'TL-000352']);
    assert.ok(alloc.has('TL-0353'), 'รหัสที่จองไว้ต้องยังอยู่หลัง add()');
    assert.equal(alloc.allocate(), 'TL-0354');
  });

  test('หลังรีเฟรช: ตั้งต้นจากรหัสที่บันทึกไว้ → ไม่ออกรหัสเดิมซ้ำ', () => {
    const imported = ['TL-000001', 'TL-000352'];
    const alloc1 = createLeaderCodeAllocator(imported);
    const code1 = alloc1.allocate();
    upsertLeaderRecord(leader({ id: code1 }));

    // จำลองรีเฟรช: ตัวจ่ายรหัสตัวใหม่ ตั้งต้นจาก "นำเข้า + ที่บันทึกไว้"
    const universe = mergeLeaderRecords(
      imported.map((id) => leader({ id })),
      loadLeaderRecords(),
    ).map((l) => l.id);
    const alloc2 = createLeaderCodeAllocator(universe);
    const code2 = alloc2.allocate();

    assert.notEqual(code2, code1, 'หลังรีเฟรชต้องไม่ออกรหัสเดิมซ้ำ');
    assert.equal(code2, 'TL-0354');
  });
});
