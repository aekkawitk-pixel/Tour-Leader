/**
 * ข้อมูลตัวอย่างสำหรับ Demo — ตั้งค่าระบบ → โหลดข้อมูลตัวอย่าง
 *
 * สร้างกรุ๊ปตัวอย่าง 16 กรุ๊ปที่ครอบคลุมทุกขั้น ตั้งแต่จัดหัวหน้าทัวร์ → จัดเจ้าหน้าที่ส่งกรุ๊ป → เอกสารเบิก →
 * จัดซอง / ส่งมอบ / รับซอง / ส่งแลนด์ → ใบเสร็จ → เบี้ยเลี้ยง → นัดเคลียร์เงิน → ปิดเคลียร์ (ครบ / มีค้าง)
 *
 * - วันที่ทั้งหมดนับจากวันที่โหลด (วันนี้ ± n วัน) — โหลดวันไหนก็ได้สถานการณ์ครบเหมือนเดิม
 * - พีเรียดตัวอย่างโคลนจากพีเรียดจริง (ชื่อโปรแกรม/ประเทศจริง) แต่เปลี่ยนรหัสกรุ๊ปและวันที่ · internalId ขึ้นต้น DEMO-
 * - หัวหน้าทัวร์หลัก TL-000001 (ผู้ใช้ "หัวหน้าทัวร์" ใน Demo) มี 9 กรุ๊ปไม่ทับวันกัน · อีก 7 กรุ๊ปเป็นของหัวหน้าทัวร์คนอื่น
 * - โหลดซ้ำได้ — ลบข้อมูลตัวอย่างชุดเก่า (DEMO-) ก่อนเขียนใหม่ ไม่แตะข้อมูลอื่น
 */

import { addDays, toISODate } from '@/lib/format';
import { buildTourPeriodMaster } from '@/data/schedule/master';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { lineKey, type CashEnvelope } from '@/lib/logic/cashEnvelope';
import { sendOffStaffName } from '@/lib/logic/sendOffStaff';
import { readJson, writeJson } from './browserStorage';
import { loadSendOffStaff } from './sendOffStaffStore';
import { clearDemoPeriods, DEMO_ID_PREFIX, saveDemoPeriods } from './demoPeriodStore';
import type { Appointment, ExpenseLine, ExpenseRequest, ExpenseStatus, TourLeader } from '@/types';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';
import type { GuidePeriodAssignment } from './guideAssignmentStore';
import type { SendOffAssignment } from './sendOffAssignmentStore';
import type { GroupClearRecord } from './groupClearStore';

const FINANCE = 'อรวรรณ เจริญทรัพย์';
const COORDINATOR = 'พิมพ์ชนก สุริยะ';
const LOCATION = 'บริษัท ซีโก้ ทราเวล จำกัด ห้องการเงิน ชั้น 1';

/** สกุลเงินตามประเทศ + อัตราแลกเปลี่ยน (บาทต่อ 1 หน่วย) + ยอดเบิกตัวอย่าง [ค่าแลนด์, ค่าเข้าชม, ค่าทิปไกด์] */
const MONEY: Record<string, { currency: string; fx: number; lines: [number, number, number] }> = {
  CNY: { currency: 'CNY', fx: 4.9, lines: [30000, 6000, 3000] },
  JPY: { currency: 'JPY', fx: 0.22, lines: [600000, 120000, 60000] },
  KRW: { currency: 'KRW', fx: 0.025, lines: [6000000, 1200000, 600000] },
  TWD: { currency: 'TWD', fx: 1.1, lines: [130000, 26000, 13000] },
  HKD: { currency: 'HKD', fx: 4.5, lines: [32000, 6400, 3200] },
  EUR: { currency: 'EUR', fx: 38, lines: [3800, 760, 380] },
  SGD: { currency: 'SGD', fx: 26, lines: [5400, 1080, 540] },
  USD: { currency: 'USD', fx: 35, lines: [4000, 800, 400] },
};
const CURRENCY_OF: Record<string, keyof typeof MONEY> = {
  CHINA: 'CNY', JAPAN: 'JPY', KOREA: 'KRW', 'SOUTH KOREA': 'KRW', TAIWAN: 'TWD', 'HONG KONG': 'HKD', EUROPE: 'EUR', SINGAPORE: 'SGD',
};
const PER_DIEM_RATE = 800;

