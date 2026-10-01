/**
 * Adapter: TourLeaderProfile (Master) → TourLeader (โมเดลที่เมนู/ตารางจัด/ปฏิทินใช้อยู่)
 *
 * • อ้างอิงด้วย tourLeaderId (= TourLeader.id) เท่านั้น (§1/§14)
 * • ไม่นำข้อมูลเอกสารสำคัญ (passport/personalID/dob/placeOfBirth) มาใส่โมเดลทั่วไป (§2/§8)
 *   — ข้อมูลเหล่านั้นอยู่ใน TourLeaderIdentityDocument แยกต่างหาก เข้าถึงผ่าน Service ที่ตรวจสิทธิ์
 * • ความสามารถ/ภาษา/ประสบการณ์เว้นว่าง (§13) — ให้ผู้ดูแลเพิ่มภายหลัง
 */

import type { Gender, TourLeader } from '@/types';
import type { TourLeaderProfile } from './masterTypes';

const AVATAR_COLORS = ['bg-slate-600', 'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600', 'bg-rose-600', 'bg-teal-600', 'bg-indigo-600'];

function genderOf(raw: string): Gender {
  const g = (raw || '').trim().toUpperCase();
  if (g === 'M') return 'male';
  if (g === 'F') return 'female';
  return 'unspecified';
}

function initials(p: TourLeaderProfile): string {
  const th = (p.firstNameTH ?? '').slice(0, 1) + (p.lastNameTH ?? '').slice(0, 1);
  if (th.trim()) return th;
  return ((p.firstNameEN ?? '?').slice(0, 1) + (p.lastNameEN ?? '').slice(0, 1)).toUpperCase();
}

export function profileToTourLeader(p: TourLeaderProfile, index = 0): TourLeader {
  const phone = p.contactNumberRaw ?? p.contactNumberNormalized;
  return {
    id: p.tourLeaderId, // = tourLeaderId (PK เดียวที่ระบบอ้างอิง)
    title: p.titleNameTH ?? '',
    firstName: p.firstNameTH ?? '',
    lastName: p.lastNameTH ?? '',
    firstNameEn: p.firstNameEN ?? '',
    lastNameEn: p.lastNameEN ?? '',
    nickname: p.nickName ?? '',
    gender: genderOf(p.gender),
    birthDate: '', // เก็บวันเกิดจริงไว้ใน IdentityDocument เท่านั้น (§2/§8)
    nationalityCountryId: p.countryCode === 'THA' ? 'C-TH' : 'C-TH',
    avatarInitials: initials(p),
    avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
    photoUrl: null,
    // สถานะการใช้งานเป็นแหล่งความจริง · active เป็นค่าสะท้อน
    usageStatus: p.activeStatus === 'ACTIVE' ? 'active' : 'ended',
    active: p.activeStatus === 'ACTIVE',

    leaderType: 'general',
    typeStartDate: p.importedAt.slice(0, 10),
    typeHistory: [],
    joinedAt: p.importedAt.slice(0, 10),
    availableStartDate: p.importedAt.slice(0, 10),
    availabilityMode: 'contact_first',
    source: p.sourceFileName,
    compensationNote: '',
    availabilityNote: '',
    typeNote: '',
    // §12 statusNeedsReview → เริ่มเป็น available แต่ต้องให้ผู้ดูแลยืนยันจริง
    status: 'available',

    contacts: phone ? [{ id: `${p.tourLeaderId}-CC1`, type: 'phone', value: phone, isPrimary: true }] : [],
    languages: [],
    assignedCountries: [],
    routeSkills: [],
    tourSkills: [],
    employmentHistory: [],

    documents: [],
    bankAccounts: [],
    address: { houseNo: '', countryId: 'C-TH' },
    emergencyContacts: [],
    generalNote: '',
    internalNote: p.statusNeedsReview ? 'นำเข้าจากไฟล์ — โปรดตรวจสอบสถานะการทำงานและความพร้อมจริง' : '',
    cautions: '',

    rating: 0,
    totalJobs: 0,
    totalDays: 0,
    evaluations: [],
    auditLog: [],

    createdAt: p.importedAt,
    createdBy: 'นำเข้าจากไฟล์',
    updatedAt: p.updatedAt,
    updatedBy: 'นำเข้าจากไฟล์',
  };
}
