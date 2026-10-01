/**
 * MatchingRuleService (§13/§15) — หลักเกณฑ์การ Map หัวหน้าทัวร์เป็น "ข้อมูล" (ไม่ hardcode ใน UI)
 *
 * v1: มี Rule Set เดียวที่ Active (DEFAULT_RULE_SET) เข้ารหัสเกณฑ์ปัจจุบันเป็น data
 *   • Required — เงื่อนไขบังคับ (ไม่ผ่าน = เลือกไม่ได้)
 *   • Score    — เกณฑ์ให้คะแนน (น้ำหนักตาม WEIGHTS ของ matching.ts)
 *   • Warning  — เตือนแต่ยังเลือกได้ (ต้องยืนยัน/ระบุเหตุผล)
 * โครงสร้างพร้อมขยาย: เปิด/ปิด rule, กำหนดน้ำหนัก/คะแนนเต็ม/ลำดับ, เงื่อนไขตามประเทศ/เส้นทาง/ภาษา,
 * หลาย Rule Set + version + ช่วงวันที่ (ยังไม่มี UI จัดการใน v1 — §13)
 */

import type { MatchingRule, MatchingRuleSet, MatchingRuleType } from '@/types';
import { WEIGHTS } from './matching';

const STAMP = '2026-01-01T00:00';

