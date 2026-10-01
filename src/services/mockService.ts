/**
 * Implementation ของ TourLeaderService ที่ใช้ข้อมูลจำลอง
 * มีการหน่วงเวลาเล็กน้อยเพื่อให้ Demo แสดง Loading state ได้สมจริง
 *
 * ⚠️ ข้อมูลหัวหน้าทัวร์ **คงอยู่จริง** หลังรีเฟรช — saveLeader เขียนลง leader-storage (localStorage)
 *    และ loadAll ทาบส่วนที่บันทึกไว้ลงบนข้อมูลนำเข้า จึงเป็นแหล่งข้อมูลเดียวของทุกหน้า
 *    (ส่วนอื่น เช่น งาน/ใบเบิก ยังเป็น in-memory ตามเดิม)
 */

import {
  appointments as seedAppointments,
  countries as seedCountries,
  expenses as seedExpenses,
  jobs as seedJobs,
  masterData as seedMaster,
  settlements as seedSettlements,
  tourRoutes as seedRoutes,
} from '@/data';
import type {
  Appointment,
  CashCustodyBatch,
  Country,
  ExpenseRequest,
  MasterItem,
  MasterKey,
  Settlement,
  TourJob,
  TourLeader,
  TourRoute,
} from '@/types';
import { createLeaderCodeAllocator } from '@/modules/tour-leaders/utils';
import { TOUR_LEADER_PROFILES } from '@/data/leaders/tourLeaderMaster.seed';
import { profileToTourLeader } from '@/data/leaders/adapter';
import { loadLeaderRecords, mergeLeaderRecords, upsertLeaderRecord } from './leader-storage';
import type { DataSnapshot, TourLeaderService } from './types';

/** หัวหน้าทัวร์จริง (นำเข้าจากไฟล์ tour-leader-name.xlsx) ผ่าน Tour Leader Master → โมเดลที่ระบบใช้ */
const importedLeaders = TOUR_LEADER_PROFILES.map((p, i) => profileToTourLeader(p, i));

/**
 * รายชื่อหัวหน้าทัวร์ที่เป็นจริง ณ ขณะนี้ = ข้อมูลนำเข้า + ส่วนที่ผู้ใช้เพิ่ม/แก้ไว้
 * ทุกจุดในไฟล์นี้ต้องอ่านผ่านฟังก์ชันนี้ เพื่อให้ทุกหน้าเห็นข้อมูลชุดเดียวกัน
 */
function currentLeaders(): TourLeader[] {
  return mergeLeaderRecords(importedLeaders, loadLeaderRecords());
}

/** หน่วงเวลาจำลองการเรียก API */
const delay = (ms = 450) => new Promise((resolve) => setTimeout(resolve, ms));

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

let counters: Record<string, number> = {};

/**
 * ตัวจ่ายรหัสหัวหน้าทัวร์ที่ฝั่ง service (จำลองเซิร์ฟเวอร์)
 * เก็บชุดรหัสที่ถูกใช้/จองไว้ เพื่อออกรหัสถัดไปแบบไม่ซ้ำและกันการชนกันเมื่อบันทึกพร้อมกัน
 * ตั้งต้นจาก "รหัสที่มีอยู่จริงทั้งหมด" (นำเข้า + ที่บันทึกไว้) ไม่ใช่ข้อมูลตัวอย่าง
 * → รหัสใหม่ไม่ชนกับรายการเดิม และไม่ออกรหัสเดิมซ้ำหลังรีเฟรชหน้า
 */
const leaderCodes = createLeaderCodeAllocator(importedLeaders.map((l) => l.id));

const resetCounters = (leaders: TourLeader[]) => {
  counters = {
    TL: leaders.length,
    JOB: seedJobs.length,
    EXP: seedExpenses.length,
    STL: seedSettlements.length,
    APT: seedAppointments.length,
  };
  leaderCodes.reset(leaders.map((l) => l.id));
};
resetCounters(importedLeaders);

export const mockService: TourLeaderService = {
  async loadAll(): Promise<DataSnapshot> {
    await delay(300);
    const leaders = currentLeaders();
    resetCounters(leaders);
    return {
      // ข้อมูลหัวหน้าทัวร์จริงจากไฟล์นำเข้า (Tour Leader Master) ทาบด้วยส่วนที่ผู้ใช้เพิ่ม/แก้ไว้
      // — ไม่ใช่ข้อมูลตัวอย่าง · ไม่ Seed demo กลับ (§19/§20) · ข้อมูลที่บันทึกไว้ไม่หายหลังรีเฟรช
      tourLeaders: clone(leaders),
      jobs: clone(seedJobs),
      expenses: clone(seedExpenses),
      settlements: clone(seedSettlements),
      appointments: clone(seedAppointments),
      masterData: clone(seedMaster),
      countries: clone(seedCountries),
      tourRoutes: clone(seedRoutes),
    };
  },

  async listLeaders(): Promise<TourLeader[]> {
    return clone(currentLeaders());
  },

  /**
   * บันทึกลง storage **ก่อน** หน่วงเวลา → ถ้าเขียนไม่สำเร็จจะ throw ทันที
   * ผู้เรียกจึงไม่มีทางแสดงข้อความ "บันทึกสำเร็จ" ทั้งที่ข้อมูลยังไม่ถูกบันทึกจริง
   * upsert ตาม id → กดบันทึกซ้ำกี่ครั้งก็ไม่เกิดรายการซ้ำ
   */
  async saveLeader(leader: TourLeader) {
    const rows = upsertLeaderRecord(leader);
    // จองรหัสที่เพิ่งใช้ไว้ทันที (เพิ่มเข้าชุดเดิม ไม่ล้างรหัสที่จองค้างอยู่)
    leaderCodes.add(rows.map((l) => l.id));
    await delay();
    return leader;
  },
  async saveJob(job: TourJob) {
    await delay();
    return job;
  },
  async saveExpense(expense: ExpenseRequest) {
    await delay();
    return expense;
  },
  async saveSettlement(settlement: Settlement) {
    await delay();
    return settlement;
  },
  async saveAppointment(appointment: Appointment) {
    await delay();
    return appointment;
  },
  async saveCustodyBatch(batch: CashCustodyBatch) {
    await delay();
    return batch;
  },
  async saveMasterItem(_key: MasterKey, item: MasterItem) {
    await delay(250);
    return item;
  },
  async saveCountry(country: Country) {
    await delay(250);
    return country;
  },
  async saveRoute(route: TourRoute) {
    await delay(250);
    return route;
  },
  async nextId(prefix) {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    const n = counters[prefix];
    if (prefix === 'TL') return `TL-${String(n).padStart(4, '0')}`;
    return `${prefix}-2026-${String(n).padStart(3, '0')}`;
  },

  async allocateLeaderCode() {
    // ซิงก์รหัสที่มีอยู่จริง (รวมที่บันทึกจากแท็บอื่น) แบบเพิ่มเข้าไป — ไม่ล้างรหัสที่จองค้างไว้
    // จากนั้นจองรหัสแบบ synchronous "ก่อน" await → คำขอที่บันทึกพร้อมกันจะไม่ได้รหัสซ้ำ
    leaderCodes.add(currentLeaders().map((l) => l.id));
    const code = leaderCodes.allocate();
    await delay(200);
    return code;
  },
};
