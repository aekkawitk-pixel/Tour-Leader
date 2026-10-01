/**
 * Expertise Scope Store (§15) — ความเชี่ยวชาญ โซน→ประเทศ→เส้นทาง ต่อหัวหน้าทัวร์ 1 คน
 * เก็บใน localStorage แยกตาม tourLeaderId (เทียบเท่าตาราง tour_leader_expertise_scopes)
 * เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 */

import type { ExpertiseScope } from '@/lib/logic/expertiseScope';
import { readJson, writeJson } from './browserStorage';

const KEY = 'tourLeaderExpertiseScopes';

function loadAll(): Record<string, ExpertiseScope[]> {
  const parsed = readJson<Record<string, ExpertiseScope[]>>(KEY, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

/** เขียนไม่สำเร็จ → โยน StorageWriteError (UI ต้องไม่ขึ้นว่าบันทึกสำเร็จ) */
function saveAll(map: Record<string, ExpertiseScope[]>): void {
  writeJson(KEY, map);
}

/** ความเชี่ยวชาญของหัวหน้าทัวร์ (เรียงตาม displayOrder) */
export function getExpertiseScopes(tourLeaderId: string): ExpertiseScope[] {
  return [...(loadAll()[tourLeaderId] ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
}

/** บันทึกทั้งชุด (จัด displayOrder ใหม่ให้ต่อเนื่องตามลำดับที่ส่งมา) */
export function saveExpertiseScopes(tourLeaderId: string, scopes: ExpertiseScope[]): ExpertiseScope[] {
  const map = loadAll();
  map[tourLeaderId] = scopes.map((s, i) => ({ ...s, displayOrder: i }));
  saveAll(map);
  return getExpertiseScopes(tourLeaderId);
}
