/**
 * Repository ของหัวหน้าทัวร์ — ชั้นกลางระหว่าง UI กับแหล่งข้อมูล
 *
 * ตอนนี้เขียนทับ record ใน memory ผ่าน `service` (mock)
 * เมื่อต่อ API จริง: แทนที่ `service` ด้วย apiService — ชั้นนี้และ Component ไม่ต้องแก้
 *
 * ⚠️ ชั้นนี้ไม่มี React และไม่มี UI — ทดสอบแยกได้
 */

import { service } from '@/services';
import type { Country, TourLeader, TourRoute } from '@/types';
import { buildAuditEntries } from './audit';
import type { LeaderFormState } from './mappers';
import { formToLeader } from './mappers';
import { generateLeaderCode, isLeaderCodeUnique } from './utils';

export interface SaveLeaderInput {
  form: LeaderFormState;
  /** record เดิม (undefined = สร้างใหม่) */
  existing?: TourLeader;
  countries: Country[];
  routes: TourRoute[];
  actor: string;
  now: string;
  today: string;
  reason?: string;
}

export interface SaveLeaderResult {
  leader: TourLeader;
  isNew: boolean;
  /** จำนวนรายการประวัติที่ถูกบันทึกเพิ่ม */
  auditCount: number;
}

export const tourLeaderRepository = {
  nextCode(existing: TourLeader[]): string {
    return generateLeaderCode(existing);
  },

  isCodeUnique(code: string, existing: TourLeader[], ignoreId?: string): boolean {
    return isLeaderCodeUnique(code, existing, ignoreId);
  },

  /**
   * บันทึกหัวหน้าทัวร์ (สร้างใหม่หรือแก้ไข)
   * — แปลงฟอร์มเป็น record
   * — สร้างประวัติการเปลี่ยนแปลงจากการ diff
   * — เก็บข้อมูลสะสม (คะแนน/ประวัติงาน/การประเมิน) ไว้ครบ ไม่ถูกเขียนทับ
   */
  async save(input: SaveLeaderInput): Promise<SaveLeaderResult> {
    const { form, existing, countries, routes, actor, now, today, reason } = input;

    /**
     * รหัสหัวหน้าทัวร์ของรายการใหม่ต้องออกจากฝั่ง service (จำลองเซิร์ฟเวอร์) เท่านั้น
     * ไม่ใช้ค่าที่แสดงบนหน้าจอ เพื่อกันรหัสซ้ำเมื่อผู้ใช้หลายคนบันทึกพร้อมกัน
     * ส่วนการแก้ไขรายการเดิมคงรหัสเดิมไว้เสมอ
     */
    const formToBuild = existing ? form : { ...form, id: await service.allocateLeaderCode() };

    const built = formToLeader(formToBuild, { existing, routes, actor, now, today });

    const auditEntries = buildAuditEntries(existing, built, {
      countries,
      routes,
      actor,
      now,
      reason,
    });

    const leader: TourLeader = {
      ...built,
      auditLog: [...auditEntries, ...built.auditLog],
    };

    await service.saveLeader(leader);

    return { leader, isNew: !existing, auditCount: auditEntries.length };
  },

  /** ปิด/เปิดใช้งานข้อมูล (ไม่ลบถาวร) */
  async setActive(
    leader: TourLeader,
    active: boolean,
    ctx: { actor: string; now: string; reason?: string; countries: Country[]; routes: TourRoute[] },
  ): Promise<TourLeader> {
    const next: TourLeader = {
      ...leader,
      active,
      updatedAt: ctx.now,
      updatedBy: ctx.actor,
    };
    const entries = buildAuditEntries(leader, next, {
      countries: ctx.countries,
      routes: ctx.routes,
      actor: ctx.actor,
      now: ctx.now,
      reason: ctx.reason,
    });
    const withAudit: TourLeader = { ...next, auditLog: [...entries, ...leader.auditLog] };
    await service.saveLeader(withAudit);
    return withAudit;
  },

};