function rule(
  ruleCode: string,
  ruleName: string,
  ruleType: MatchingRuleType,
  ruleGroup: string,
  description: string,
  extra: Partial<MatchingRule> = {},
): MatchingRule {
  return {
    id: `MR-${ruleCode}`,
    ruleSetId: 'RS-DEFAULT',
    ruleCode,
    ruleName,
    ruleType,
    ruleGroup,
    description,
    weight: extra.weight ?? 0,
    maximumScore: extra.maximumScore ?? 0,
    isRequired: ruleType === 'required',
    isActive: extra.isActive ?? true,
    priority: extra.priority ?? 0,
    configuration: extra.configuration,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

/** เกณฑ์เริ่มต้น (v1) — เข้ารหัส Required/Score/Warning ปัจจุบันเป็นข้อมูล */
export const DEFAULT_RULE_SET: MatchingRuleSet = {
  id: 'RS-DEFAULT',
  ruleSetCode: 'DEFAULT',
  ruleSetName: 'เกณฑ์มาตรฐาน v1',
  version: 1,
  isActive: true,
  effectiveFrom: '2026-01-01',
  rules: [
    // ---------- Required (เงื่อนไขบังคับ §5) ----------
    rule('REQ_ACTIVE', 'สถานะใช้งาน (Active)', 'required', 'status', 'หัวหน้าทัวร์ต้องเปิดใช้งาน', { priority: 1 }),
    rule('REQ_NOT_SUSPENDED', 'ไม่ถูกระงับการใช้งาน', 'required', 'status', 'ผู้ถูกระงับการใช้งานเลือกไม่ได้เด็ดขาด (ห้าม override)', { priority: 2 }),
    rule('REQ_STATUS_AVAILABLE', 'ไม่อยู่ในสถานะพักงาน/ไม่พร้อม', 'required', 'status', 'ไม่อยู่ในสถานะ พักการใช้งาน/ไม่ใช้งาน/ระงับ', { priority: 3 }),
    rule('REQ_NO_TIME_CONFLICT', 'ไม่มีงานทับซ้อนตามวัน–เวลา', 'required', 'availability', 'ตรวจด้วยวันและเวลาจริง (งาน/วันลา/ติดงานบริษัท/ไม่พร้อม/นัดหมาย)', { priority: 4 }),
    rule('REQ_NOT_BACKDATED', 'ไม่มอบหมายย้อนหลัง', 'required', 'availability', 'โปรแกรมที่เริ่มเดินทางแล้วมอบหมายไม่ได้', { priority: 5 }),

    // ---------- Score (เกณฑ์ให้คะแนน §6) ----------
    rule('SCORE_ROUTE', 'ประสบการณ์ประเทศ/เส้นทาง', 'score', 'route', 'เคยทำประเทศ/เส้นทางของงานนี้', { weight: WEIGHTS.route, maximumScore: WEIGHTS.route, priority: 10 }),
    rule('SCORE_LANGUAGE', 'ภาษาที่เหมาะกับงาน', 'score', 'language', 'ภาษาที่ใช้ในประเทศปลายทาง', { weight: WEIGHTS.language, maximumScore: WEIGHTS.language, priority: 11 }),
    rule('SCORE_GROUP', 'ความถนัดประเภทกรุ๊ป', 'score', 'group', 'ความถนัดตามประเภทกรุ๊ปลูกค้า', { weight: WEIGHTS.tourSkill, maximumScore: WEIGHTS.tourSkill, priority: 12 }),
    rule('SCORE_RATING', 'คะแนนประเมิน', 'score', 'rating', 'คะแนนประเมินการทำงานเฉลี่ย', { weight: WEIGHTS.rating, maximumScore: WEIGHTS.rating, priority: 13 }),
    rule('SCORE_STATUS', 'สถานะพร้อมรับงาน', 'score', 'status', 'สถานะพร้อมรับงานได้คะแนนเต็ม', { weight: WEIGHTS.availability, maximumScore: WEIGHTS.availability, priority: 14 }),
    rule('SCORE_NO_CONFLICT', 'ไม่มีตารางงานซ้อน', 'score', 'availability', 'ไม่มีงานอื่นทับช่วงเวลา', { weight: WEIGHTS.noConflict, maximumScore: WEIGHTS.noConflict, priority: 15 }),

    // ---------- Warning (เตือนแต่เลือกได้ §5/§7) ----------
    rule('WARN_SAME_DAY', 'วันเดียวกับวันลา/นัดหมาย', 'warning', 'availability', 'อยู่วันเดียวกับช่วงไม่ว่างแต่คนละเวลา — ควรตรวจสอบ', { priority: 20 }),
    rule('WARN_INSUFFICIENT_REST', 'เวลาพักระหว่างงานไม่พอ', 'warning', 'rest', 'พักจากงานก่อนหน้า/ก่อนงานถัดไปไม่เพียงพอ', { priority: 21 }),
    rule('WARN_NO_START_TIME', 'ยังไม่ระบุเวลาเริ่มงาน', 'warning', 'availability', 'ตรวจการทับซ้อนของเวลาได้ไม่ครบถ้วน', { priority: 22 }),
    rule('WARN_PASSPORT', 'เอกสารเดินทางใกล้หมดอายุ', 'warning', 'document', 'หนังสือเดินทางเหลือ < 6 เดือน ณ วันเดินทาง', { priority: 23 }),
  ],
  createdAt: STAMP,
  updatedAt: STAMP,
};

const RULE_SETS: MatchingRuleSet[] = [DEFAULT_RULE_SET];

/** Rule Set ที่ Active (v1 มีชุดเดียว) */
export function getActiveRuleSet(): MatchingRuleSet {
  return RULE_SETS.find((rs) => rs.isActive) ?? DEFAULT_RULE_SET;
}

export function activeScoreRules(ruleSet: MatchingRuleSet): MatchingRule[] {
  return ruleSet.rules.filter((r) => r.ruleType === 'score' && r.isActive);
}

export function activeRequiredRules(ruleSet: MatchingRuleSet): MatchingRule[] {
  return ruleSet.rules.filter((r) => r.ruleType === 'required' && r.isActive);
}

/** คะแนนเต็มรวมของ Rule Set (ผลรวม maximumScore ของ score rules ที่เปิดใช้) */
export function ruleSetMaxScore(ruleSet: MatchingRuleSet): number {
  return activeScoreRules(ruleSet).reduce((sum, r) => sum + r.maximumScore, 0);
}
