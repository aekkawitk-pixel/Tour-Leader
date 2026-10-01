/**
 * Group Expertise Store (§8) — ประเภทกรุ๊ปที่ถนัดต่อหัวหน้าทัวร์ 1 คน
 * เก็บใน localStorage แยกตาม tourLeaderId (เทียบเท่าตาราง tour_leader_group_expertise)
 * unique = tour_leader_id + group_expertise_type_id (§8) — เก็บเป็น array ที่ normalize แล้ว
 */

import { normalizeGroupExpertise, type GroupExpertiseCode } from '@/lib/logic/groupExpertise';
import { readJson, writeJson } from './browserStorage';

const KEY = 'tourLeaderGroupExpertise';

function loadAll(): Record<string, GroupExpertiseCode[]> {
  const parsed = readJson<Record<string, GroupExpertiseCode[]>>(KEY, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

/** เขียนไม่สำเร็จ → โยน StorageWriteError (UI ต้องไม่ขึ้นว่าบันทึกสำเร็จ) */
function saveAll(map: Record<string, GroupExpertiseCode[]>): void {
  writeJson(KEY, map);
}

export function getGroupExpertise(tourLeaderId: string): GroupExpertiseCode[] {
  return normalizeGroupExpertise(loadAll()[tourLeaderId] ?? []);
}

/** บันทึก (normalize กันซ้ำ ALL+เฉพาะ §8) */
export function saveGroupExpertise(tourLeaderId: string, codes: GroupExpertiseCode[]): GroupExpertiseCode[] {
  const map = loadAll();
  const norm = normalizeGroupExpertise(codes);
  if (norm.length === 0) delete map[tourLeaderId];
  else map[tourLeaderId] = norm;
  saveAll(map);
  return norm;
}
