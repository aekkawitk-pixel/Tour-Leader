/**
 * Contract Store — สัญญาจ้างหัวหน้าทัวร์รายกรุ๊ป
 *
 * กติกาที่บังคับที่นี่จุดเดียว:
 *   • หนึ่งกรุ๊ป × หนึ่งหัวหน้าทัวร์ มีสัญญาที่ยังมีผลได้ไม่เกิน 1 ฉบับ
 *     (ยกเลิกฉบับเดิมก่อน จึงจะทำฉบับใหม่ได้ — กันสัญญาซ้อนกันเงียบ ๆ)
 *   • เปลี่ยนสถานะได้เฉพาะเส้นทางใน CONTRACT_TRANSITIONS
 *   • เซ็นสัญญาต้องแนบ "ภาพ ณ วันเซ็น" เสมอ — เซ็นโดยไม่มี snapshot ไม่ได้
 *   • ยกเลิกต้องมีเหตุผล
 *
 * คืนผลแบบ { ok } เหมือน guideAssignmentStore — UI ต้องไม่ขึ้นว่าบันทึกสำเร็จเมื่อ ok = false
 * เก็บใน localStorage · เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 */

import {
  canTransitionContract,
  isContractActive,
  type ContractHistoryEntry,
  type ContractPartySnapshot,
  type ContractPeriodSnapshot,
  type ContractStatus,
  type LeaderContract,
} from '@/data/contracts/contractTypes';
import { readJson, writeJson } from './browserStorage';

const KEY = 'leaderContracts';

/** ผลของการบันทึก — ปฏิเสธได้พร้อมเหตุผลที่แสดงต่อผู้ใช้ได้ทันที */
export type ContractResult =
  | { ok: true; contract: LeaderContract }
  | { ok: false; error: string };

/* --------------------------------- อ่าน/เขียน -------------------------------- */

function normalize(row: LeaderContract): LeaderContract {
  return {
    ...row,
    assignmentId: row.assignmentId ?? null,
    currency: row.currency || 'THB',
    payTerm: row.payTerm ?? '',
    note: row.note ?? '',
    fileIds: row.fileIds ?? [],
    partySnapshot: row.partySnapshot ?? null,
    periodSnapshot: row.periodSnapshot ?? null,
    history: row.history ?? [],
  };
}

function loadAll(): LeaderContract[] {
  const parsed = readJson<LeaderContract[]>(KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalize);
}

/** เขียนไม่สำเร็จ → โยน StorageWriteError (UI ต้องไม่ขึ้นว่าบันทึกสำเร็จ) */
function saveAll(rows: LeaderContract[]): void {
  writeJson(KEY, rows);
}

function newContractId(): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `CT-${rand}`;
}

/* ----------------------------------- อ่าน ----------------------------------- */