type EnvState =
  | 'none' // ยังไม่มีเอกสารเบิก
  | 'packing' // การเงินกำลังจัดซอง
  | 'sealed' // ปิดซองแล้ว ยังไม่ส่งมอบ
  | 'staff_transit' // ส่งให้เจ้าหน้าที่ส่งกรุ๊ป เจ้าหน้าที่รับแล้ว ยังไม่ส่งต่อหัวหน้าทัวร์
  | 'direct_to_ack' // ส่งถึงหัวหน้าทัวร์โดยตรง รอกดรับ
  | 'received_staff' // รับผ่านเจ้าหน้าที่ส่งกรุ๊ป
  | 'received_direct' // รับจากการเงินโดยตรง
  | 'not_received'; // ซองค่าใช้จ่ายไม่ถึงมือ — แจ้งไม่ได้รับ

type ReceiptPlan = { line: 2 | 3; pct: number; status: ExpenseStatus };

interface Scenario {
  key: string;
  title: string;
  leader: number; // ลำดับใน DEMO_LEADERS
  start: number; // วันออกเดินทาง (วันนี้ + n)
  days: number; // ใช้แสดงช่วงของงานในหน้าตั้งค่า — วันเดินทางจริงใช้ตามโปรแกรมต้นแบบ (3–6 วัน)
  ongoing?: boolean; // กำลังเดินทาง — วันนี้อยู่กลางทริปเสมอ
  sendOff?: { staff: number; confirmed: boolean };
  env: EnvState;
  land?: boolean; // ส่งเงินค่าแลนด์ทั้งซองแล้ว
  mismatch?: string;
  receipts?: ReceiptPlan[];
  perDiem?: ExpenseStatus;
  apt?: { day: number; time: string; status: Appointment['status']; byLeader?: boolean };
  clear?: 'complete' | 'partial';
}

/** หัวหน้าทัวร์ที่ใช้ — ตัวแรก = ผู้ใช้ "หัวหน้าทัวร์" ใน Demo */
const DEMO_LEADERS = ['TL-000001', 'TL-000002', 'TL-000003', 'TL-000004', 'TL-000005'];

