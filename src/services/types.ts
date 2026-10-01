/**
 * Service interface — สัญญาการเรียกข้อมูลของทั้งระบบ
 *
 * ปัจจุบันมี implementation เดียวคือ `mockService` (อ่าน/เขียนใน memory)
 * เมื่อจะต่อ Backend จริง ให้เขียน `apiService` ที่ implement interface นี้
 * แล้วสลับใน src/services/index.ts — Component และ Context ไม่ต้องแก้เลย
 */

import type {
  Appointment,
  CashCustodyBatch,
  Country,
  ExpenseRequest,
  MasterDataMap,
  MasterItem,
  MasterKey,
  Settlement,
  TourJob,
  TourLeader,
  TourRoute,
} from '@/types';

export interface DataSnapshot {
  tourLeaders: TourLeader[];
  jobs: TourJob[];
  expenses: ExpenseRequest[];
  settlements: Settlement[];
  appointments: Appointment[];
  masterData: MasterDataMap;
  /** Master Data ลำดับชั้น: ประเทศ → เส้นทาง */
  countries: Country[];
  tourRoutes: TourRoute[];
}

export interface TourLeaderService {
  /** โหลดข้อมูลทั้งหมดครั้งเดียวตอนเปิด Demo */
  loadAll(): Promise<DataSnapshot>;

  /**
   * รายชื่อหัวหน้าทัวร์ล่าสุดจากแหล่งข้อมูล (ไม่โหลดส่วนอื่นซ้ำ)
   * ใช้ซิงก์เมื่อข้อมูลถูกแก้จากแท็บอื่น
   */
  listLeaders(): Promise<TourLeader[]>;

  /**
   * บันทึกหัวหน้าทัวร์ (สร้างใหม่หรือแก้ไข — upsert ตาม id)
   * ต้องคงอยู่หลังรีเฟรชหน้า · บันทึกไม่สำเร็จให้ throw พร้อมสาเหตุจริง
   */
  saveLeader(leader: TourLeader): Promise<TourLeader>;
  saveJob(job: TourJob): Promise<TourJob>;
  saveExpense(expense: ExpenseRequest): Promise<ExpenseRequest>;
  saveSettlement(settlement: Settlement): Promise<Settlement>;
  saveAppointment(appointment: Appointment): Promise<Appointment>;
  saveMasterItem(key: MasterKey, item: MasterItem): Promise<MasterItem>;
  saveCountry(country: Country): Promise<Country>;
  saveRoute(route: TourRoute): Promise<TourRoute>;
  saveCustodyBatch(batch: CashCustodyBatch): Promise<CashCustodyBatch>;

  /** ออกเลขที่เอกสารถัดไป เช่น JOB-2026-015 */
  nextId(prefix: 'TL' | 'JOB' | 'EXP' | 'STL' | 'APT' | 'CUST'): Promise<string>;

  /**
   * ออกรหัสหัวหน้าทัวร์จริงที่ฝั่งเซิร์ฟเวอร์ เช่น TL-0013
   * ตรวจรหัสล่าสุดจากแหล่งข้อมูลแล้วเพิ่มลำดับขึ้น 1 และจองไว้ทันที
   * เพื่อกันรหัสซ้ำเมื่อมีการบันทึกพร้อมกัน — ไม่พึ่งค่าจากหน้าจอ
   */
  allocateLeaderCode(): Promise<string>;
}
