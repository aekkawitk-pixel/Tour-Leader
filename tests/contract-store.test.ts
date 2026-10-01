/**
 * เทสต์ Contract Store — สัญญาจ้างหัวหน้าทัวร์รายกรุ๊ป
 *
 * ครอบคลุมกติกาที่สำคัญที่สุด:
 *   • หนึ่งกรุ๊ป × หนึ่งหัวหน้าทัวร์ มีสัญญาที่ยังมีผลได้ไม่เกิน 1 ฉบับ
 *   • เปลี่ยนสถานะได้เฉพาะเส้นทางที่อนุญาต (ห้ามข้ามขั้น/ย้อนกลับ)
 *   • เซ็นแล้วต้องมี snapshot เสมอ และ snapshot ต้องไม่เปลี่ยนตามข้อมูลปัจจุบันภายหลัง
 *   • ยกเลิกต้องมีเหตุผล · ยกเลิกแล้วข้อมูลการเซ็นเดิมไม่ถูกล้าง
 *   • แก้เงื่อนไขได้เฉพาะก่อนเซ็น · ลบได้เฉพาะฉบับร่างที่ยังไม่เคยส่ง
 *
 * รันด้วย: npm test
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  attachContractFile,
  cancelContract,
  createContract,
  deleteContract,
  getActiveContract,
  getContract,
  getContracts,
  getContractsByLeader,
  getContractsByPeriod,
  sendContract,
  signContract,
  updateContractTerms,
  voidContract,
  type CreateContractInput,
} from '@/services/contractStore';
import {
  canTransitionContract,
  CONTRACT_TRANSITIONS,
  isContractActive,
  type ContractPartySnapshot,
  type ContractPeriodSnapshot,
  type ContractStatus,
  type LeaderContract,
} from '@/data/contracts/contractTypes';

/* ------------------ localStorage จำลอง (เทสต์รันนอกเบราว์เซอร์) ------------------ */

interface FakeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function fakeStorage(): FakeStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
  };
}

const globalWithWindow = globalThis as { window?: { localStorage: FakeStorage } };

beforeEach(() => { globalWithWindow.window = { localStorage: fakeStorage() }; });
afterEach(() => { delete globalWithWindow.window; });

/* --------------------------------- ตัวช่วย --------------------------------- */

const LEADER = 'TL-000001';
const OTHER_LEADER = 'TL-000002';
const PERIOD = 'PRD-CKG-260805A';
const OTHER_PERIOD = 'PRD-HKG-260901A';

const T0 = '2026-06-01T09:00:00.000Z';
const T1 = '2026-06-02T09:00:00.000Z';
const T2 = '2026-06-03T09:00:00.000Z';

const party: ContractPartySnapshot = {
  leaderNameTh: 'สมชาย ใจดี',
  leaderNameEn: 'SOMCHAI JAIDEE',
  passportDocId: 'PPBOOK-abc',
  passportNoMasked: 'xxxxx4567',
  passportExpiresAt: '2030-01-01',
};

const period: ContractPeriodSnapshot = {
  groupCode: 'CKG-260805A-HU',
  startDate: '2026-08-05',
  endDate: '2026-08-09',
  countryName: 'จีน',
  route: 'CKG',
};

function add(over: Partial<CreateContractInput> = {}): LeaderContract {
  const res = createContract({
    tourLeaderId: LEADER, periodId: PERIOD, fee: 12000, by: 'ผู้ทดสอบ', at: T0, ...over,
  });
  assert.equal(res.ok, true, 'สร้างสัญญาควรสำเร็จ');
  return (res as { ok: true; contract: LeaderContract }).contract;
}

/** เดินสถานะไปจนถึง SIGNED */
function signed(over: Partial<CreateContractInput> = {}): LeaderContract {
  const c = add(over);
  sendContract(c.contractId, { by: 'ผู้ทดสอบ', at: T1 });
  const res = signContract(c.contractId, { by: 'ผู้ทดสอบ', at: T2, partySnapshot: party, periodSnapshot: period });
  assert.equal(res.ok, true);
  return (res as { ok: true; contract: LeaderContract }).contract;
}

/* ------------------------------ ตารางสถานะ ------------------------------ */

