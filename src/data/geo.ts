/**
 * ⚠️ ข้อมูลจำลองสำหรับ Demo เท่านั้น
 * Master Data: ประเทศ และเส้นทาง (ภูมิภาค / เมือง / สนามบิน / เส้นทางทัวร์)
 *
 * โครงสร้างลำดับชั้น:
 *   ประเทศ
 *    ├─ ทุกเส้นทางในประเทศ (coverage = all_routes ที่ฝั่งหัวหน้าทัวร์)
 *    └─ เฉพาะเส้นทาง (coverage = selected_routes)
 *        ├─ ภูมิภาค (region)
 *        ├─ เมือง (city)
 *        ├─ สนามบิน (airport)
 *        └─ เส้นทางทัวร์ (tour_route)
 */

import type { Country, TourRoute } from '@/types';
import { buildSeedCountries } from './countryMaster';
import { airportRoutes } from './airports';

/**
 * ประเทศที่ระบบ Demo เคยใช้และมีข้อมูลอ้างถึง id เหล่านี้อยู่แล้ว
 * (เส้นทางทัวร์ด้านล่าง · สัญชาติ/ประเทศผู้ออกเอกสารของหัวหน้าทัวร์)
 * — คงไว้เพื่อไม่ให้การ seed ทับหรือทำให้ id เดิมหาย (buildSeedCountries จะเติมข้อมูล
 *   มาตรฐาน alpha-3 / ภูมิภาค / รหัสโทร ให้เอง และผสานประเทศ ISO ที่เหลือเข้ามา)
 */
const LEGACY_COUNTRIES: Country[] = [
  { id: 'C-TH', code: 'TH', nameTh: 'ไทย', nameEn: 'THAILAND', isActive: true },
  { id: 'C-JP', code: 'JP', nameTh: 'ญี่ปุ่น', nameEn: 'JAPAN', isActive: true },
  { id: 'C-KR', code: 'KR', nameTh: 'เกาหลีใต้', nameEn: 'SOUTH KOREA', isActive: true },
  { id: 'C-CN', code: 'CN', nameTh: 'จีน', nameEn: 'CHINA', isActive: true },
  { id: 'C-TW', code: 'TW', nameTh: 'ไต้หวัน', nameEn: 'TAIWAN', isActive: true },
  { id: 'C-VN', code: 'VN', nameTh: 'เวียดนาม', nameEn: 'VIETNAM', isActive: true },
  { id: 'C-IT', code: 'IT', nameTh: 'อิตาลี', nameEn: 'ITALY', isActive: true },
  { id: 'C-CH', code: 'CH', nameTh: 'สวิตเซอร์แลนด์', nameEn: 'SWITZERLAND', isActive: true },
  { id: 'C-FR', code: 'FR', nameTh: 'ฝรั่งเศส', nameEn: 'FRANCE', isActive: true },
  { id: 'C-TR', code: 'TR', nameTh: 'ตุรกี', nameEn: 'TURKIYE', isActive: true },
  { id: 'C-GE', code: 'GE', nameTh: 'จอร์เจีย', nameEn: 'GEORGIA', isActive: true },
  { id: 'C-NZ', code: 'NZ', nameTh: 'นิวซีแลนด์', nameEn: 'NEW ZEALAND', isActive: true },
  { id: 'C-AU', code: 'AU', nameTh: 'ออสเตรเลีย', nameEn: 'AUSTRALIA', isActive: true },
];

/**
 * Master ประเทศพร้อมใช้งาน = ข้อมูลเดิม + ประเทศ ISO 3166-1 ทั้งหมด (249 รายการ)
 * เรียงชื่อไทยตามตัวอักษร โดยประเทศไทยอยู่ลำดับต้น
 */
export const countries: Country[] = buildSeedCountries(LEGACY_COUNTRIES);