/** สัญญาทั้งหมด — ใหม่สุดขึ้นก่อน */
export function getContracts(): LeaderContract[] {
  return loadAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getContract(contractId: string): LeaderContract | null {
  return loadAll().find((c) => c.contractId === contractId) ?? null;
}

/** สัญญาทั้งหมดของหัวหน้าทัวร์คนหนึ่ง (มุมมองหน้าโปรไฟล์) */
export function getContractsByLeader(tourLeaderId: string): LeaderContract[] {
  return getContracts().filter((c) => c.tourLeaderId === tourLeaderId);
}

/** สัญญาทั้งหมดของกรุ๊ปหนึ่ง (มุมมองหน้าจัดสเก็ต) */
export function getContractsByPeriod(periodId: string): LeaderContract[] {
  return getContracts().filter((c) => c.periodId === periodId);
}

/** สัญญาที่ยังมีผลของคู่ (หัวหน้าทัวร์ × กรุ๊ป) — มีได้ไม่เกิน 1 ฉบับ */
export function getActiveContract(tourLeaderId: string, periodId: string): LeaderContract | null {
  return loadAll().find(
    (c) => c.tourLeaderId === tourLeaderId && c.periodId === periodId && isContractActive(c.status),
  ) ?? null;
}

/* ---------------------------------- สร้างใหม่ --------------------------------- */

export interface CreateContractInput {
  tourLeaderId: string;
  periodId: string;
  assignmentId?: string | null;
  role?: 'lead' | 'assistant';
  fee: number;
  currency?: string;
  payTerm?: string;
  note?: string;
  by: string;
  at: string;
}

/** เปิดสัญญาฉบับร่างสำหรับกรุ๊ปนี้ — ปฏิเสธเมื่อยังมีสัญญาที่มีผลอยู่ */
export function createContract(input: CreateContractInput): ContractResult {
  if (input.fee < 0) {
    return { ok: false, error: 'ค่าตอบแทนต้องไม่ติดลบ' };
  }

  const rows = loadAll();
  const existing = rows.find(
    (c) => c.tourLeaderId === input.tourLeaderId
      && c.periodId === input.periodId
      && isContractActive(c.status),
  );
  if (existing) {
    return {
      ok: false,
      error: 'กรุ๊ปนี้มีสัญญาที่ยังมีผลอยู่แล้ว — ยกเลิกฉบับเดิมก่อนจึงจะทำฉบับใหม่ได้',
    };
  }

  const contract: LeaderContract = {
    contractId: newContractId(),
    tourLeaderId: input.tourLeaderId,
    periodId: input.periodId,
    assignmentId: input.assignmentId ?? null,
    role: input.role ?? 'lead',
    status: 'DRAFT',
    fee: input.fee,
    currency: input.currency || 'THB',
    payTerm: input.payTerm ?? '',
    sentAt: null,
    sentBy: null,
    signedAt: null,
    signedBy: null,
    closedAt: null,
    closedBy: null,
    closeReason: null,
    fileIds: [],
    note: input.note ?? '',
    partySnapshot: null,
    periodSnapshot: null,
    createdBy: input.by,
    createdAt: input.at,
    updatedAt: input.at,
    history: [{ at: input.at, by: input.by, action: 'CREATE', to: 'DRAFT' }],
  };

  rows.push(contract);
  saveAll(rows);
  return { ok: true, contract };
}

/* ------------------------------- เปลี่ยนสถานะ ------------------------------- */

function withStatus(
  current: LeaderContract,
  to: ContractStatus,
  entry: Omit<ContractHistoryEntry, 'from' | 'to'>,
  patch: Partial<LeaderContract> = {},
): LeaderContract {
  return {
    ...current,
    ...patch,
    status: to,
    updatedAt: entry.at,
    history: [...current.history, { ...entry, from: current.status, to }],
  };
}

function commit(rows: LeaderContract[], idx: number, next: LeaderContract): ContractResult {
  rows[idx] = next;
  saveAll(rows);
  return { ok: true, contract: next };
}

function findRow(contractId: string): { rows: LeaderContract[]; idx: number } | null {
  const rows = loadAll();
  const idx = rows.findIndex((c) => c.contractId === contractId);
  return idx < 0 ? null : { rows, idx };
}

/** ส่งสัญญาให้หัวหน้าทัวร์เซ็น */
export function sendContract(contractId: string, opts: { by: string; at: string }): ContractResult {
  const found = findRow(contractId);
  if (!found) return { ok: false, error: 'ไม่พบสัญญาฉบับนี้' };

  const current = found.rows[found.idx];
  if (!canTransitionContract(current.status, 'SENT')) {
    return { ok: false, error: `สัญญาสถานะ “${current.status}” ส่งให้เซ็นไม่ได้` };
  }

  return commit(found.rows, found.idx, withStatus(
    current, 'SENT', { at: opts.at, by: opts.by, action: 'SEND' },
    { sentAt: opts.at, sentBy: opts.by },
  ));
}

export interface SignContractInput {
  by: string;
  at: string;
  /** ภาพ ณ วันเซ็น — บังคับ เพราะสัญญาต้องตรงกับกระดาษที่เซ็นจริงตลอดไป */
  partySnapshot: ContractPartySnapshot;
  periodSnapshot: ContractPeriodSnapshot;
  /** ไฟล์สัญญาที่เซ็นแล้ว (imageId จาก documentImageStore) */
  fileIds?: string[];
}

/** บันทึกการเซ็นสัญญา — ตรึงข้อมูลคู่สัญญาและกรุ๊ป ณ วันนั้นไว้ถาวร */
export function signContract(contractId: string, input: SignContractInput): ContractResult {
  const found = findRow(contractId);
  if (!found) return { ok: false, error: 'ไม่พบสัญญาฉบับนี้' };

  const current = found.rows[found.idx];
  if (!canTransitionContract(current.status, 'SIGNED')) {
    return { ok: false, error: `สัญญาสถานะ “${current.status}” บันทึกการเซ็นไม่ได้` };
  }

  return commit(found.rows, found.idx, withStatus(
    current, 'SIGNED', { at: input.at, by: input.by, action: 'SIGN' },
    {
      signedAt: input.at,
      signedBy: input.by,
      partySnapshot: input.partySnapshot,
      periodSnapshot: input.periodSnapshot,
      fileIds: input.fileIds ? [...current.fileIds, ...input.fileIds] : current.fileIds,
    },
  ));
}

/** ยกเลิกก่อนเซ็น — ต้องมีเหตุผลเสมอ */
export function cancelContract(
  contractId: string, opts: { by: string; at: string; reason: string },
): ContractResult {
  const reason = opts.reason.trim();
  if (!reason) return { ok: false, error: 'กรุณาระบุเหตุผลที่ยกเลิก' };

  const found = findRow(contractId);
  if (!found) return { ok: false, error: 'ไม่พบสัญญาฉบับนี้' };

  const current = found.rows[found.idx];
  if (!canTransitionContract(current.status, 'CANCELLED')) {
    return { ok: false, error: `สัญญาสถานะ “${current.status}” ยกเลิกแบบนี้ไม่ได้` };
  }

  return commit(found.rows, found.idx, withStatus(
    current, 'CANCELLED', { at: opts.at, by: opts.by, action: 'CANCEL', note: reason },
    { closedAt: opts.at, closedBy: opts.by, closeReason: reason },
  ));
}

/** ยกเลิกสัญญาที่เซ็นไปแล้ว — ข้อมูลการเซ็นเดิมและ snapshot ยังอยู่ครบ ไม่ถูกล้าง */
export function voidContract(
  contractId: string, opts: { by: string; at: string; reason: string },
): ContractResult {
  const reason = opts.reason.trim();
  if (!reason) return { ok: false, error: 'กรุณาระบุเหตุผลที่ยกเลิกสัญญา' };

  const found = findRow(contractId);
  if (!found) return { ok: false, error: 'ไม่พบสัญญาฉบับนี้' };

  const current = found.rows[found.idx];
  if (!canTransitionContract(current.status, 'VOID')) {
    return { ok: false, error: `สัญญาสถานะ “${current.status}” ยกเลิกแบบนี้ไม่ได้` };
  }

  return commit(found.rows, found.idx, withStatus(
    current, 'VOID', { at: opts.at, by: opts.by, action: 'VOID', note: reason },
    { closedAt: opts.at, closedBy: opts.by, closeReason: reason },
  ));
}

/* ------------------------------- แก้ไขเงื่อนไข ------------------------------- */

export interface UpdateTermsInput {
  fee?: number;
  currency?: string;
  payTerm?: string;
  note?: string;
  by: string;
  at: string;
}

/**
 * แก้เงื่อนไขได้เฉพาะก่อนเซ็น — เซ็นแล้วต้องยกเลิกแล้วทำฉบับใหม่
 * (แก้เงื่อนไขของสัญญาที่เซ็นแล้วเงียบ ๆ ทำให้ระบบไม่ตรงกับกระดาษ)
 */
export function updateContractTerms(contractId: string, input: UpdateTermsInput): ContractResult {
  const found = findRow(contractId);
  if (!found) return { ok: false, error: 'ไม่พบสัญญาฉบับนี้' };

  const current = found.rows[found.idx];
  if (current.status !== 'DRAFT' && current.status !== 'SENT') {
    return { ok: false, error: 'แก้ไขเงื่อนไขได้เฉพาะสัญญาที่ยังไม่ได้เซ็น' };
  }
  if (input.fee !== undefined && input.fee < 0) {
    return { ok: false, error: 'ค่าตอบแทนต้องไม่ติดลบ' };
  }

  const changed: string[] = [];
  if (input.fee !== undefined && input.fee !== current.fee) changed.push(`ค่าตอบแทน: ${current.fee} → ${input.fee}`);
  if (input.payTerm !== undefined && input.payTerm !== current.payTerm) changed.push('เงื่อนไขการจ่าย');
  if (input.currency !== undefined && input.currency !== current.currency) changed.push(`สกุลเงิน: ${current.currency} → ${input.currency}`);
  if (input.note !== undefined && input.note !== current.note) changed.push('หมายเหตุ');

  if (changed.length === 0) return { ok: true, contract: current };

  const next: LeaderContract = {
    ...current,
    fee: input.fee ?? current.fee,
    currency: input.currency ?? current.currency,
    payTerm: input.payTerm ?? current.payTerm,
    note: input.note ?? current.note,
    updatedAt: input.at,
    history: [...current.history, {
      at: input.at, by: input.by, action: 'UPDATE_TERMS', note: changed.join(' · '),
    }],
  };

  return commit(found.rows, found.idx, next);
}

/* --------------------------------- ไฟล์แนบ --------------------------------- */

/** แนบไฟล์สัญญาเพิ่ม (อ้าง imageId จาก documentImageStore) */
export function attachContractFile(
  contractId: string, imageId: string, opts: { by: string; at: string; fileName?: string },
): ContractResult {
  const found = findRow(contractId);
  if (!found) return { ok: false, error: 'ไม่พบสัญญาฉบับนี้' };

  const current = found.rows[found.idx];
  if (current.fileIds.includes(imageId)) return { ok: true, contract: current };

  const next: LeaderContract = {
    ...current,
    fileIds: [...current.fileIds, imageId],
    updatedAt: opts.at,
    history: [...current.history, {
      at: opts.at, by: opts.by, action: 'ATTACH_FILE', note: opts.fileName,
    }],
  };
  return commit(found.rows, found.idx, next);
}

/** เอาไฟล์ออกจากสัญญา — ไม่ลบไฟล์ในที่เก็บรูป (ผู้เรียกตัดสินใจเอง) */
export function removeContractFile(
  contractId: string, imageId: string, opts: { by: string; at: string },
): ContractResult {
  const found = findRow(contractId);
  if (!found) return { ok: false, error: 'ไม่พบสัญญาฉบับนี้' };

  const current = found.rows[found.idx];
  if (!current.fileIds.includes(imageId)) return { ok: true, contract: current };

  const next: LeaderContract = {
    ...current,
    fileIds: current.fileIds.filter((id) => id !== imageId),
    updatedAt: opts.at,
    history: [...current.history, { at: opts.at, by: opts.by, action: 'REMOVE_FILE' }],
  };
  return commit(found.rows, found.idx, next);
}

/* ------------------------------------ ลบ ------------------------------------ */

/**
 * ลบสัญญาถาวร — อนุญาตเฉพาะฉบับร่างที่ยังไม่เคยส่ง
 * สัญญาที่ส่ง/เซ็นแล้วต้องใช้การยกเลิก เพื่อให้ประวัติยังตรวจย้อนหลังได้
 */
export function deleteContract(contractId: string): { ok: true } | { ok: false; error: string } {
  const found = findRow(contractId);
  if (!found) return { ok: false, error: 'ไม่พบสัญญาฉบับนี้' };

  const current = found.rows[found.idx];
  if (current.status !== 'DRAFT' || current.sentAt !== null) {
    return { ok: false, error: 'ลบได้เฉพาะสัญญาฉบับร่างที่ยังไม่เคยส่ง — ฉบับอื่นให้ใช้การยกเลิก' };
  }

  saveAll(found.rows.filter((c) => c.contractId !== contractId));
  return { ok: true };
}