/** สถานการณ์ทั้งหมด — เรียงตามขั้นของงาน (ก่อนเดินทาง → ระหว่างทาง → หลังเดินทาง → ปิดเคลียร์) */
export const DEMO_SCENARIOS: Scenario[] = [
  { key: '01', title: 'จัดหัวหน้าทัวร์แล้ว · ยังไม่จัดเจ้าหน้าที่ส่งกรุ๊ป · ยังไม่มีเอกสารเบิก', leader: 0, start: 30, days: 6, env: 'none' },
  { key: '02', title: 'จัดเจ้าหน้าที่ส่งกรุ๊ปแล้ว (รอคอนเฟิร์ม) · การเงินกำลังจัดซอง', leader: 1, start: 12, days: 5, sendOff: { staff: 1, confirmed: false }, env: 'packing' },
  { key: '03', title: 'ปิดซองแล้ว · รอส่งมอบ', leader: 2, start: 6, days: 5, sendOff: { staff: 2, confirmed: true }, env: 'sealed' },
  { key: '04', title: 'ส่งซองให้เจ้าหน้าที่ส่งกรุ๊ปแล้ว · รอส่งต่อหัวหน้าทัวร์ที่สนามบิน', leader: 0, start: 5, days: 5, sendOff: { staff: 0, confirmed: true }, env: 'staff_transit' },
  { key: '05', title: 'ส่งซองถึงหัวหน้าทัวร์โดยตรง · รอหัวหน้าทัวร์กดยืนยันรับ', leader: 3, start: 1, days: 5, sendOff: { staff: 3, confirmed: true }, env: 'direct_to_ack' },
  { key: '06', title: 'กำลังเดินทาง · รับซองแล้ว ส่งค่าแลนด์แล้ว · ใบเสร็จระหว่างทาง (ส่งแล้ว 1 · ร่าง 1)', leader: 0, start: -3, days: 5, ongoing: true, sendOff: { staff: 0, confirmed: true }, env: 'received_staff', land: true, receipts: [{ line: 2, pct: 0.6, status: 'submitted' }, { line: 3, pct: 0.5, status: 'draft' }] },
  { key: '07', title: 'จบทริปแล้ว · ยังไม่ทำอะไร (ค้างเคลียร์)', leader: 0, start: -9, days: 5, sendOff: { staff: 4, confirmed: true }, env: 'received_direct', land: true },
  { key: '08', title: 'ส่งใบเสร็จและเบี้ยเลี้ยงแล้ว · รอบัญชีตรวจ', leader: 0, start: -16, days: 5, sendOff: { staff: 0, confirmed: true }, env: 'received_staff', land: true, receipts: [{ line: 2, pct: 0.95, status: 'submitted' }, { line: 3, pct: 1, status: 'submitted' }], perDiem: 'submitted' },
  { key: '09', title: 'บัญชีส่งใบเสร็จกลับให้แก้ · เบี้ยเลี้ยงยังเป็นร่าง', leader: 1, start: -11, days: 5, sendOff: { staff: 5, confirmed: true }, env: 'received_direct', land: true, receipts: [{ line: 2, pct: 0.9, status: 'revise' }], perDiem: 'draft' },
  { key: '10', title: 'เอกสารครบ ตรวจผ่านแล้ว · ยังไม่มีนัด (พร้อมนัดเคลียร์เงิน)', leader: 0, start: -23, days: 5, sendOff: { staff: 1, confirmed: true }, env: 'received_staff', land: true, receipts: [{ line: 2, pct: 0.92, status: 'approved' }, { line: 3, pct: 1, status: 'approved' }], perDiem: 'approved' },
  { key: '11', title: 'การเงินนัดเคลียร์เงินแล้ว · รอหัวหน้าทัวร์ยืนยันนัด', leader: 2, start: -14, days: 5, sendOff: { staff: 6, confirmed: true }, env: 'received_direct', land: true, receipts: [{ line: 2, pct: 0.85, status: 'approved' }, { line: 3, pct: 1, status: 'approved' }], perDiem: 'approved', apt: { day: 1, time: '10:00', status: 'pending' } },
  { key: '12', title: 'หัวหน้าทัวร์ขอนัดเคลียร์เงินเอง · รอการเงินยืนยัน', leader: 0, start: -30, days: 5, sendOff: { staff: 2, confirmed: true }, env: 'received_direct', land: true, receipts: [{ line: 2, pct: 0.97, status: 'approved' }, { line: 3, pct: 1, status: 'approved' }], perDiem: 'approved', apt: { day: 2, time: '13:30', status: 'pending', byLeader: true } },
  { key: '13', title: 'หัวหน้าทัวร์แจ้งยอดในซองไม่ตรง · ใบเสร็จรอตรวจ', leader: 3, start: -18, days: 5, sendOff: { staff: 7, confirmed: true }, env: 'received_direct', land: true, mismatch: 'ยอดในซองขาด 500 จากยอดหน้าซอง (ธนบัตร 1 ใบ)', receipts: [{ line: 2, pct: 0.8, status: 'submitted' }], perDiem: 'submitted' },
  { key: '14', title: 'เดินทางกลับแล้ว แต่ไม่ได้รับซองค่าใช้จ่าย · แจ้งไม่ได้รับซอง', leader: 4, start: -10, days: 5, sendOff: { staff: 8, confirmed: true }, env: 'not_received', land: true },
  { key: '15', title: 'ปิดเคลียร์เงินแล้ว · ครบทุกข้อ (คืนเงินเหลือ · เบี้ยเลี้ยงโอนแล้ว)', leader: 0, start: -37, days: 5, sendOff: { staff: 3, confirmed: true }, env: 'received_staff', land: true, receipts: [{ line: 2, pct: 0.9, status: 'paid' }, { line: 3, pct: 1, status: 'paid' }], perDiem: 'paid', apt: { day: -28, time: '10:30', status: 'attended' }, clear: 'complete' },
  { key: '16', title: 'ปิดเคลียร์แบบมีค้าง · หัวหน้าทัวร์คืนเงินไม่ครบ (ยอดค้างติดตาม)', leader: 0, start: -44, days: 5, sendOff: { staff: 4, confirmed: true }, env: 'received_direct', land: true, receipts: [{ line: 2, pct: 0.7, status: 'paid' }, { line: 3, pct: 1, status: 'paid' }], perDiem: 'paid', apt: { day: -35, time: '14:00', status: 'attended' }, clear: 'partial' },
];

