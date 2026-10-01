/**
 * จุดรวมข้อมูลจำลองทั้งหมด
 * ⚠️ ทุกอย่างในโฟลเดอร์ src/data เป็นข้อมูลสำหรับ Demo เท่านั้น
 * เมื่อเปลี่ยนไปใช้ API จริง ให้แทนที่ mockService ด้วย implementation ใหม่ — Component ไม่ต้องแก้
 */

import type { Notification } from '@/types';

export {
  masterData,
  MASTER_GROUP_LABEL,
  MASTER_EXTRA_LABEL,
  ALL_CUSTOMER_GROUPS_CODE,
  ALL_WORK_SKILLS_CODE,
} from './master';
export { countries, tourRoutes } from './geo';
export {
  airports,
  airportsOfCountry,
  airportByIata,
  airportRoutes,
  dedupeAirports,
  AIRPORT_SEED,
  AIRPORT_SEED_VERSION,
} from './airports';
export {
  ISO_COUNTRY_SEED,
  COUNTRY_SEED_VERSION,
  upsertCountries,
  buildSeedCountries,
  sortCountries,
  countryFromSeed,
  countryIdOf,
  alpha2Of,
  type CountrySeed,
} from './countryMaster';
export { demoUsers, DEFAULT_USER_ID } from './users';
export { tourLeaders } from './tourLeaders';
export { jobs, DEMO_TODAY } from './jobs';
export { expenses } from './expenses';
export { settlements } from './settlements';
export { appointments } from './appointments';
export { leaderAvailabilityRecords } from './leaderAvailability';
export { groupBudgetsSeed } from './groupBudgets.seed';

// การแจ้งเตือนตัวอย่าง (Demo) ที่อ้างอิงหัวหน้าทัวร์/งานตัวอย่าง ถูกล้างออกแล้ว
// โครงสร้าง/ชนิดข้อมูลคงไว้ · การแจ้งเตือนจริงจะถูกสร้างจากเหตุการณ์ในระบบ (ไม่ Seed กลับ)
export const notifications: Notification[] = [];