describe('Contract — ตารางเส้นทางสถานะ', () => {
  test('สถานะปลายทางเปลี่ยนต่อไม่ได้อีก', () => {
    assert.deepEqual(CONTRACT_TRANSITIONS.CANCELLED, []);
    assert.deepEqual(CONTRACT_TRANSITIONS.VOID, []);
  });

  test('เซ็นแล้วย้อนกลับไปร่าง/ส่งใหม่ไม่ได้', () => {
    assert.equal(canTransitionContract('SIGNED', 'DRAFT'), false);
    assert.equal(canTransitionContract('SIGNED', 'SENT'), false);
    assert.equal(canTransitionContract('SIGNED', 'VOID'), true);
  });

  test('ร่างเซ็นได้เลยโดยไม่ต้องส่งก่อน (เซ็นหน้างาน)', () => {
    assert.equal(canTransitionContract('DRAFT', 'SIGNED'), true);
  });

  test('เฉพาะร่าง/รอเซ็น/เซ็นแล้ว ที่ถือว่ายังมีผล', () => {
    const active: ContractStatus[] = ['DRAFT', 'SENT', 'SIGNED'];
    for (const s of active) assert.equal(isContractActive(s), true, s);
    for (const s of ['CANCELLED', 'VOID'] as ContractStatus[]) assert.equal(isContractActive(s), false, s);
  });
});

/* --------------------------- หนึ่งกรุ๊ป หนึ่งสัญญา --------------------------- */

describe('Contract — สัญญาซ้อนกันในกรุ๊ปเดียวไม่ได้', () => {
  test('ทำสัญญาซ้ำกับคนเดิมในกรุ๊ปเดิม → ถูกปฏิเสธพร้อมเหตุผล', () => {
    add();
    const again = createContract({ tourLeaderId: LEADER, periodId: PERIOD, fee: 15000, by: 'x', at: T1 });

    assert.equal(again.ok, false);
    assert.match((again as { ok: false; error: string }).error, /ยกเลิกฉบับเดิมก่อน/);
    assert.equal(getContractsByPeriod(PERIOD).length, 1);
  });

  test('ยกเลิกฉบับเดิมแล้วทำฉบับใหม่ได้', () => {
    const first = add();
    cancelContract(first.contractId, { by: 'x', at: T1, reason: 'เปลี่ยนเงื่อนไข' });

    const second = createContract({ tourLeaderId: LEADER, periodId: PERIOD, fee: 15000, by: 'x', at: T2 });
    assert.equal(second.ok, true);
    assert.equal(getContractsByPeriod(PERIOD).length, 2, 'ฉบับเดิมต้องยังอยู่ในประวัติ');
    assert.equal(getActiveContract(LEADER, PERIOD)?.fee, 15000);
  });

  test('คนละคนในกรุ๊ปเดียวกัน ทำสัญญาพร้อมกันได้', () => {
    add();
    const other = createContract({ tourLeaderId: OTHER_LEADER, periodId: PERIOD, fee: 9000, by: 'x', at: T1 });
    assert.equal(other.ok, true);
    assert.equal(getContractsByPeriod(PERIOD).length, 2);
  });

  test('คนเดียวกันคนละกรุ๊ป ทำสัญญาพร้อมกันได้', () => {
    add();
    const other = createContract({ tourLeaderId: LEADER, periodId: OTHER_PERIOD, fee: 9000, by: 'x', at: T1 });
    assert.equal(other.ok, true);
    assert.equal(getContractsByLeader(LEADER).length, 2);
  });

  test('ค่าตอบแทนติดลบถูกปฏิเสธ', () => {
    const res = createContract({ tourLeaderId: LEADER, periodId: PERIOD, fee: -1, by: 'x', at: T0 });
    assert.equal(res.ok, false);
    assert.equal(getContracts().length, 0);
  });
});

/* -------------------------------- การเดินสถานะ ------------------------------- */

