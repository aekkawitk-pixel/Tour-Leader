/**
 * ข้อมูลความเชี่ยวชาญของหัวหน้าทัวร์ สำหรับแสดงในคอลัมน์ "หัวหน้าทัวร์" (ตารางจัดหัวหน้าทัวร์)
 *
 * ดึงจากโมเดล TourLeader (Many-to-Many ผ่าน id ของ Master — ไม่ใช่ข้อความคั่น comma):
 *   • ประเทศ/เส้นทาง = assignedCountries + routeSkills (Country/Route Master)
 *   • ประเภททัวร์/กลุ่มลูกค้า = tourSkills (customer_group) (Customer Group Master)
 *   • ทักษะ/ความถนัด = languages + tourSkills (work_skill) (Skill Master)
 * หัวหน้าทัวร์ที่นำเข้าจากไฟล์ยังไม่มีข้อมูลเหล่านี้ (ค่าว่าง) — ให้ผู้ดูแลเพิ่มภายหลัง (§11)
 */

import type { Country, TourLeader, TourRoute } from '@/types';
import { expertCountries, coveredRoutes } from '@/lib/logic/leaderProfile';

export interface LeaderExpertise {
  displayName: string; // ชื่อ–นามสกุล (ชื่อเล่น)
  fullName: string; // สำหรับ tooltip
  countries: string[];
  routes: string[];
  countryRoutes: string[]; // ประเทศก่อน แล้วเส้นทาง (สำหรับบรรทัด 2)
  tourTypes: string[]; // ประเภททัวร์/กลุ่มลูกค้า
  skills: string[]; // ทักษะ/ความถนัด (ภาษา + work_skill)
  specialSkills: string[]; // ความถนัดพิเศษ (work_skill)
}

/** ชื่อที่แสดง: "ชื่อ นามสกุล (ชื่อเล่น)" — ใช้ชื่อไทยเป็นหลัก */
export function leaderDisplayName(leader: Pick<TourLeader, 'firstName' | 'lastName' | 'nickname' | 'id'>): string {
  const name = `${leader.firstName} ${leader.lastName}`.trim() || leader.id;
  return leader.nickname ? `${name} (${leader.nickname})` : name;
}

export function getLeaderExpertise(leader: TourLeader, countries: Country[], routes: TourRoute[]): LeaderExpertise {
  const countryLabels = expertCountries(leader, countries).map((c) => c.label);
  const routeLabels = coveredRoutes(leader, routes).map((r) => r.nameTh).filter(Boolean);
  const tourTypes = leader.tourSkills.filter((s) => s.category === 'customer_group').map((s) => s.name);
  const workSkills = leader.tourSkills.filter((s) => s.category === 'work_skill').map((s) => s.name);
  const languages = leader.languages.map((l) => l.languageName);
  return {
    displayName: leaderDisplayName(leader),
    fullName: `${leader.firstName} ${leader.lastName}`.trim() || leader.id,
    countries: countryLabels,
    routes: routeLabels,
    countryRoutes: [...countryLabels, ...routeLabels],
    tourTypes,
    skills: [...languages, ...workSkills],
    specialSkills: workSkills,
  };
}