/**
 * เส้นทางที่ไม่ใช่สนามบิน (ภูมิภาค / เมือง / เส้นทางทัวร์) — คงไว้ตามเดิม
 * ส่วน "สนามบิน" ย้ายไปเป็น Airport Master (src/data/airports.ts) แล้วสร้าง TourRoute
 * ให้อัตโนมัติด้านล่าง โดยคง id เดิมของสนามบินที่ระบบเคยใช้ไว้ครบ
 */
const LEGACY_ROUTES: TourRoute[] = [
  /* ------------------------------- ญี่ปุ่น -------------------------------- */
  { id: 'R-JP-R1', countryId: 'C-JP', routeType: 'region', nameTh: 'คันโต', nameEn: 'Kanto', isActive: true, order: 1 },
  { id: 'R-JP-R2', countryId: 'C-JP', routeType: 'region', nameTh: 'คันไซ', nameEn: 'Kansai', isActive: true, order: 2 },
  { id: 'R-JP-R3', countryId: 'C-JP', routeType: 'region', nameTh: 'ฮอกไกโด', nameEn: 'Hokkaido', isActive: true, order: 3 },
  { id: 'R-JP-A1', countryId: 'C-JP', routeType: 'airport', code: 'NRT', nameTh: 'โตเกียว / นาริตะ', nameEn: 'Tokyo / Narita', isActive: true, order: 4 },
  { id: 'R-JP-A2', countryId: 'C-JP', routeType: 'airport', code: 'HND', nameTh: 'โตเกียว / ฮาเนดะ', nameEn: 'Tokyo / Haneda', isActive: true, order: 5 },
  { id: 'R-JP-A3', countryId: 'C-JP', routeType: 'airport', code: 'KIX', nameTh: 'โอซาก้า / คันไซ', nameEn: 'Osaka / Kansai', isActive: true, order: 6 },
  { id: 'R-JP-A4', countryId: 'C-JP', routeType: 'airport', code: 'CTS', nameTh: 'ฮอกไกโด / นิวชิโตเซะ', nameEn: 'Hokkaido / New Chitose', isActive: true, order: 7 },
  { id: 'R-JP-A5', countryId: 'C-JP', routeType: 'airport', code: 'FUK', nameTh: 'ฟุกุโอกะ', nameEn: 'Fukuoka', isActive: true, order: 8 },
  { id: 'R-JP-A6', countryId: 'C-JP', routeType: 'airport', code: 'NGO', nameTh: 'นาโกย่า / ชูบุ', nameEn: 'Nagoya / Chubu', isActive: true, order: 9 },
  { id: 'R-JP-C1', countryId: 'C-JP', routeType: 'city', nameTh: 'เกียวโต', nameEn: 'Kyoto', isActive: true, order: 10 },
  { id: 'R-JP-T1', countryId: 'C-JP', routeType: 'tour_route', nameTh: 'โตเกียว–ฟูจิ', nameEn: 'Tokyo–Fuji', isActive: true, order: 11 },
  { id: 'R-JP-T2', countryId: 'C-JP', routeType: 'tour_route', nameTh: 'โตเกียว–โอซาก้า', nameEn: 'Tokyo–Osaka', isActive: true, order: 12 },
  { id: 'R-JP-T3', countryId: 'C-JP', routeType: 'tour_route', nameTh: 'โอซาก้า–เกียวโต–นารา', nameEn: 'Osaka–Kyoto–Nara', isActive: true, order: 13 },
  { id: 'R-JP-T4', countryId: 'C-JP', routeType: 'tour_route', nameTh: 'ฮอกไกโดรอบเกาะ', nameEn: 'Hokkaido Loop', isActive: true, order: 14 },

  /* ------------------------------ เกาหลีใต้ ------------------------------ */
  { id: 'R-KR-A1', countryId: 'C-KR', routeType: 'airport', code: 'ICN', nameTh: 'โซล / อินชอน', nameEn: 'Seoul / Incheon', isActive: true, order: 1 },
  { id: 'R-KR-A2', countryId: 'C-KR', routeType: 'airport', code: 'PUS', nameTh: 'ปูซาน / กิมแฮ', nameEn: 'Busan / Gimhae', isActive: true, order: 2 },
  { id: 'R-KR-C1', countryId: 'C-KR', routeType: 'city', nameTh: 'เกาะนามิ', nameEn: 'Nami Island', isActive: true, order: 3 },
  { id: 'R-KR-T1', countryId: 'C-KR', routeType: 'tour_route', nameTh: 'โซล–นามิ–ซูวอน', nameEn: 'Seoul–Nami–Suwon', isActive: true, order: 4 },

  /* --------------------------------- จีน --------------------------------- */
  { id: 'R-CN-A1', countryId: 'C-CN', routeType: 'airport', code: 'CSX', nameTh: 'ฉางซา', nameEn: 'Changsha', isActive: true, order: 1 },
  { id: 'R-CN-A2', countryId: 'C-CN', routeType: 'airport', code: 'PVG', nameTh: 'เซี่ยงไฮ้ / ผู่ตง', nameEn: 'Shanghai / Pudong', isActive: true, order: 2 },
  { id: 'R-CN-A3', countryId: 'C-CN', routeType: 'airport', code: 'PEK', nameTh: 'ปักกิ่ง', nameEn: 'Beijing', isActive: true, order: 3 },
  { id: 'R-CN-T1', countryId: 'C-CN', routeType: 'tour_route', nameTh: 'จางเจียเจี้ย–เฟิ่งหวง', nameEn: 'Zhangjiajie–Fenghuang', isActive: true, order: 4 },

  /* -------------------------------- ไต้หวัน ------------------------------- */
  { id: 'R-TW-A1', countryId: 'C-TW', routeType: 'airport', code: 'TPE', nameTh: 'ไทเป / เถาหยวน', nameEn: 'Taipei / Taoyuan', isActive: true, order: 1 },
  { id: 'R-TW-C1', countryId: 'C-TW', routeType: 'city', nameTh: 'ไถจง', nameEn: 'Taichung', isActive: true, order: 2 },
  { id: 'R-TW-T1', countryId: 'C-TW', routeType: 'tour_route', nameTh: 'ไทเป–ไถจง–อาลีซาน', nameEn: 'Taipei–Taichung–Alishan', isActive: true, order: 3 },

  /* ------------------------------- เวียดนาม ------------------------------- */
  { id: 'R-VN-A1', countryId: 'C-VN', routeType: 'airport', code: 'DAD', nameTh: 'ดานัง', nameEn: 'Da Nang', isActive: true, order: 1 },
  { id: 'R-VN-A2', countryId: 'C-VN', routeType: 'airport', code: 'HAN', nameTh: 'ฮานอย', nameEn: 'Hanoi', isActive: true, order: 2 },
  { id: 'R-VN-T1', countryId: 'C-VN', routeType: 'tour_route', nameTh: 'ดานัง–ฮอยอัน–บานาฮิลล์', nameEn: 'Da Nang–Hoi An–Ba Na Hills', isActive: true, order: 3 },

  /* -------------------------------- อิตาลี -------------------------------- */
  { id: 'R-IT-A1', countryId: 'C-IT', routeType: 'airport', code: 'FCO', nameTh: 'โรม / ฟิวมิชิโน', nameEn: 'Rome / Fiumicino', isActive: true, order: 1 },
  { id: 'R-IT-A2', countryId: 'C-IT', routeType: 'airport', code: 'MXP', nameTh: 'มิลาน / มัลเปนซา', nameEn: 'Milan / Malpensa', isActive: true, order: 2 },
  { id: 'R-IT-T1', countryId: 'C-IT', routeType: 'tour_route', nameTh: 'โรม–ฟลอเรนซ์–เวนิส', nameEn: 'Rome–Florence–Venice', isActive: true, order: 3 },

  /* ---------------------------- สวิตเซอร์แลนด์ ---------------------------- */
  { id: 'R-CH-A1', countryId: 'C-CH', routeType: 'airport', code: 'ZRH', nameTh: 'ซูริก', nameEn: 'Zurich', isActive: true, order: 1 },
  { id: 'R-CH-T1', countryId: 'C-CH', routeType: 'tour_route', nameTh: 'แกรนด์ทัวร์สวิส', nameEn: 'Swiss Grand Tour', isActive: true, order: 2 },

  /* ------------------------------- ฝรั่งเศส ------------------------------- */
  { id: 'R-FR-A1', countryId: 'C-FR', routeType: 'airport', code: 'CDG', nameTh: 'ปารีส / ชาร์ล เดอ โกล', nameEn: 'Paris / Charles de Gaulle', isActive: true, order: 1 },
  { id: 'R-FR-T1', countryId: 'C-FR', routeType: 'tour_route', nameTh: 'ปารีส–นอร์มังดี', nameEn: 'Paris–Normandy', isActive: true, order: 2 },

  /* --------------------------------- ตุรกี -------------------------------- */
  { id: 'R-TR-A1', countryId: 'C-TR', routeType: 'airport', code: 'IST', nameTh: 'อิสตันบูล', nameEn: 'Istanbul', isActive: true, order: 1 },
  { id: 'R-TR-T1', countryId: 'C-TR', routeType: 'tour_route', nameTh: 'อิสตันบูล–คัปปาโดเกีย', nameEn: 'Istanbul–Cappadocia', isActive: true, order: 2 },

  /* ------------------------------- จอร์เจีย ------------------------------- */
  { id: 'R-GE-A1', countryId: 'C-GE', routeType: 'airport', code: 'TBS', nameTh: 'ทบิลิซี', nameEn: 'Tbilisi', isActive: true, order: 1 },
  { id: 'R-GE-T1', countryId: 'C-GE', routeType: 'tour_route', nameTh: 'ทบิลิซี–คาซเบกี', nameEn: 'Tbilisi–Kazbegi', isActive: true, order: 2 },

  /* ------------------------------ นิวซีแลนด์ ------------------------------ */
  { id: 'R-NZ-A1', countryId: 'C-NZ', routeType: 'airport', code: 'CHC', nameTh: 'ไครสต์เชิร์ช', nameEn: 'Christchurch', isActive: true, order: 1 },
  { id: 'R-NZ-C1', countryId: 'C-NZ', routeType: 'city', nameTh: 'ควีนส์ทาวน์', nameEn: 'Queenstown', isActive: true, order: 2 },
  { id: 'R-NZ-T1', countryId: 'C-NZ', routeType: 'tour_route', nameTh: 'เกาะใต้–มิลฟอร์ดซาวด์', nameEn: 'South Island–Milford Sound', isActive: true, order: 3 },

  /* ----------------------------- ออสเตรเลีย ------------------------------ */
  { id: 'R-AU-A1', countryId: 'C-AU', routeType: 'airport', code: 'SYD', nameTh: 'ซิดนีย์', nameEn: 'Sydney', isActive: true, order: 1 },
  { id: 'R-AU-A2', countryId: 'C-AU', routeType: 'airport', code: 'MEL', nameTh: 'เมลเบิร์น', nameEn: 'Melbourne', isActive: true, order: 2 },
];

/**
 * เส้นทางทั้งหมดพร้อมใช้งาน = เส้นทางที่ไม่ใช่สนามบิน (คงเดิม)
 *   + สนามบินทั้งหมดจาก Airport Master (สร้าง TourRoute ให้อัตโนมัติ, คง id เดิม)
 * order ของสนามบินบวก 100 เพื่อให้เรียงต่อจากภูมิภาค/เมือง/เส้นทางทัวร์ในประเทศเดียวกัน
 */
export const tourRoutes: TourRoute[] = [
  ...LEGACY_ROUTES.filter((r) => r.routeType !== 'airport'),
  ...airportRoutes().map((r) => ({ ...r, order: (r.order ?? 0) + 100 })),
];