describe('Contract — การเดินสถานะ', () => {
  test('ส่งแล้วบันทึกเวลา/ผู้ส่ง และลงประวัติ', () => {
    const c = add();
    const res = sendContract(c.contractId, { by: 'ผู้ประสานงาน', at: T1 });

    assert.equal(res.ok, true);
    const sent = getContract(c.contractId)!;
    assert.equal(sent.status, 'SENT');
    assert.equal(sent.sentBy, 'ผู้ประสานงาน');
    assert.equal(sent.sentAt, T1);
    assert.ok(sent.history.some((h) => h.action === 'SEND' && h.from === 'DRAFT' && h.to === 'SENT'));
  });

  test('ส่งซ้ำสัญญาที่ส่งไปแล้ว → ถูกปฏิเสธ', () => {
    const c = add();
    sendContract(c.contractId, { by: 'x', at: T1 });
    assert.equal(sendContract(c.contractId, { by: 'x', at: T2 }).ok, false);
  });

  test('เซ็นแล้วบันทึกเวลา/ผู้เซ็น และเก็บ snapshot ทั้งสองชุด', () => {
    const c = signed();
    assert.equal(c.status, 'SIGNED');
    assert.equal(c.signedAt, T2);
    assert.deepEqual(c.partySnapshot, party);
    assert.deepEqual(c.periodSnapshot, period);
  });

  test('สัญญาที่ยกเลิกแล้ว เซ็นไม่ได้', () => {
    const c = add();
    cancelContract(c.contractId, { by: 'x', at: T1, reason: 'ยกเลิกกรุ๊ป' });

    const res = signContract(c.contractId, { by: 'x', at: T2, partySnapshot: party, periodSnapshot: period });
    assert.equal(res.ok, false);
    assert.equal(getContract(c.contractId)?.status, 'CANCELLED');
  });

  test('สัญญาที่ไม่มีอยู่ → คืนข้อผิดพลาด ไม่โยน error', () => {
    assert.equal(sendContract('CT-ไม่มีจริง', { by: 'x', at: T1 }).ok, false);
    assert.equal(cancelContract('CT-ไม่มีจริง', { by: 'x', at: T1, reason: 'ก' }).ok, false);
  });
});

/* --------------------------------- การยกเลิก -------------------------------- */

describe('Contract — การยกเลิก', () => {
  test('ยกเลิกโดยไม่ระบุเหตุผลไม่ได้', () => {
    const c = add();
    const res = cancelContract(c.contractId, { by: 'x', at: T1, reason: '   ' });

    assert.equal(res.ok, false);
    assert.equal(getContract(c.contractId)?.status, 'DRAFT', 'สถานะต้องไม่เปลี่ยนเมื่อถูกปฏิเสธ');
  });

  test('ยกเลิกก่อนเซ็น → เก็บเหตุผลและเวลาไว้', () => {
    const c = add();
    cancelContract(c.contractId, { by: 'ผู้ดูแล', at: T1, reason: 'ลูกค้ายกเลิกกรุ๊ป' });

    const after = getContract(c.contractId)!;
    assert.equal(after.status, 'CANCELLED');
    assert.equal(after.closeReason, 'ลูกค้ายกเลิกกรุ๊ป');
    assert.equal(after.closedBy, 'ผู้ดูแล');
  });

  test('สัญญาที่เซ็นแล้วใช้ cancel ไม่ได้ ต้องใช้ void', () => {
    const c = signed();
    assert.equal(cancelContract(c.contractId, { by: 'x', at: '2026-07-01T00:00:00.000Z', reason: 'ก' }).ok, false);

    const res = voidContract(c.contractId, { by: 'x', at: '2026-07-01T00:00:00.000Z', reason: 'ตกลงยกเลิกร่วมกัน' });
    assert.equal(res.ok, true);
    assert.equal(getContract(c.contractId)?.status, 'VOID');
  });

  test('ยกเลิกสัญญาที่เซ็นแล้ว — ข้อมูลการเซ็นและ snapshot ยังอยู่ครบ', () => {
    const c = signed();
    voidContract(c.contractId, { by: 'x', at: '2026-07-01T00:00:00.000Z', reason: 'ตกลงยกเลิกร่วมกัน' });

    const after = getContract(c.contractId)!;
    assert.equal(after.signedAt, T2, 'ต้องยังรู้ว่าเคยเซ็นเมื่อไร');
    assert.deepEqual(after.partySnapshot, party, 'snapshot ต้องไม่ถูกล้าง');
  });
});

/* ------------------------ snapshot ต้องไม่เปลี่ยนตามข้อมูลปัจจุบัน ------------------------ */