const isDemoPeriod = (id: string | null | undefined) => !!id && id.startsWith(DEMO_ID_PREFIX);
const at = (date: string, time = '09:00') => `${date}T${time}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** พีเรียดต้นแบบ — กรุ๊ปที่ขายได้จากชุดหลัก ต่างประเทศกันให้มากที่สุด (ชื่อโปรแกรม/ประเทศจริง) */
function templates(): TourPeriodMaster[] {
  const rows = buildTourPeriodMaster().filter((p) => p.saleStatus === 'SELL' && p.isActive && p.groupCode.split('-').length >= 2
    // 3–6 วัน — ทริปของหัวหน้าทัวร์คนเดียวกันห่างกัน 7 วัน จึงไม่ทับกัน · ชื่อโปรแกรม (x วัน y คืน) ตรงกับวันเดินทาง
    && p.durationDays >= 3 && p.durationDays <= 6);
  // วนทีละประเทศ แต่ละรอบใช้โปรแกรมถัดไปของประเทศนั้น (ชื่อโปรแกรมไม่ซ้ำกัน) — ประเทศน้อยกว่าจำนวนสถานการณ์ก็ยังหลากหลาย
  const byCountry = new Map<string, TourPeriodMaster[]>();
  for (const p of rows) {
    const list = byCountry.get(p.countryName) ?? [];
    if (!list.some((x) => x.displayName === p.displayName)) list.push(p);
    byCountry.set(p.countryName, list);
  }
  const out: TourPeriodMaster[] = [];
  for (let round = 0; out.length < DEMO_SCENARIOS.length && round < 20; round++) {
    for (const list of byCountry.values()) if (list[round] && out.length < DEMO_SCENARIOS.length) out.push(list[round]);
  }
  return out;
}

function demoPeriod(tpl: TourPeriodMaster, startDate: string, days: number, seq: string): TourPeriodMaster {
  const parts = tpl.groupCode.split('-');
  const code = `${parts[0]}-${startDate.slice(2, 4)}${startDate.slice(5, 7)}${startDate.slice(8, 10)}D-${parts[parts.length - 1]}`;
  const internalId = `${DEMO_ID_PREFIX}${seq}-${code}`;
  return {
    ...tpl,
    id: code,
    internalId,
    tourCode: code,
    groupCode: code,
    sourceRecordId: internalId,
    startDate,
    endDate: addDays(startDate, days - 1),
    durationDays: days,
    durationNights: days - 1,
    startDateTime: null,
    endDateTime: null,
    sectors: [],
    saleStatus: 'SELL',
    dataStatus: 'ACTIVE',
    isActive: true,
    validationStatus: 'VALID',
    validationMessages: [],
    seatTotal: 30,
    seatBooked: 25,
    seatRemaining: 5,
    remark: 'ข้อมูลตัวอย่างสำหรับ Demo',
  };
}

/** โหลดข้อมูลตัวอย่าง — ลบชุดเก่าก่อน แล้วเขียนใหม่ทุกสถานการณ์ */
export function loadDemoScenario(leaders: TourLeader[]): { groups: number } {
  removeDemoScenario();
  const today = toISODate(new Date());
  const tpls = templates();
  const staff = loadSendOffStaff().filter((s) => s.status === 'active');
  const staffAt = (i: number) => staff[i % staff.length];
  const leaderInfo = (i: number) => {
    const id = DEMO_LEADERS[i];
    const l = leaders.find((x) => x.id === id);
    const name = l ? `${l.firstName} ${l.lastName}`.trim() : id;
    const bank = l?.bankAccounts.find((b) => b.isPrimary) ?? l?.bankAccounts[0];
    return { id, name, bank: bank ? { bank: bank.bank, accountNoMasked: bank.accountNoMasked, accountName: bank.accountName, branch: bank.branch ?? '' } : { bank: '', accountNoMasked: '', accountName: '', branch: '' } };
  };

  const periods: TourPeriodMaster[] = [];
  const guide: GuidePeriodAssignment[] = [];
  const sendOff: SendOffAssignment[] = [];
  const expenses: ExpenseRequest[] = [];
  const envelopes: CashEnvelope[] = [];
  const appointments: Appointment[] = [];
  const clears: Record<string, GroupClearRecord> = {};

  // เหตุการณ์ที่เกิดไปแล้ว (มอบหมาย จัดซอง ส่งมอบ) ห้ามลงวันในอนาคต — กรุ๊ปก่อนเดินทางเลื่อนมาเป็นวันนี้
  const past = (d: string) => (d > today ? today : d);

  DEMO_SCENARIOS.forEach((sc, i) => {
    const tpl = tpls[i % tpls.length];
    // ใช้จำนวนวันจริงของโปรแกรมต้นแบบ · กรุ๊ปกำลังเดินทาง = วันนี้อยู่กลางทริปเสมอ
    const days = tpl.durationDays;
    const start = addDays(today, sc.ongoing ? -Math.floor((days - 1) / 2) : sc.start);
    const p = demoPeriod(tpl, start, days, sc.key);
    periods.push(p);
    const pid = p.internalId;
    const end = p.endDate;
    const leader = leaderInfo(sc.leader);
    const assignedAt = at(past(addDays(start, -45)), '10:00');

    // 1) จัดหัวหน้าทัวร์ (มอบหมาย = คอนเฟิร์มทันที)
    guide.push({
      assignmentId: `GA-lead-${pid}`, periodId: pid, tourLeaderId: leader.id, role: 'lead',
      assignmentStatus: 'CONFIRMED', assignedBy: COORDINATOR, assignedAt, confirmedAt: assignedAt,
      note: `Demo ${sc.key}: ${sc.title}`,
    });

    // 2) จัดเจ้าหน้าที่ส่งกรุ๊ป
    const so = sc.sendOff ? staffAt(sc.sendOff.staff) : null;
    if (sc.sendOff && so) {
      sendOff.push({
        assignmentId: `SOA-${pid}`, periodId: pid, staffId: so.id, arrivalTime: '05:30', dayOffset: 0,
        status: sc.sendOff.confirmed ? 'CONFIRMED' : 'PENDING_CONFIRMATION', assignedBy: COORDINATOR, assignedAt: at(past(addDays(start, -20)), '11:00'),
        confirmedAt: sc.sendOff.confirmed ? at(past(addDays(start, -19)), '15:00') : null, ...(sc.sendOff.confirmed ? { confirmedBy: COORDINATOR } : {}),
      });
    }
    if (sc.env === 'none') return;

    // 3) เอกสารเบิกค่าใช้จ่ายกรุ๊ป (นำเข้าจากฝ่ายทำเบิก) — 3 รายการ
    const money = MONEY[CURRENCY_OF[p.countryName.toUpperCase()] ?? 'USD'];
    const docId = `DEMO-ADV-${sc.key}`;
    const LINE_INFO: [string, string][] = [['ค่าแลนด์', 'ค่าบริการแลนด์ต่างประเทศ (ทั้งกรุ๊ป)'], ['ค่าเข้าชมสถานที่', 'ค่าเข้าชมสถานที่ตามโปรแกรม'], ['ค่าทิปไกด์ท้องถิ่น', 'ทิปไกด์และคนขับ']];
    const docLines: ExpenseLine[] = money.lines.map((amount, li) => ({
      id: `${docId}-${li + 1}`, expenseType: LINE_INFO[li][0], purpose: LINE_INFO[li][0], description: LINE_INFO[li][1],
      quantity: 1, unitPrice: amount, amount, currency: money.currency, fxRate: money.fx, amountTHB: Math.round(amount * money.fx),
      receiptNo: '—', evidenceFileName: `${docId}.xls`,
    }));
    const importedAt = at(past(addDays(start, -14)), '09:30');
    expenses.push({
      id: docId, jobId: pid, category: 'advance', requesterId: 'SYSTEM', requesterName: 'ฝ่ายทำเบิก (Demo)',
      requestedAt: addDays(start, -14), submittedAt: importedAt, status: 'approved',
      history: [makeStatusEvent(null, 'approved', 'ฝ่ายทำเบิก (Demo)', importedAt, `นำเข้าจากไฟล์ ${docId}.xls`)],
      bankAccount: { bank: '', accountNoMasked: '', accountName: '', branch: '' }, note: '',
      totalTHB: docLines.reduce((n, l) => n + l.amountTHB, 0), lines: docLines,
      sourceDoc: {
        sourceFileName: `${docId}.xls`, importedAt, groupCode: p.groupCode, programName: p.displayName,
        travelDates: `${start.split('-').reverse().join('/')} - ${end.split('-').reverse().join('/')}`, pax: '25 ท่าน + 1 TL',
        printedBy: 'ฝ่ายทำเบิก (Demo)', contact: COORDINATOR,
      },
    });

    // 4) ซองเงิน — ซอง 1 ค่าแลนด์ · ซอง 2 ค่าเข้าชม + ทิป
    const pack = (no: number, kind: CashEnvelope['kind'], lines: ExpenseLine[], sealed: boolean): CashEnvelope => {
      const keys = lines.map((l) => lineKey(docId, l.id));
      const totals = new Map<string, number>();
      for (const l of lines) totals.set(l.currency, (totals.get(l.currency) ?? 0) + l.amount);
      const sealAt = at(past(addDays(start, -7)), '14:00');
      return {
        id: `ENV-${pid}-${no}`, periodId: pid, no, kind, packedLineIds: keys,
        ...(sealed ? {
          sealed: {
            at: sealAt, byName: FINANCE, faceTotals: [...totals].map(([currency, amount]) => ({ currency, amount })),
            lineSnapshot: lines.map((l) => ({ id: lineKey(docId, l.id), amount: l.amount, currency: l.currency })),
          },
        } : {}),
        history: [{ at: at(past(addDays(start, -8)), '10:00'), byName: FINANCE, action: 'จัดซอง' }, ...(sealed ? [{ at: sealAt, byName: FINANCE, action: 'ปิดซอง' }] : [])],
      };
    };
    if (sc.env === 'packing') {
      envelopes.push(pack(1, 'land', [docLines[0]], false));
      return;
    }
    const env1 = pack(1, 'land', [docLines[0]], true);
    const env2 = pack(2, 'advance', [docLines[1], docLines[2]], true);
    const groupEnvs = [env1, env2];
    if (sc.env !== 'sealed') {
      const handAt = at(past(addDays(start, sc.env === 'direct_to_ack' || sc.env === 'staff_transit' ? -2 : -1)), '16:00');
      const viaStaff = (sc.env === 'staff_transit' || sc.env === 'received_staff') && so;
      for (const env of groupEnvs) {
        env.handover = viaStaff
          ? { at: handAt, byName: FINANCE, receiverKind: 'staff', receiverId: leader.id, receiverName: leader.name, proxyName: sendOffStaffName(so), proxyStaffId: so.id }
          : { at: handAt, byName: FINANCE, receiverKind: 'leader', receiverId: leader.id, receiverName: leader.name };
        env.history.push({ at: handAt, byName: FINANCE, action: viaStaff ? `ส่งมอบให้เจ้าหน้าที่ส่งกรุ๊ป ${sendOffStaffName(so)}` : `ส่งมอบให้หัวหน้าทัวร์ ${leader.name}` });
        if (viaStaff) {
          env.staffAck = { at: at(past(addDays(start, -1)), '17:00'), staffId: so.id, staffName: sendOffStaffName(so) };
          env.history.push({ at: env.staffAck.at, byName: sendOffStaffName(so), action: 'เจ้าหน้าที่ส่งกรุ๊ปรับซอง' });
          if (sc.env === 'received_staff') {
            env.staffHandoff = { at: at(start, '05:45'), staffName: sendOffStaffName(so) };
            env.history.push({ at: env.staffHandoff.at, byName: sendOffStaffName(so), action: 'ส่งต่อให้หัวหน้าทัวร์ที่สนามบิน' });
          }
        }
        const received = sc.env === 'received_staff' || sc.env === 'received_direct' || (sc.env === 'not_received' && env.no === 1);
        if (received) {
          env.leaderAck = { at: at(start, '06:00'), leaderId: leader.id, leaderName: leader.name, ...(viaStaff ? { fromStaffName: sendOffStaffName(so) } : {}) };
          env.history.push({ at: env.leaderAck.at, byName: leader.name, action: 'หัวหน้าทัวร์ยืนยันรับซอง' });
        }
      }
      // ส่งค่าแลนด์ทั้งซอง (ซอง 1) — ไม่มีรูปใบรับเงิน (Demo ไม่มีไฟล์รูป)
      if (sc.land && env1.leaderAck) {
        env1.landPayments = [{ id: `LP-${pid}`, at: at(addDays(start, 1), '19:00'), byName: leader.name, landName: '', amount: docLines[0].amount, currency: money.currency }];
        env1.history.push({ at: env1.landPayments[0].at, byName: leader.name, action: 'ส่งเงินให้แลนด์' });
      }
      if (sc.mismatch && env2.leaderAck) env2.mismatch = { at: at(addDays(start, 1), '08:00'), byName: leader.name, note: sc.mismatch };
      if (sc.env === 'not_received') env2.notReceived = { at: at(addDays(end, 1), '10:00'), byName: leader.name, note: 'เจ้าหน้าที่ไม่ได้นำซองมาให้ที่สนามบิน และไม่มีใครนำมาส่งระหว่างทาง' };
    }
    envelopes.push(...groupEnvs);

    // 5) ใบเสร็จ (ผูกรายการเบิก) — ยอด = สัดส่วนของรายการ
    const receiptDay = (n: number) => addDays(start, Math.min(n, days - 1));
    (sc.receipts ?? []).forEach((r, ri) => {
      const src = docLines[r.line - 1];
      const amount = round2(src.amount * r.pct);
      const id = `DEMO-EXP-${sc.key}-R${ri + 1}`;
      const reqAt = at(receiptDay(ri + 1), '20:00');
      const history = [makeStatusEvent(null, r.status === 'draft' ? 'draft' : 'submitted', leader.name, reqAt, 'บันทึกจากพอร์ทัลหัวหน้าทัวร์')];
      if (r.status === 'revise') history.push(makeStatusEvent('submitted', 'revise', FINANCE, at(addDays(end, 2), '11:00'), 'ใบเสร็จไม่ชัด — ถ่ายใหม่ให้เห็นยอดและวันที่'));
      if (r.status === 'approved' || r.status === 'paid') history.push(makeStatusEvent('submitted', 'approved', FINANCE, at(addDays(end, 3), '11:00'), 'ตรวจแล้ว'));
      expenses.push({
        id, jobId: p.internalId, category: 'actual', requesterId: leader.id, requesterName: leader.name,
        requestedAt: reqAt, ...(r.status === 'draft' ? {} : { submittedAt: reqAt }), status: r.status === 'paid' ? 'approved' : r.status,
        lines: [{
          id: `${id}-1`, expenseType: src.expenseType, purpose: src.purpose, description: src.description, amount, currency: src.currency,
          fxRate: src.fxRate, amountTHB: Math.round(amount * src.fxRate), receiptNo: `RC-${sc.key}${ri + 1}`, evidenceFileName: `receipt-${sc.key}-${ri + 1}.jpg`,
          receiptDate: receiptDay(ri + 1), budgetLineId: src.id, ...(r.status === 'revise' ? { needsFix: true } : {}),
        }],
        totalTHB: Math.round(amount * src.fxRate), bankAccount: leader.bank, note: '', history,
      });
    });

    // 6) ใบเบิกเบี้ยเลี้ยง (เงินบาท · อัตรา × จำนวนวัน)
    if (sc.perDiem) {
      const amount = PER_DIEM_RATE * days;
      const reqAt = at(addDays(end, 1), '18:00');
      const st = sc.perDiem;
      const history = [makeStatusEvent(null, st === 'draft' ? 'draft' : 'submitted', leader.name, reqAt, 'เอกสารค่าใช้จ่ายหัวหน้าทัวร์ — จากพอร์ทัลหัวหน้าทัวร์')];
      if (st === 'approved' || st === 'paid') history.push(makeStatusEvent('submitted', 'approved', FINANCE, at(addDays(end, 3), '14:00'), 'อนุมัติ'));
      if (st === 'paid') history.push(makeStatusEvent('approved', 'paid', FINANCE, at(addDays(end, 6), '10:00'), 'โอนเข้าบัญชีหัวหน้าทัวร์'));
      expenses.push({
        id: `DEMO-EXP-${sc.key}-PD`, jobId: pid, category: 'leader_fee', claimKind: 'per_diem', requesterId: leader.id, requesterName: leader.name,
        requestedAt: reqAt, ...(st === 'draft' ? {} : { submittedAt: reqAt }), status: st,
        claimForm: { paxCount: 25, leaderCount: 1, cancelledPax: 0 },
        lines: [{ id: 'L-1', expenseType: 'ค่าเบี้ยเลี้ยง', purpose: 'ค่าเบี้ยเลี้ยง', quantity: days, unitPrice: PER_DIEM_RATE, amount, currency: 'THB', fxRate: 1, amountTHB: amount, receiptNo: '', evidenceFileName: '', receiptDate: end }],
        totalTHB: amount, bankAccount: leader.bank, note: '', history,
        ...(st === 'paid' ? { paidAt: at(addDays(end, 6), '10:00'), paidRef: `TRF-DEMO-${sc.key}` } : {}),
      });
    }

    // 7) นัดเคลียร์เงิน
    if (sc.apt) {
      const madeAt = at(addDays(end, 4), '09:00');
      const by = sc.apt.byLeader ? leader.name : FINANCE;
      const history = [makeStatusEvent(null, 'pending', by, madeAt, sc.apt.byLeader ? 'หัวหน้าทัวร์ขอนัดเคลียร์เงิน' : 'นัดเคลียร์เงินกรุ๊ป')];
      if (sc.apt.status === 'attended') {
        history.push(makeStatusEvent('pending', 'confirmed', leader.name, at(addDays(end, 5), '08:00'), 'หัวหน้าทัวร์ยืนยันนัด'));
        history.push(makeStatusEvent('confirmed', 'attended', FINANCE, at(addDays(today, sc.apt.day), sc.apt.time), 'เข้าพบและปิดเคลียร์เงิน'));
      }
      appointments.push({
        id: `APT-DEMO-${sc.key}`, date: addDays(today, sc.apt.day), time: sc.apt.time, durationMinutes: 30, leaderId: leader.id, jobId: pid,
        kind: 'clear', staffName: sc.apt.byLeader ? 'ฝ่ายบัญชี' : FINANCE, mode: 'office', location: LOCATION,
        note: sc.apt.byLeader ? 'สะดวกช่วงบ่าย' : 'นำเงินคืนและใบเสร็จตัวจริงมาด้วย', status: sc.apt.status,
        ...(sc.apt.byLeader ? { requestedByLeader: true } : {}), blocksAssignment: false, history,
      });
    }

    // 8) ปิดเคลียร์ — เงินเหลือในซอง 2 = หน้าซอง − ใบเสร็จที่ตรวจแล้ว
    if (sc.clear) {
      const face = env2.sealed!.faceTotals[0].amount;
      const spent = expenses.filter((e) => e.jobId === pid && e.category === 'actual').reduce((n, e) => n + e.lines[0].amount, 0);
      const remaining = round2(face - spent);
      const closedAt = at(addDays(today, sc.apt?.day ?? 0), '15:00');
      const returned = sc.clear === 'complete' ? remaining : round2(remaining * 0.6);
      clears[pid] = {
        periodId: pid,
        returned: [{ currency: money.currency, amount: returned }],
        closeKind: sc.clear,
        ...(sc.clear === 'partial' ? {
          partialReason: 'หัวหน้าทัวร์นำเงินมาคืนไม่ครบ — ขอผ่อนคืนส่วนที่เหลือ',
          followUps: [{
            id: `FU-DEMO-${sc.key}`, direction: 'leader_owes', reason: 'short_return', currency: money.currency,
            amount: round2(remaining - returned), note: 'ผ่อนคืนภายในสิ้นเดือน', createdAt: closedAt, createdBy: FINANCE, payments: [],
          }],
        } : {}),
        closedAt, closedBy: FINANCE,
        history: [{ at: closedAt, by: FINANCE, action: 'close', ...(sc.clear === 'partial' ? { note: 'ปิดแบบมีค้าง' } : {}) }],
      };
    }
  });

  // เขียนทุกที่เก็บ — ต่อจากข้อมูลเดิม (ลบชุดตัวอย่างเก่าไปแล้วใน removeDemoScenario)
  saveDemoPeriods(periods);
  writeJson('guidePeriodAssignments', [...readJson<GuidePeriodAssignment[]>('guidePeriodAssignments', []), ...guide]);
  writeJson('sendOffAssignments', [...readJson<SendOffAssignment[]>('sendOffAssignments', []), ...sendOff]);
  writeJson('savedExpenses', [...readJson<ExpenseRequest[]>('savedExpenses', []), ...expenses]);
  writeJson('cashEnvelopes', [...readJson<CashEnvelope[]>('cashEnvelopes', []), ...envelopes]);
  writeJson('appointments', [...readJson<Appointment[]>('appointments', []), ...appointments]);
  writeJson('groupClearRecords', { ...readJson<Record<string, GroupClearRecord>>('groupClearRecords', {}), ...clears });
  return { groups: periods.length };
}

/** ลบข้อมูลตัวอย่างทั้งหมด (พีเรียด DEMO- และทุกรายการที่ผูกกับพีเรียดเหล่านั้น) — ข้อมูลอื่นไม่ถูกแตะ */
export function removeDemoScenario(): void {
  const arr = <T,>(key: string, keep: (x: T) => boolean) => {
    const rows = readJson<unknown>(key, []);
    if (Array.isArray(rows)) writeJson(key, (rows as T[]).filter(keep));
  };
  arr<GuidePeriodAssignment>('guidePeriodAssignments', (a) => !isDemoPeriod(a.periodId));
  arr<SendOffAssignment>('sendOffAssignments', (a) => !isDemoPeriod(a.periodId));
  arr<ExpenseRequest>('savedExpenses', (e) => !isDemoPeriod(e.jobId));
  arr<CashEnvelope>('cashEnvelopes', (e) => !isDemoPeriod(e.periodId));
  arr<Appointment>('appointments', (a) => !isDemoPeriod(a.jobId));
  const clears = readJson<Record<string, GroupClearRecord>>('groupClearRecords', {});
  writeJson('groupClearRecords', Object.fromEntries(Object.entries(clears).filter(([id]) => !isDemoPeriod(id))));
  clearDemoPeriods();
}

/** มีข้อมูลตัวอย่างโหลดอยู่หรือไม่ */
export function demoScenarioLoaded(): boolean {
  const rows = readJson<unknown>('demoExtraPeriods', []);
  return Array.isArray(rows) && rows.length > 0;
}