describe('Contract — snapshot ตรึงไว้ถาวร', () => {
  test('แนบไฟล์/แก้อย่างอื่นภายหลัง ไม่กระทบ snapshot ที่เซ็นไว้', () => {
    const c = signed();
    attachContractFile(c.contractId, 'DOCIMG-1', { by: 'x', at: '2026-07-01T00:00:00.000Z', fileName: 'สัญญาเซ็นแล้ว.pdf' });

    const after = getContract(c.contractId)!;
    assert.deepEqual(after.partySnapshot, party);
    assert.deepEqual(after.periodSnapshot, period);
    assert.deepEqual(after.fileIds, ['DOCIMG-1']);
  });

  test('สัญญาที่ยังไม่เซ็นยังไม่มี snapshot', () => {
    const c = add();
    assert.equal(c.partySnapshot, null);
    assert.equal(c.periodSnapshot, null);
  });

  test('แนบไฟล์เดิมซ้ำไม่เพิ่มรายการซ้ำ', () => {
    const c = add();
    attachContractFile(c.contractId, 'DOCIMG-1', { by: 'x', at: T1 });
    attachContractFile(c.contractId, 'DOCIMG-1', { by: 'x', at: T2 });
    assert.deepEqual(getContract(c.contractId)?.fileIds, ['DOCIMG-1']);
  });
});

/* -------------------------------- แก้ไขเงื่อนไข ------------------------------- */

describe('Contract — แก้ไขเงื่อนไข', () => {
  test('แก้ค่าตอบแทนก่อนเซ็นได้ และลงประวัติค่าก่อน→หลัง', () => {
    const c = add();
    const res = updateContractTerms(c.contractId, { fee: 14000, by: 'x', at: T1 });

    assert.equal(res.ok, true);
    const after = getContract(c.contractId)!;
    assert.equal(after.fee, 14000);
    const entry = after.history.find((h) => h.action === 'UPDATE_TERMS');
    assert.ok(entry?.note?.includes('12000'));
    assert.ok(entry?.note?.includes('14000'));
  });

  test('เซ็นแล้วแก้เงื่อนไขไม่ได้', () => {
    const c = signed();
    const res = updateContractTerms(c.contractId, { fee: 99999, by: 'x', at: '2026-07-01T00:00:00.000Z' });

    assert.equal(res.ok, false);
    assert.equal(getContract(c.contractId)?.fee, 12000);
  });

  test('ส่งค่าเดิมมา → ไม่เพิ่มประวัติเปล่า ๆ', () => {
    const c = add();
    const before = c.history.length;
    updateContractTerms(c.contractId, { fee: 12000, by: 'x', at: T1 });
    assert.equal(getContract(c.contractId)?.history.length, before);
  });
});

/* ----------------------------------- การลบ ---------------------------------- */

describe('Contract — การลบ', () => {
  test('ลบฉบับร่างที่ยังไม่เคยส่งได้', () => {
    const c = add();
    assert.equal(deleteContract(c.contractId).ok, true);
    assert.equal(getContract(c.contractId), null);
  });

  test('ส่งแล้วลบไม่ได้ — ต้องใช้การยกเลิกเพื่อคงประวัติ', () => {
    const c = add();
    sendContract(c.contractId, { by: 'x', at: T1 });
    assert.equal(deleteContract(c.contractId).ok, false);
    assert.ok(getContract(c.contractId));
  });

  test('เซ็นแล้วลบไม่ได้', () => {
    const c = signed();
    assert.equal(deleteContract(c.contractId).ok, false);
  });
});

/* ------------------------------- มุมมองสองฝั่ง ------------------------------- */

describe('Contract — อ่านได้จากทั้งฝั่งคนและฝั่งกรุ๊ป', () => {
  test('หน้าหัวหน้าทัวร์เห็นสัญญาของตัวเองครบทุกกรุ๊ป', () => {
    add();
    add({ periodId: OTHER_PERIOD });
    add({ tourLeaderId: OTHER_LEADER });

    assert.equal(getContractsByLeader(LEADER).length, 2);
    assert.equal(getContractsByLeader(OTHER_LEADER).length, 1);
  });

  test('หน้ากรุ๊ปเห็นสัญญาของทุกคนในกรุ๊ปนั้น', () => {
    add();
    add({ tourLeaderId: OTHER_LEADER, role: 'assistant' });

    const rows = getContractsByPeriod(PERIOD);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((c) => c.role).sort(), ['assistant', 'lead']);
  });

  test('ข้อมูลคงอยู่หลังรีเฟรช (อ่านใหม่จาก storage)', () => {
    const c = signed();
    const again = getContract(c.contractId)!;
    assert.equal(again.status, 'SIGNED');
    assert.equal(again.periodSnapshot?.groupCode, 'CKG-260805A-HU');
  });
});
