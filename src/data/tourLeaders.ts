/**
 * ⚠️ ข้อมูลจำลองสำหรับ Demo เท่านั้น
 * ชื่อบุคคล เบอร์โทร อีเมล บัญชีโซเชียล เลขเอกสาร และบัญชีธนาคารทั้งหมดเป็นข้อมูลสมมติ
 * เลขบัตรประชาชนและเลขบัญชีถูกปิดบังไว้เสมอ (ไม่เก็บข้อมูลส่วนบุคคลจริง)
 *
 * ชุดข้อมูลนี้ครอบคลุมกรณีทดสอบ:
 *   • TL-001 ประจำ · JAPAN "ทุกเส้นทาง" · ดูแล VIP · ประวัติงานย้อนหลังหลายปี
 *   • TL-005 ฟรีแลนซ์ · JAPAN "เฉพาะ NRT" → ต้องไม่ตรงกับการค้นหา KIX
 *   • TL-009 ฟรีแลนซ์ · JAPAN "NRT + KIX" · กรุ๊ปหน้าร้าน + ทำยอดขายเก่ง
 *   • TL-010 ทั่วไป · ญี่ปุ่นเจ้าของภาษา แต่ยังไม่มีประสบการณ์นำทัวร์
 *   • TL-011 ประจำ · "ได้ทุกประเภท" + เชี่ยวชาญประวัติศาสตร์
 *   • TL-012 เอเจนท์ · กรุ๊ปเหมา + เอ็นเตอร์เทนเก่ง
 *   • TL-002 มีตารางงานซ้อน · TL-004 เอกสารใกล้หมดอายุ · TL-007 เอกสารหมดอายุแล้ว
 */

import type {
  AssignedCountry,
  ContactChannel,
  ContactType,
  DocumentKind,
  EmergencyContact,
  EmploymentHistory,
  LanguageSkill,
  LeaderBankAccount,
  LeaderDocument,
  TourLeader,
  TourLeaderRouteSkill,
  TourSkillLevel,
  TourTypeSkill,
} from '@/types';
import { migrateLanguageSkill } from '@/modules/tour-leaders/languageMigration';

/* ------------------------------ ตัวช่วยสร้างข้อมูล ----------------------------- */

let n = 0;
const uid = (prefix: string) => {
  n += 1;
  return `${prefix}-${String(n).padStart(4, '0')}`;
};

const contact = (
  type: ContactType,
  value: string,
  options: Partial<Omit<ContactChannel, 'id' | 'type' | 'value'>> = {},
): ContactChannel => ({
  id: uid('CC'),
  type,
  value,
  isPrimary: options.isPrimary ?? false,
  label: options.label,
  preferredContactTime: options.preferredContactTime,
  note: options.note,
});

/**
 * ระดับที่รับได้ใน seed — รองรับทั้งรหัสมาตรฐานปัจจุบันและสเกล CEFR/6-ขั้นเดิม
 * แปลงผ่าน migrateLanguageSkill ตัวเดียวกับที่ใช้ตอนโหลด/แก้ไขข้อมูลจริง (มาตรฐานที่ถูกต้องตามภาษา
 * มาจากชื่อภาษาที่ให้มา — เดาไม่ตรงกับ Master Data ก็ยังใช้ได้ แค่ตกไป GENERAL)
 *
 * ⚠️ ฟิลด์อื่นนอกจาก isNativeLanguage/note เป็นของรุ่นเดิม (รายทักษะ/ใบรับรอง/ภาษาหลัก) ที่ระบบ
 *    ไม่ใช้แล้ว — เก็บไว้ในชนิดนี้เฉยๆ เพื่อไม่ต้องแก้ทุกจุดที่เรียก ค่าที่ใส่มาจะถูกละเว้นทั้งหมด
 */
type SeedLevel = string;

interface SeedLangOptions {
  isPrimary?: boolean;
  isNativeLanguage?: boolean;
  languageCode?: string;
  listening?: SeedLevel;
  speaking?: SeedLevel;
  reading?: SeedLevel;
  writing?: SeedLevel;
  usageTypes?: string[];
  note?: string;
  certifications?: unknown[];
  hasCertificate?: boolean;
  certificateName?: string;
  score?: string;
  expiresAt?: string | null;
}

const lang = (
  language: string,
  overall: SeedLevel,
  options: SeedLangOptions = {},
): LanguageSkill =>
  migrateLanguageSkill({
    id: uid('LS'),
    language,
    overall,
    isNativeLanguage: options.isNativeLanguage,
  });

const assigned = (
  countryId: string,
  options: Partial<Omit<AssignedCountry, 'id' | 'countryId'>> = {},
): AssignedCountry => ({
  id: uid('AC'),
  countryId,
  isPrimary: options.isPrimary ?? false,
  regionOrCity: options.regionOrCity,
  startDate: options.startDate,
  active: options.active ?? true,
  note: options.note,
});

const allRoutes = (
  countryId: string,
  skillLevel: TourLeaderRouteSkill['skillLevel'],
  options: Partial<Pick<TourLeaderRouteSkill, 'tripCount' | 'lastWorkedAt' | 'note'>> = {},
): TourLeaderRouteSkill => ({
  id: uid('RS'),
  countryId,
  coverage: 'all_routes',
  routeIds: [],
  skillLevel,
  ...options,
});

const someRoutes = (
  countryId: string,
  routeIds: string[],
  skillLevel: TourLeaderRouteSkill['skillLevel'],
  options: Partial<Pick<TourLeaderRouteSkill, 'tripCount' | 'lastWorkedAt' | 'note'>> = {},
): TourLeaderRouteSkill => ({
  id: uid('RS'),
  countryId,
  coverage: 'selected_routes',
  routeIds,
  skillLevel,
  ...options,
});

const skill = (
  category: TourTypeSkill['category'],
  master: { id: string; code: string; name: string },
  level: TourSkillLevel,
  options: Partial<Pick<TourTypeSkill, 'note'>> = {},
): TourTypeSkill => ({
  id: uid('TS'),
  masterId: master.id,
  category,
  code: master.code,
  name: master.name,
  level,
  ...options,
});

const doc = (
  kind: DocumentKind,
  name: string,
  number: string,
  issuedAt: string,
  expiresAt: string | null,
  options: Partial<Pick<LeaderDocument, 'issuingCountryId' | 'fileName' | 'verifyStatus' | 'note'>> = {},
): LeaderDocument => ({
  id: uid('DOC'),
  kind,
  name,
  number,
  issuedAt,
  expiresAt,
  issuingCountryId: options.issuingCountryId ?? 'C-TH',
  fileName: options.fileName ?? 'document_demo.pdf',
  verifyStatus: options.verifyStatus ?? 'verified',
  note: options.note,
});

const bank = (
  bankName: string,
  accountName: string,
  accountNoMasked: string,
  options: Partial<Omit<LeaderBankAccount, 'id' | 'bank' | 'accountName' | 'accountNoMasked'>> = {},
): LeaderBankAccount => ({
  id: uid('BA'),
  bank: bankName,
  accountName,
  accountNoMasked,
  branch: options.branch,
  promptPay: options.promptPay,
  isPrimary: options.isPrimary ?? false,
  active: options.active ?? true,
});

const emergency = (
  name: string,
  relation: string,
  phone: string,
  options: Partial<Omit<EmergencyContact, 'id' | 'name' | 'relation' | 'phone'>> = {},
): EmergencyContact => ({
  id: uid('EC'),
  name,
  relation,
  phone,
  isPrimary: options.isPrimary ?? false,
  otherChannel: options.otherChannel,
  note: options.note,
});

/** ประวัติการทำงานกับสถานประกอบการ (คนละส่วนกับงานทัวร์ที่ได้รับมอบหมาย) */
const job = (
  leaderId: string,
  employerName: string,
  position: string,
  start: [number, number], // [ปี ค.ศ., เดือน]
  end: [number, number] | 'current',
  options: Partial<
    Pick<
      EmploymentHistory,
      'employerPhone' | 'salary' | 'currency' | 'jobDescription' | 'reasonForLeaving' | 'note'
    >
  > = {},
): EmploymentHistory => ({
  id: uid('EH'),
  tourLeaderId: leaderId,
  employerName,
  employerPhone: options.employerPhone,
  salary: options.salary,
  currency: options.currency ?? 'THB',
  startYear: start[0],
  startMonth: start[1],
  endYear: end === 'current' ? undefined : end[0],
  endMonth: end === 'current' ? undefined : end[1],
  isCurrentJob: end === 'current',
  position,
  jobDescription: options.jobDescription,
  reasonForLeaving: end === 'current' ? undefined : options.reasonForLeaving,
  note: options.note,
  createdAt: '2026-01-10T09:00',
  updatedAt: '2026-01-10T09:00',
});

/* --------------------------- รหัส Master ที่ใช้บ่อย --------------------------- */
const G = {
  ALL: { id: 'M-011', code: 'GROUP_ALL', name: 'ได้ทุกประเภท' },
  WALKIN: { id: 'M-012', code: 'GROUP_WALKIN', name: 'กรุ๊ปหน้าร้าน' },
  CHARTER: { id: 'M-013', code: 'GROUP_CHARTER', name: 'กรุ๊ปเหมา' },
  CORP: { id: 'M-014', code: 'GROUP_CORP', name: 'กรุ๊ปองค์กร' },
  STUDY: { id: 'M-015', code: 'GROUP_STUDY', name: 'กรุ๊ปศึกษาดูงาน' },
  FAMILY: { id: 'M-016', code: 'GROUP_FAMILY', name: 'กรุ๊ปครอบครัว' },
  SENIOR: { id: 'M-017', code: 'GROUP_SENIOR', name: 'กรุ๊ปผู้สูงอายุ' },
  VIP: { id: 'M-018', code: 'GROUP_VIP', name: 'กรุ๊ป VIP' },
  INCENTIVE: { id: 'M-019', code: 'GROUP_INCENTIVE', name: 'กรุ๊ป Incentive' },
};

const S = {
  ALL: { id: 'M-020', code: 'SKILL_ALL', name: 'ได้ทุกประเภท' },
  PHOTO: { id: 'M-021', code: 'SKILL_PHOTO', name: 'ถ่ายภาพนิ่ง' },
  VIDEO: { id: 'M-022', code: 'SKILL_VIDEO', name: 'ถ่ายวิดีโอ' },
  LIVE: { id: 'M-023', code: 'SKILL_LIVE', name: 'ไลฟ์สด' },
};

const group = (m: typeof G.VIP, level: TourSkillLevel, o = {}) =>
  skill('customer_group', m, level, o);
const work = (m: typeof S.PHOTO, level: TourSkillLevel, o = {}) => skill('work_skill', m, level, o);

/* --------------------------- Factory พร้อมค่าเริ่มต้น -------------------------- */

type LeaderSeed = Partial<TourLeader> &
  Pick<TourLeader, 'id' | 'firstName' | 'lastName' | 'firstNameEn' | 'lastNameEn'>;

const makeLeader = (seed: LeaderSeed): TourLeader => ({
  title: 'นาย',
  nickname: '',
  gender: 'unspecified',
  birthDate: '1988-01-01',
  nationalityCountryId: 'C-TH',
  avatarInitials: `${seed.firstName.slice(0, 1)}${seed.lastName.slice(0, 1)}`,
  avatarColor: 'bg-slate-600',
  photoUrl: null,
  usageStatus: 'active',
  active: true,

  religion: undefined,
  maritalStatus: undefined,

  leaderType: 'general',
  typeStartDate: '2024-01-01',
  typeHistory: [],
  joinedAt: '2024-01-01',
  // วันที่พร้อมเริ่มงาน (คนละอย่างกับวันที่เริ่มร่วมงาน)
  availableStartDate: '2026-07-13',
  availabilityMode: 'continuous',
  source: '',
  sourceType: undefined,
  compensationNote: '',
  availabilityNote: '',
  typeNote: '',
  status: 'available',

  contacts: [],
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
  internalNote: '',
  cautions: '',

  rating: 0,
  totalJobs: 0,
  totalDays: 0,
  evaluations: [],
  auditLog: [],

  createdAt: '2024-01-01T09:00',
  createdBy: 'ระบบ (จำลอง)',
  updatedAt: '2026-07-01T09:00',
  updatedBy: 'พิมพ์ชนก สุริยะ',

  ...seed,
});

/* --------------------------------- ข้อมูล -------------------------------- */

export const tourLeaders: TourLeader[] = [
  makeLeader({
    id: 'TL-001',
    title: 'นาย',
    firstName: 'สมชาย',
    lastName: 'รุ่งเรืองศรี',
    firstNameEn: 'Somchai',
    lastNameEn: 'Rungruangsri',
    nickname: 'ชาย',
    gender: 'male',
    birthDate: '1984-06-12',
    avatarColor: 'bg-blue-600',
    // รูปโปรไฟล์จำลอง (Data URI) — ครอบเคส "มีรูปโปรไฟล์" (คนอื่นใช้ Avatar อักษรย่อ)
    photoUrl:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' fill='%23bfdbfe'/%3E%3Ccircle cx='48' cy='38' r='17' fill='%232563eb'/%3E%3Cpath d='M18 86c0-16 13-27 30-27s30 11 30 27z' fill='%232563eb'/%3E%3C/svg%3E",
    religion: 'buddhist',
    maritalStatus: 'married',
    // ⚠️ กรณีทดสอบ: หัวหน้าทัวร์ประจำ
    leaderType: 'regular',
    typeStartDate: '2020-01-01',
    joinedAt: '2018-04-01',
    availableStartDate: '2026-07-16', // พร้อมเริ่มงานหลังจบงานปัจจุบัน
    availabilityMode: 'continuous',
    sourceType: 'past_collaboration',
    compensationNote: 'ค่าตอบแทนเหมาจ่ายตามเรตหัวหน้าทัวร์ประจำ + โบนัสตามคะแนนประเมิน',
    typeNote: 'ลูกค้าองค์กรขอตัวบ่อย บริษัทเรียกใช้เป็นประจำ',
    typeHistory: [
      { id: uid('TH'), from: 'general', to: 'regular', effectiveDate: '2020-01-01', at: '2020-01-05T09:00', by: 'พิมพ์ชนก สุริยะ', reason: 'ปรับเป็นหัวหน้าทัวร์ประจำหลังทำงานครบ 2 ปี' },
    ],
    status: 'available',
    contacts: [
      contact('phone', '081-234-5671', { label: 'เบอร์หลัก', isPrimary: true, preferredContactTime: '09:00–18:00' }),
      contact('phone', '02-123-4567', { label: 'เบอร์สำรอง (บ้าน)', preferredContactTime: 'หลัง 19:00' }),
      contact('email', 'somchai.r@demo-tour.local', {}),
      contact('line', 'chai_tl001', { note: 'ตอบไวที่สุด' }),
      contact('facebook', 'https://facebook.com/demo.somchai.tl'),
      contact('whatsapp', '+66812345671', { note: 'ใช้เฉพาะตอนอยู่ต่างประเทศ' }),
    ],
    languages: [
      lang('ญี่ปุ่น', 'fluent', {
        isPrimary: true,
        listening: 'fluent',
        speaking: 'fluent',
        reading: 'working',
        writing: 'conversational',
        usageTypes: ['customer_conversation', 'basic_interpreter', 'airline_coordination'],
        certifications: [
          {
            type: 'JLPT',
            level: 'N2',
            score: '142',
            testDate: '2024-07-07',
            attachmentName: 'jlpt-n2-2024.pdf',
            status: 'verified',
          },
        ],
      }),
      lang('อังกฤษ', 'working', {
        listening: 'working',
        speaking: 'working',
        reading: 'fluent',
        writing: 'working',
        usageTypes: ['email', 'general_conversation', 'read_business_docs'],
      }),
    ],
    assignedCountries: [
      assigned('C-JP', { isPrimary: true, regionOrCity: 'คันโต / คันไซ', startDate: '2020-01-01', note: 'ประเทศประจำหลัก' }),
      assigned('C-KR', { regionOrCity: 'โซล' }),
    ],
    routeSkills: [
      allRoutes('C-JP', 'principal', { tripCount: 42, lastWorkedAt: '2026-07-14', note: 'ทำได้ทุกเส้นทางในญี่ปุ่น รวมฮอกไกโดและคิวชู' }),
      someRoutes('C-KR', ['R-KR-A1', 'R-KR-T1'], 'can_lead', { tripCount: 8, lastWorkedAt: '2025-11-20' }),
    ],
    tourSkills: [
      group(G.VIP, 'expert'),
      group(G.INCENTIVE, 'expert'),
      group(G.CORP, 'strong'),
      group(G.SENIOR, 'good'),
    ],
    documents: [
      doc('national_id', 'บัตรประชาชน', 'xxxxxxxxx45x', '2019-01-10', '2029-01-09', { fileName: 'id_tl001_demo.pdf' }),
      doc('passport', 'หนังสือเดินทาง', 'xxxxx567', '2019-03-15', '2029-03-14', { fileName: 'passport_tl001_demo.pdf' }),
      doc('license', 'บัตรมัคคุเทศก์ (บัตรบรอนซ์)', 'GD-11-2345', '2023-06-01', '2028-05-31', { fileName: 'guide_license_tl001_demo.pdf' }),
      doc('certificate', 'ใบรับรองอบรมปฐมพยาบาล', 'FA-2024-118', '2024-02-10', null, { fileName: 'first_aid_tl001_demo.pdf' }),
    ],
    bankAccounts: [
      bank('ธนาคารกสิกรไทย', 'สมชาย รุ่งเรืองศรี', 'xxx-x-x1234-x', { branch: 'สาขาลาดพร้าว 71', promptPay: 'xxx-xxx-5671', isPrimary: true }),
      bank('ธนาคารไทยพาณิชย์', 'สมชาย รุ่งเรืองศรี', 'xxx-x-x9988-x', { branch: 'สาขารัชดา' }),
    ],
    // ⚠️ กรณีทดสอบ: ทำงานหลายบริษัท + ยังทำงานกับบริษัทเดิม (งานปัจจุบัน)
    employmentHistory: [
      job('TL-001', 'บริษัท สยามฮอลิเดย์ ทราเวล จำกัด (จำลอง)', 'หัวหน้าทัวร์อาวุโส', [2018, 4], 'current', {
        employerPhone: '02-111-2222',
        salary: 42000,
        jobDescription: 'นำกรุ๊ปทัวร์ญี่ปุ่นและเกาหลี ดูแลกรุ๊ป VIP และอินเซนทีฟองค์กร',
      }),
      job('TL-001', 'บริษัท เจแปนไกด์ เซอร์วิส จำกัด (จำลอง)', 'ไกด์ท้องถิ่น / ล่าม', [2014, 6], [2018, 3], {
        employerPhone: '02-333-4444',
        salary: 28000,
        jobDescription: 'ล่ามภาษาญี่ปุ่นและไกด์ประจำกรุ๊ปดูงาน',
        reasonForLeaving: 'ต้องการเติบโตในสายหัวหน้าทัวร์',
      }),
      job('TL-001', 'ร้านอาหารญี่ปุ่น ซากุระ (จำลอง)', 'พนักงานต้อนรับ', [2011, 1], [2014, 5], {
        salary: 15000,
        reasonForLeaving: 'เปลี่ยนสายงานไปทำท่องเที่ยว',
      }),
    ],
    address: {
      houseNo: '128/45',
      alley: 'ลาดพร้าว 71',
      subdistrict: 'ลาดพร้าว',
      district: 'ลาดพร้าว',
      province: 'กรุงเทพมหานคร',
      postalCode: '10230',
      countryId: 'C-TH',
    },
    emergencyContacts: [
      emergency('สุนีย์ รุ่งเรืองศรี', 'ภรรยา', '089-111-2233', { isPrimary: true, otherChannel: 'LINE: sunee_demo' }),
      emergency('ประยุทธ รุ่งเรืองศรี', 'บิดา', '089-121-3344', { note: 'ติดต่อกรณีฉุกเฉินสำรอง' }),
    ],
    internalNote: 'ลูกค้าองค์กรขอตัวบ่อย ดูแลกรุ๊ปใหญ่ได้ดี เหมาะกับงานอินเซนทีฟและ VIP',
    cautions: 'แพ้อาหารทะเล — ต้องแจ้งร้านอาหารล่วงหน้า',
    rating: 4.8,
    totalJobs: 62,
    totalDays: 318,
    evaluations: [
      { id: 'EV-001', jobId: 'JOB-2026-013', jobTitle: 'ญี่ปุ่น โตเกียว–ฮาโกเน่ 5 วัน', date: '2026-05-18', scoreService: 5, scoreKnowledge: 5, scoreDiscipline: 5, scoreDocument: 4, comment: 'ลูกค้าชมเรื่องการดูแลผู้สูงอายุในกรุ๊ป เอกสารเคลียร์ช้าเล็กน้อย', by: 'พิมพ์ชนก สุริยะ' },
    ],
    createdAt: '2018-04-01T09:00',
    updatedAt: '2026-06-01T09:20',
  }),

  makeLeader({
    id: 'TL-002',
    title: 'นางสาว',
    firstName: 'ปวีณา',
    lastName: 'อินทรสุวรรณ',
    firstNameEn: 'Paweena',
    lastNameEn: 'Intarasuwan',
    nickname: 'แนน',
    gender: 'female',
    birthDate: '1990-02-08',
    avatarColor: 'bg-violet-600',
    leaderType: 'regular',
    typeStartDate: '2021-06-01',
    joinedAt: '2019-02-11',
    compensationNote: 'เรตยุโรป + เบี้ยเลี้ยงต่างประเทศ',
    typeHistory: [
      { id: uid('TH'), from: 'general', to: 'regular', effectiveDate: '2021-06-01', at: '2021-06-02T10:00', by: 'พิมพ์ชนก สุริยะ' },
    ],
    status: 'available',
    contacts: [
      contact('phone', '081-234-5672', { label: 'เบอร์หลัก', isPrimary: true, preferredContactTime: '10:00–20:00' }),
      contact('email', 'paweena.i@demo-tour.local', {}),
      contact('line', 'nan_euro'),
      contact('instagram', 'https://instagram.com/demo.nan.euro'),
      contact('website', 'https://demo-tour.local/leaders/nan', { note: 'พอร์ตโฟลิโอรูปภาพ (จำลอง)' }),
    ],
    languages: [
      lang('อังกฤษ', 'fluent', {
        isPrimary: true,
        listening: 'fluent',
        speaking: 'fluent',
        reading: 'near_native',
        writing: 'fluent',
        usageTypes: ['customer_conversation', 'presentation', 'negotiation', 'email'],
        certifications: [
          {
            type: 'TOEIC',
            score: '905',
            testDate: '2025-02-15',
            expiryDate: '2027-02-15',
            attachmentName: 'toeic-905.pdf',
            status: 'verified',
          },
        ],
      }),
      lang('อิตาลี', 'working', { listening: 'working', speaking: 'working', reading: 'conversational', writing: 'basic', usageTypes: ['general_conversation', 'customer_conversation'] }),
      lang('ฝรั่งเศส', 'conversational', { listening: 'conversational', speaking: 'basic' }),
    ],
    assignedCountries: [
      assigned('C-IT', { isPrimary: true, regionOrCity: 'โรม / ฟลอเรนซ์', startDate: '2021-06-01' }),
      assigned('C-CH', { regionOrCity: 'ซูริก' }),
    ],
    routeSkills: [
      allRoutes('C-IT', 'expert', { tripCount: 16, lastWorkedAt: '2025-10-12' }),
      allRoutes('C-CH', 'expert', { tripCount: 11, lastWorkedAt: '2026-06-14' }),
      someRoutes('C-FR', ['R-FR-A1', 'R-FR-T1'], 'can_lead', { tripCount: 6, lastWorkedAt: '2025-08-03' }),
      someRoutes('C-GE', ['R-GE-A1', 'R-GE-T1'], 'assisted', { tripCount: 2, lastWorkedAt: '2024-09-15' }),
    ],
    tourSkills: [
      group(G.VIP, 'strong'),
      group(G.FAMILY, 'strong'),
      work(S.PHOTO, 'good'), work(S.VIDEO, 'good'),
    ],
    documents: [
      doc('passport', 'หนังสือเดินทาง', 'xxxxx678', '2018-11-21', '2028-11-20', { fileName: 'passport_tl002_demo.pdf' }),
      doc('visa', 'วีซ่าเชงเก้น (Multiple)', 'SCH-2025-0912', '2025-09-12', '2026-09-11', { issuingCountryId: 'C-IT', fileName: 'schengen_tl002_demo.pdf', note: 'ต้องต่ออายุก่อนกรุ๊ปยุโรปไตรมาส 4' }),
      doc('license', 'บัตรมัคคุเทศก์ (บัตรบรอนซ์)', 'GD-11-6789', '2022-01-15', '2027-01-14', { fileName: 'guide_license_tl002_demo.pdf' }),
    ],
    bankAccounts: [
      bank('ธนาคารไทยพาณิชย์', 'ปวีณา อินทรสุวรรณ', 'xxx-x-x5678-x', { branch: 'สาขาพระราม 3', isPrimary: true }),
    ],
    address: {
      houseNo: '55/12',
      road: 'พระราม 3',
      subdistrict: 'บางโพงพาง',
      district: 'ยานนาวา',
      province: 'กรุงเทพมหานคร',
      postalCode: '10120',
      countryId: 'C-TH',
    },
    emergencyContacts: [emergency('ประเสริฐ อินทรสุวรรณ', 'บิดา', '089-222-3344', { isPrimary: true })],
    internalNote: '⚠️ ปัจจุบันถูกจัดลงงานซ้อน (JOB-2026-003 และ JOB-2026-004) ต้องแก้ไขด่วน',
    rating: 4.6,
    totalJobs: 48,
    totalDays: 402,
    evaluations: [
      { id: 'EV-002', jobId: 'JOB-2026-009', jobTitle: 'สวิตเซอร์แลนด์ แกรนด์ทัวร์ 10 วัน', date: '2026-06-16', scoreService: 5, scoreKnowledge: 4, scoreDiscipline: 4, scoreDocument: 3, comment: 'งานดี แต่ส่งเอกสารเคลียร์ช้ากว่ากำหนด', by: 'อรวรรณ เจริญทรัพย์' },
    ],
    createdAt: '2019-02-11T09:00',
    updatedAt: '2026-07-06T11:05',
  }),

  makeLeader({
    id: 'TL-003',
    firstName: 'ธนกฤต',
    lastName: 'ศรีวิชัย',
    firstNameEn: 'Thanakrit',
    lastNameEn: 'Srivichai',
    nickname: 'กฤต',
    gender: 'male',
    birthDate: '1992-09-30',
    avatarColor: 'bg-teal-600',
    leaderType: 'regular',
    typeStartDate: '2022-01-01',
    joinedAt: '2020-06-15',
    status: 'available',
    contacts: [
      contact('phone', '081-234-5673', { label: 'เบอร์หลัก', isPrimary: true }),
      contact('email', 'thanakrit.s@demo-tour.local', {}),
      contact('line', 'krit.korea'),
      contact('wechat', 'krit_demo_wc', { note: 'ใช้ติดต่อซัพพลายเออร์จีน' }),
    ],
    languages: [
      lang('เกาหลี', 'fluent', { isPrimary: true, listening: 'fluent', speaking: 'fluent', reading: 'working', writing: 'working', hasCertificate: true, certificateName: 'TOPIK', score: 'ระดับ 5' }),
      lang('อังกฤษ', 'working'),
      lang('จีนกลาง', 'basic'),
    ],
    assignedCountries: [assigned('C-KR', { isPrimary: true, regionOrCity: 'โซล', startDate: '2022-01-01' })],
    routeSkills: [
      allRoutes('C-KR', 'expert', { tripCount: 22, lastWorkedAt: '2026-07-15' }),
      someRoutes('C-CN', ['R-CN-A2', 'R-CN-A3'], 'can_lead', { tripCount: 5, lastWorkedAt: '2025-04-18' }),
      someRoutes('C-JP', ['R-JP-A1', 'R-JP-A2'], 'assisted', { tripCount: 3, lastWorkedAt: '2024-12-08' }),
    ],
    tourSkills: [
      group(G.WALKIN, 'strong'),
      group(G.SENIOR, 'strong'),
    ],
    documents: [
      doc('passport', 'หนังสือเดินทาง', 'xxxxx789', '2017-08-31', '2027-08-30', { fileName: 'passport_tl003_demo.pdf' }),
      doc('health', 'ใบรับรองแพทย์ประจำปี', 'HL-2025-2210', '2025-10-22', '2026-10-21', { fileName: 'health_tl003_demo.pdf', verifyStatus: 'pending' }),
    ],
    bankAccounts: [
      bank('ธนาคารกรุงเทพ', 'ธนกฤต ศรีวิชัย', 'xxx-x-x9012-x', { branch: 'สาขาบางแค', isPrimary: true }),
    ],
    address: {
      houseNo: '9/88',
      building: 'หมู่บ้านเดอะคอนเนค',
      subdistrict: 'บางแค',
      district: 'บางแค',
      province: 'กรุงเทพมหานคร',
      postalCode: '10160',
      countryId: 'C-TH',
    },
    emergencyContacts: [emergency('จินตนา ศรีวิชัย', 'มารดา', '089-333-4455', { isPrimary: true })],
    internalNote: 'พูดเกาหลีคล่อง เจรจากับซัพพลายเออร์ท้องถิ่นได้ดี',
    rating: 4.4,
    totalJobs: 39,
    totalDays: 205,
    createdAt: '2020-06-15T09:00',
    updatedAt: '2026-05-20T10:00',
  }),

  makeLeader({
    id: 'TL-004',
    title: 'นางสาว',
    firstName: 'มนัสวี',
    lastName: 'พงษ์พานิช',
    firstNameEn: 'Manatsawee',
    lastNameEn: 'Pongpanich',
    nickname: 'หมิว',
    gender: 'female',
    birthDate: '1995-04-17',
    avatarColor: 'bg-rose-600',
    nationalityCountryId: 'C-TH',
    leaderType: 'freelance',
    typeStartDate: '2023-01-01',
    joinedAt: '2021-01-20',
    availabilityNote: 'รับงานได้เฉพาะวันจันทร์–ศุกร์ แจ้งล่วงหน้า 7 วัน',
    compensationNote: 'คิดเป็นรายวัน 3,500 บาท/วัน',
    status: 'available',
    contacts: [
      contact('phone', '081-234-5674', { label: 'เบอร์หลัก', isPrimary: true }),
      contact('email', 'manatsawee.p@demo-tour.local', {}),
      contact('line', 'miu.china'),
      contact('wechat', 'miu_demo_wechat', { note: 'ช่องทางหลักตอนอยู่จีน' }),
      contact('tiktok', 'https://tiktok.com/@demo.miu.china'),
    ],
    languages: [
      lang('จีนกลาง', 'native', { isPrimary: true, listening: 'native', speaking: 'native', reading: 'native', writing: 'near_native' }),
      lang('อังกฤษ', 'working', { hasCertificate: true, certificateName: 'TOEIC', score: '760' }),
    ],
    assignedCountries: [assigned('C-CN', { isPrimary: true, regionOrCity: 'จางเจียเจี้ย', startDate: '2023-01-01' })],
    routeSkills: [
      allRoutes('C-CN', 'expert', { tripCount: 19, lastWorkedAt: '2026-06-25' }),
      allRoutes('C-TW', 'can_lead', { tripCount: 7, lastWorkedAt: '2025-12-02' }),
      someRoutes('C-VN', ['R-VN-A1', 'R-VN-T1'], 'traveled', { tripCount: 1, lastWorkedAt: '2024-05-10' }),
    ],
    tourSkills: [
      group(G.STUDY, 'expert'),
      group(G.CORP, 'strong'),
    ],
    // ⚠️ กรณีทดสอบ: ประสบการณ์ 4–6 ปี
    employmentHistory: [
      job('TL-004', 'บริษัท ไชน่าโรด ทราเวล (จำลอง)', 'หัวหน้าทัวร์จีน', [2020, 6], 'current', {
        jobDescription: 'นำกรุ๊ปทัวร์จีน (จางเจียเจี้ย) และไต้หวัน · ดูแลกรุ๊ปศึกษาดูงานและองค์กร',
      }),
    ],
    documents: [
      // ⚠️ ใกล้หมดอายุ
      doc('passport', 'หนังสือเดินทาง', 'xxxxx890', '2016-10-06', '2026-10-05', { fileName: 'passport_tl004_demo.pdf', note: 'ใกล้หมดอายุ — ต้องต่อก่อนรับงานต่างประเทศรอบถัดไป' }),
      doc('license', 'บัตรมัคคุเทศก์ (บัตรบรอนซ์)', 'GD-11-3344', '2021-04-05', '2026-09-30', { fileName: 'guide_license_tl004_demo.pdf', note: 'ใกล้หมดอายุ' }),
    ],
    bankAccounts: [
      bank('ธนาคารกรุงศรีอยุธยา', 'มนัสวี พงษ์พานิช', 'xxx-x-x3456-x', { branch: 'สาขาคลองสาน', isPrimary: true }),
    ],
    address: {
      houseNo: '301',
      building: 'อาคารชุดริเวอร์เพลส',
      subdistrict: 'คลองต้นไทร',
      district: 'คลองสาน',
      province: 'กรุงเทพมหานคร',
      postalCode: '10600',
      countryId: 'C-TH',
    },
    emergencyContacts: [emergency('สมพร พงษ์พานิช', 'พี่สาว', '089-444-5566', { isPrimary: true })],
    internalNote: 'เจ้าของภาษาจีน เหมาะกับกรุ๊ปดูงาน ต้องตามเรื่องต่อพาสปอร์ต',
    cautions: 'พาสปอร์ตใกล้หมดอายุ — ห้ามจัดงานที่เดินทางหลัง ต.ค. 2569',
    rating: 4.2,
    totalJobs: 31,
    totalDays: 168,
    evaluations: [
      { id: 'EV-003', jobId: 'JOB-2026-008', jobTitle: 'จีน จางเจียเจี้ย–เฟิ่งหวง 6 วัน', date: '2026-06-27', scoreService: 4, scoreKnowledge: 5, scoreDiscipline: 4, scoreDocument: 3, comment: 'ใบเสร็จค่าอาหารบางส่วนไม่ครบ ต้องติดตามเพิ่ม', by: 'อรวรรณ เจริญทรัพย์' },
    ],
    createdAt: '2021-01-20T09:00',
    updatedAt: '2026-07-10T10:00',
  }),

  makeLeader({
    id: 'TL-005',
    firstName: 'อรรถพล',
    lastName: 'เกียรติวงศ์',
    firstNameEn: 'Attapon',
    lastNameEn: 'Kiatwong',
    nickname: 'พล',
    gender: 'male',
    birthDate: '1989-11-05',
    avatarColor: 'bg-indigo-600',
    religion: 'buddhist',
    maritalStatus: 'married',
    // ⚠️ กรณีทดสอบ: ฟรีแลนซ์ที่พร้อมเริ่มงาน "เดือนหน้า" + ระบุช่วงเวลาพร้อมรับงาน
    leaderType: 'freelance',
    typeStartDate: '2022-05-01',
    joinedAt: '2019-09-02',
    status: 'available',
    availableStartDate: '2026-08-01',
    availabilityMode: 'date_range',
    availabilityFrom: '2026-08-01',
    availabilityTo: '2026-10-31',
    sourceType: 'staff_referral',
    availabilityNote: 'พร้อมรับงานฉุกเฉิน แจ้งล่วงหน้า 3 วันได้',
    compensationNote: 'รายวัน 4,000 บาท/วัน (ไม่รวมเบี้ยเลี้ยง)',
    contacts: [
      contact('phone', '081-234-5675', { label: 'เบอร์หลัก', isPrimary: true, preferredContactTime: 'ทุกวัน 08:00–22:00' }),
      contact('email', 'attapon.k@demo-tour.local', {}),
      contact('line', 'pol_japan'),
    ],
    languages: [
      lang('อังกฤษ', 'fluent', { isPrimary: true, listening: 'fluent', speaking: 'fluent', reading: 'fluent', writing: 'working' }),
      lang('ญี่ปุ่น', 'working', { listening: 'working', speaking: 'conversational', hasCertificate: true, certificateName: 'JLPT N3', score: 'N3' }),
    ],
    assignedCountries: [assigned('C-JP', { isPrimary: true, regionOrCity: 'โตเกียว', startDate: '2022-05-01' })],
    // ⚠️ เชี่ยวชาญ "เฉพาะ NRT" เท่านั้น → ต้องไม่ตรงกับการค้นหา KIX
    routeSkills: [
      someRoutes('C-JP', ['R-JP-A1', 'R-JP-T1'], 'expert', { tripCount: 14, lastWorkedAt: '2026-02-18', note: 'ทำเฉพาะเส้นทางโตเกียว/นาริตะ ยังไม่เคยทำคันไซ' }),
      allRoutes('C-NZ', 'can_lead', { tripCount: 5, lastWorkedAt: '2025-09-11' }),
      someRoutes('C-AU', ['R-AU-A1'], 'assisted', { tripCount: 2 }),
    ],
    tourSkills: [
      group(G.FAMILY, 'expert'),
      group(G.WALKIN, 'good'),
      work(S.PHOTO, 'strong'), work(S.VIDEO, 'strong'),
    ],
    documents: [
      doc('passport', 'หนังสือเดินทาง', 'xxxxx901', '2020-01-10', '2030-01-09', { fileName: 'passport_tl005_demo.pdf' }),
      doc('certificate', 'ใบรับรองอบรมความปลอดภัยกิจกรรมกลางแจ้ง', 'SF-2025-0088', '2025-03-08', '2027-03-07', { fileName: 'safety_tl005_demo.pdf' }),
    ],
    bankAccounts: [
      bank('ธนาคารกสิกรไทย', 'อรรถพล เกียรติวงศ์', 'xxx-x-x7788-x', { branch: 'สาขาบางพลี', isPrimary: true }),
    ],
    // ⚠️ กรณีทดสอบ: ช่วงเวลาทำงานซ้อนกัน (ฟรีแลนซ์ทำ 2 ที่พร้อมกัน) + ไม่ระบุเงินเดือนบางรายการ
    employmentHistory: [
      job('TL-005', 'บริษัท สยามฮอลิเดย์ ทราเวล จำกัด (จำลอง)', 'หัวหน้าทัวร์ฟรีแลนซ์', [2022, 5], 'current', {
        employerPhone: '02-111-2222',
        jobDescription: 'รับงานเป็นครั้งคราว เส้นทางญี่ปุ่น (โตเกียว) และนิวซีแลนด์',
        note: 'ไม่ระบุเงินเดือน — รับเป็นรายวัน',
      }),
      job('TL-005', 'บริษัท คิวีดรีม ฮอลิเดย์ จำกัด (จำลอง)', 'หัวหน้าทัวร์ฟรีแลนซ์', [2021, 3], 'current', {
        employerPhone: '02-555-6666',
        jobDescription: 'รับงานเส้นทางโอเชียเนีย (ทำงานคู่ขนานกับที่แรก)',
      }),
      job('TL-005', 'โรงเรียนสอนภาษาอังกฤษ (จำลอง)', 'ครูสอนภาษา', [2016, 8], [2021, 2], {
        salary: 25000,
        reasonForLeaving: 'ผันตัวมาทำงานท่องเที่ยวเต็มตัว',
      }),
    ],
    address: {
      houseNo: '77/9',
      villageNo: '5',
      subdistrict: 'บางพลีใหญ่',
      district: 'บางพลี',
      province: 'สมุทรปราการ',
      postalCode: '10540',
      countryId: 'C-TH',
    },
    emergencyContacts: [emergency('ณัฐริกา เกียรติวงศ์', 'ภรรยา', '089-555-6677', { isPrimary: true })],
    internalNote: 'พร้อมรับงานฉุกเฉิน — แต่ยังไม่เคยทำเส้นทางคันไซ (KIX)',
    rating: 4.7,
    totalJobs: 44,
    totalDays: 240,
    createdAt: '2019-09-02T09:00',
    updatedAt: '2026-06-18T14:00',
  }),

  makeLeader({
    id: 'TL-006',
    title: 'นางสาว',
    firstName: 'กมลชนก',
    lastName: 'แซ่ลิ้ม',
    firstNameEn: 'Kamonchanok',
    lastNameEn: 'Saelim',
    nickname: 'แนท',
    gender: 'female',
    birthDate: '1994-03-22',
    avatarColor: 'bg-emerald-600',
    leaderType: 'regular',
    typeStartDate: '2023-03-01',
    joinedAt: '2021-11-08',
    // ⚠️ กรณีทดสอบ: สถานะ "ไม่พร้อมรับงาน" (ครอบกลุ่มไม่ใช้งาน)
    status: 'unavailable',
    contacts: [
      contact('phone', '081-234-5676', { label: 'เบอร์หลัก', isPrimary: true }),
      contact('email', 'kamonchanok.s@demo-tour.local', {}),
      contact('line', 'nat.kiwi'),
      contact('instagram', 'https://instagram.com/demo.nat.kiwi'),
    ],
    languages: [
      lang('อังกฤษ', 'fluent', { isPrimary: true, listening: 'near_native', speaking: 'fluent', reading: 'fluent', writing: 'fluent', hasCertificate: true, certificateName: 'IELTS', score: '7.5' }),
      lang('จีนกลาง', 'working'),
    ],
    assignedCountries: [
      assigned('C-NZ', { isPrimary: true, regionOrCity: 'ควีนส์ทาวน์', startDate: '2023-03-01' }),
      assigned('C-AU', { regionOrCity: 'ซิดนีย์' }),
    ],
    routeSkills: [
      allRoutes('C-NZ', 'expert', { tripCount: 13, lastWorkedAt: '2026-06-20' }),
      allRoutes('C-AU', 'can_lead', { tripCount: 6, lastWorkedAt: '2025-07-19' }),
      someRoutes('C-JP', ['R-JP-A4', 'R-JP-T4'], 'assisted', { tripCount: 2, lastWorkedAt: '2026-08-15' }),
    ],
    tourSkills: [
      group(G.FAMILY, 'strong'),
      group(G.VIP, 'good'),
      work(S.PHOTO, 'expert'), work(S.VIDEO, 'expert'), work(S.LIVE, 'strong'),
    ],
    // ⚠️ กรณีทดสอบ: ประสบการณ์ 1–3 ปี
    employmentHistory: [
      job('TL-006', 'บริษัท คิวี่ฮอลิเดย์ (จำลอง)', 'หัวหน้าทัวร์นิวซีแลนด์–ออสเตรเลีย', [2024, 3], 'current', {
        jobDescription: 'ดูแลกรุ๊ปครอบครัวและ VIP เส้นทางนิวซีแลนด์และออสเตรเลีย',
      }),
    ],
    documents: [
      doc('passport', 'หนังสือเดินทาง', 'xxxxx012', '2019-07-23', '2029-07-22', { fileName: 'passport_tl006_demo.pdf' }),
      doc('license', 'บัตรมัคคุเทศก์ (บัตรบรอนซ์)', 'GD-11-9911', '2023-08-01', '2028-07-31', { fileName: 'guide_license_tl006_demo.pdf' }),
    ],
    bankAccounts: [
      bank('ธนาคารไทยพาณิชย์', 'กมลชนก แซ่ลิ้ม', 'xxx-x-x2211-x', { branch: 'สาขาสุขุมวิท 71', isPrimary: true }),
    ],
    address: {
      houseNo: '12/3',
      alley: 'สุขุมวิท 71',
      subdistrict: 'พระโขนงเหนือ',
      district: 'วัฒนา',
      province: 'กรุงเทพมหานคร',
      postalCode: '10110',
      countryId: 'C-TH',
    },
    emergencyContacts: [emergency('ชูเกียรติ แซ่ลิ้ม', 'บิดา', '089-666-7788', { isPrimary: true })],
    internalNote: 'ถนัดเส้นทางโอเชียเนีย ดูแลกรุ๊ปครอบครัวได้ดี',
    rating: 4.5,
    totalJobs: 27,
    totalDays: 189,
    createdAt: '2021-11-08T09:00',
    updatedAt: '2026-07-02T11:30',
  }),

  makeLeader({
    id: 'TL-007',
    firstName: 'วีรภัทร',
    lastName: 'นิลวรรณ',
    firstNameEn: 'Weeraphat',
    lastNameEn: 'Nilwan',
    nickname: 'ภัทร',
    gender: 'male',
    birthDate: '1996-08-14',
    avatarColor: 'bg-amber-600',
    religion: 'prefer_not_to_say', // ⚠️ กรณีทดสอบ: ไม่ประสงค์ระบุศาสนา
    // ⚠️ กรณีทดสอบ: ลาพัก
    leaderType: 'freelance',
    typeStartDate: '2022-03-14',
    joinedAt: '2022-03-14',
    availableStartDate: '2026-09-01',
    availabilityMode: 'contact_first',
    sourceType: 'online',
    availabilityNote: 'ลาพักชั่วคราว — ยังไม่รับงาน',
    status: 'unavailable',
    contacts: [
      contact('phone', '081-234-5677', { label: 'เบอร์หลัก', isPrimary: true }),
      contact('email', 'weeraphat.n@demo-tour.local', {}),
      contact('line', 'pat.taipei'),
    ],
    languages: [
      lang('จีนกลาง', 'fluent', { isPrimary: true, listening: 'fluent', speaking: 'fluent', reading: 'working', writing: 'conversational' }),
      lang('อังกฤษ', 'basic'),
    ],
    assignedCountries: [assigned('C-TW', { isPrimary: true, regionOrCity: 'ไทเป' })],
    routeSkills: [
      allRoutes('C-TW', 'can_lead', { tripCount: 9, lastWorkedAt: '2026-06-02' }),
      someRoutes('C-CN', ['R-CN-A2'], 'traveled', { tripCount: 1 }),
    ],
    documents: [
      // ⚠️ หมดอายุแล้ว
      doc('passport', 'หนังสือเดินทาง', 'xxxxx123', '2016-07-01', '2026-06-30', { fileName: 'passport_tl007_demo.pdf', verifyStatus: 'rejected', note: 'หมดอายุแล้ว — ห้ามจัดงานต่างประเทศจนกว่าจะต่ออายุ' }),
    ],
    bankAccounts: [
      bank('ธนาคารกรุงไทย', 'วีรภัทร นิลวรรณ', 'xxx-x-x4455-x', { branch: 'สาขาเพชรเกษม', isPrimary: true }),
    ],
    address: {
      houseNo: '456',
      road: 'เพชรเกษม',
      subdistrict: 'บางหว้า',
      district: 'ภาษีเจริญ',
      province: 'กรุงเทพมหานคร',
      postalCode: '10160',
      countryId: 'C-TH',
    },
    emergencyContacts: [emergency('อารีย์ นิลวรรณ', 'มารดา', '089-777-8899', { isPrimary: true })],
    internalNote: 'ลาพักเพื่อดำเนินการต่อหนังสือเดินทาง ยังค้างเคลียร์งาน JOB-2026-011',
    cautions: 'หนังสือเดินทางหมดอายุแล้ว — ห้ามจัดงานต่างประเทศ',
    rating: 3.9,
    totalJobs: 18,
    totalDays: 96,
    evaluations: [
      { id: 'EV-004', jobId: 'JOB-2026-011', jobTitle: 'ไต้หวัน ไทเป–ไถจง 6 วัน', date: '2026-06-05', scoreService: 4, scoreKnowledge: 4, scoreDiscipline: 3, scoreDocument: 2, comment: 'เอกสารเคลียร์งานไม่ครบและส่งล่าช้ามาก', by: 'อรวรรณ เจริญทรัพย์' },
    ],
    createdAt: '2022-03-14T09:00',
    updatedAt: '2026-07-01T09:00',
  }),

  makeLeader({
    id: 'TL-008',
    title: 'นาง',
    firstName: 'ศิริลักษณ์',
    lastName: 'ธีรานนท์',
    firstNameEn: 'Sirilak',
    lastNameEn: 'Theeranon',
    nickname: 'ลักษณ์',
    gender: 'female',
    birthDate: '1986-12-01',
    avatarColor: 'bg-slate-600',
    religion: 'christian',
    maritalStatus: 'married',
    // ⚠️ กรณีทดสอบ: เอเจนท์ + ปิดใช้งานข้อมูล
    leaderType: 'agent',
    typeStartDate: '2024-02-01',
    joinedAt: '2018-08-27',
    availableStartDate: '2026-09-15',
    availabilityMode: 'contact_first',
    sourceType: 'agent_referral',
    source: 'ได้รับการแนะนำจากเครือข่ายพันธมิตร (ไม่ระบุชื่อเอเจนท์)',
    compensationNote: 'จ่ายผ่านเอเจนท์ หัก 10% เป็นค่าบริหารจัดการ',
    // ระงับการใช้งาน = มิติสถานะการใช้งาน · ความพร้อมรับงานถูกตั้งเป็นไม่พร้อมรับงานตามกฎ
    // ระงับเป็นการหยุดชั่วคราว → active ยังเป็น true (false เฉพาะ "สิ้นสุดการใช้งาน")
    usageStatus: 'suspended',
    status: 'unavailable',
    active: true,
    typeHistory: [
      { id: uid('TH'), from: 'regular', to: 'agent', effectiveDate: '2024-02-01', at: '2024-02-03T10:00', by: 'พิมพ์ชนก สุริยะ', reason: 'ย้ายไปรับงานผ่านเอเจนท์พันธมิตร' },
    ],
    contacts: [
      contact('phone', '081-234-5678', { label: 'เบอร์หลัก', isPrimary: true }),
      contact('email', 'sirilak.t@demo-tour.local', {}),
      contact('line', 'lak.paris'),
      contact('facebook', 'https://facebook.com/demo.lak.paris'),
    ],
    languages: [
      lang('ฝรั่งเศส', 'fluent', { isPrimary: true, listening: 'fluent', speaking: 'fluent', reading: 'near_native', writing: 'fluent', hasCertificate: true, certificateName: 'DELF B2', score: 'B2' }),
      lang('อังกฤษ', 'working'),
      lang('เยอรมัน', 'basic'),
    ],
    assignedCountries: [assigned('C-FR', { isPrimary: true, regionOrCity: 'ปารีส', startDate: '2024-02-01' })],
    routeSkills: [
      allRoutes('C-FR', 'expert', { tripCount: 21, lastWorkedAt: '2026-07-04' }),
      someRoutes('C-CH', ['R-CH-A1', 'R-CH-T1'], 'can_lead', { tripCount: 7 }),
      someRoutes('C-IT', ['R-IT-A1', 'R-IT-T1'], 'assisted', { tripCount: 3 }),
    ],
    tourSkills: [
      group(G.VIP, 'strong'),
      group(G.STUDY, 'good'),
    ],
    documents: [
      doc('passport', 'หนังสือเดินทาง', 'xxxxx234', '2018-04-19', '2028-04-18', { fileName: 'passport_tl008_demo.pdf' }),
      doc('visa', 'วีซ่าเชงเก้น (Multiple)', 'SCH-2025-0455', '2025-04-05', '2026-08-20', { issuingCountryId: 'C-FR', fileName: 'schengen_tl008_demo.pdf', note: 'ใกล้หมดอายุ' }),
    ],
    bankAccounts: [
      bank('ธนาคารทหารไทยธนชาต', 'ศิริลักษณ์ ธีรานนท์', 'xxx-x-x6677-x', { branch: 'สาขางามวงศ์วาน', isPrimary: true }),
    ],
    address: {
      houseNo: '88',
      alley: 'งามวงศ์วาน 23',
      subdistrict: 'บางเขน',
      district: 'เมืองนนทบุรี',
      province: 'นนทบุรี',
      postalCode: '11000',
      countryId: 'C-TH',
    },
    emergencyContacts: [emergency('ปรีชา ธีรานนท์', 'สามี', '089-888-9900', { isPrimary: true })],
    internalNote: 'ระงับใช้งานชั่วคราว (ข้อมูล Demo) เนื่องจากค้างเคลียร์งาน JOB-2026-012',
    rating: 4.1,
    totalJobs: 35,
    totalDays: 287,
    createdAt: '2018-08-27T09:00',
    updatedAt: '2026-07-08T15:30',
  }),

  makeLeader({
    id: 'TL-009',
    firstName: 'ปิยะพงศ์',
    lastName: 'วัฒนกิจ',
    firstNameEn: 'Piyapong',
    lastNameEn: 'Wattanakij',
    nickname: 'พงศ์',
    gender: 'male',
    birthDate: '1993-07-19',
    avatarColor: 'bg-cyan-600',
    leaderType: 'freelance',
    typeStartDate: '2023-06-01',
    joinedAt: '2021-05-04',
    availabilityNote: 'รับงานได้ทุกช่วง ยกเว้นสัปดาห์แรกของเดือน',
    compensationNote: 'รายวัน 3,800 บาท + คอมมิชชันยอดขายสินค้าเสริม',
    status: 'available',
    contacts: [
      contact('phone', '081-234-5679', { label: 'เบอร์หลัก', isPrimary: true, preferredContactTime: '09:00–17:00' }),
      contact('phone', '086-999-1122', { label: 'เบอร์สำรอง' }),
      contact('email', 'piyapong.w@demo-tour.local', {}),
      contact('line', 'pong.sales'),
      contact('facebook', 'https://facebook.com/demo.pong.sales'),
      contact('tiktok', 'https://tiktok.com/@demo.pong.japan'),
    ],
    // ⚠️ กรณีทดสอบ: ภาษาเดียว (ญี่ปุ่น B2)
    languages: [
      lang('ญี่ปุ่น', 'working', { isPrimary: true, listening: 'working', speaking: 'working', reading: 'conversational', writing: 'basic', hasCertificate: true, certificateName: 'JLPT N3', score: 'N3 (118/180)' }),
    ],
    assignedCountries: [assigned('C-JP', { isPrimary: true, regionOrCity: 'โตเกียว / โอซาก้า', startDate: '2023-06-01' })],
    // ⚠️ เชี่ยวชาญ "NRT และ KIX" (เลือกเฉพาะเส้นทาง)
    routeSkills: [
      someRoutes('C-JP', ['R-JP-A1', 'R-JP-A3', 'R-JP-T2'], 'can_lead', { tripCount: 11, lastWorkedAt: '2026-04-22', note: 'ทำได้ทั้งโตเกียว (NRT) และโอซาก้า (KIX) แต่ยังไม่เคยไปฮอกไกโด' }),
    ],
    tourSkills: [
      group(G.WALKIN, 'expert'),
      group(G.FAMILY, 'good'),
    ],
    // ⚠️ กรณีทดสอบ: ประสบการณ์น้อยกว่า 1 ปี (เพิ่งเริ่มเป็นหัวหน้าทัวร์เต็มตัว)
    employmentHistory: [
      job('TL-009', 'บริษัท พงศ์ทัวร์ เจแปน (จำลอง)', 'หัวหน้าทัวร์ญี่ปุ่น', [2025, 11], 'current', {
        jobDescription: 'นำกรุ๊ปทัวร์ญี่ปุ่นเส้นทางโตเกียว–โอซาก้า เน้นกรุ๊ปหน้าร้านและช้อปปิ้ง',
      }),
    ],
    documents: [
      doc('passport', 'หนังสือเดินทาง', 'xxxxx345', '2019-12-01', '2029-11-30', { fileName: 'passport_tl009_demo.pdf' }),
      doc('license', 'บัตรมัคคุเทศก์ (บัตรบรอนซ์)', 'GD-11-5566', '2022-05-10', '2027-05-09', { fileName: 'guide_license_tl009_demo.pdf' }),
    ],
    bankAccounts: [
      bank('ธนาคารกสิกรไทย', 'ปิยะพงศ์ วัฒนกิจ', 'xxx-x-x8899-x', { branch: 'สาขารัชดาภิเษก', isPrimary: true }),
    ],
    address: {
      houseNo: '210/8',
      road: 'รัชดาภิเษก',
      subdistrict: 'ดินแดง',
      district: 'ดินแดง',
      province: 'กรุงเทพมหานคร',
      postalCode: '10400',
      countryId: 'C-TH',
    },
    emergencyContacts: [emergency('สุกัญญา วัฒนกิจ', 'มารดา', '089-101-2020', { isPrimary: true })],
    internalNote: 'ทำยอดขายหน้าร้านได้ดีมาก เหมาะกับกรุ๊ปหน้าร้านที่มีช้อปปิ้ง',
    rating: 4.5,
    totalJobs: 33,
    totalDays: 172,
    createdAt: '2021-05-04T09:00',
    updatedAt: '2026-05-11T09:00',
  }),

  makeLeader({
    id: 'TL-010',
    title: 'นางสาว',
    firstName: 'จิราภรณ์',
    lastName: 'สุขเกษม',
    firstNameEn: 'Jiraporn',
    lastNameEn: 'Sukkasem',
    nickname: 'จิ',
    gender: 'female',
    birthDate: '1998-05-25',
    avatarColor: 'bg-pink-600',
    photoUrl: null, // ⚠️ กรณีทดสอบ: ไม่มีรูป Profile → ใช้ Avatar อักษรย่อ
    religion: 'none',
    maritalStatus: 'single',
    // ⚠️ กรณีทดสอบ: ประเภททั่วไป + พร้อมเริ่มงานทันที
    leaderType: 'general',
    typeStartDate: '2026-05-15',
    joinedAt: '2026-05-15',
    availableStartDate: '2026-07-13', // พร้อมเริ่มงานทันที
    availabilityMode: 'continuous',
    sourceType: 'self_apply',
    status: 'available',
    contacts: [
      contact('phone', '081-234-5680', { label: 'เบอร์หลัก', isPrimary: true, preferredContactTime: 'เย็นหลัง 18:00' }),
      contact('email', 'jiraporn.s@demo-tour.local', {}),
      contact('line', 'ji.nihongo'),
    ],
    languages: [
      lang('ญี่ปุ่น', 'native', { isPrimary: true, listening: 'native', speaking: 'native', reading: 'native', writing: 'near_native', hasCertificate: true, certificateName: 'JLPT N1', score: 'N1 (168/180)', note: 'เติบโตที่โอซาก้า 12 ปี' }),
      lang('อังกฤษ', 'working'),
    ],
    assignedCountries: [],
    routeSkills: [], // ยังไม่มีประสบการณ์นำทัวร์
    tourSkills: [
      group(G.STUDY, 'able', { note: 'เคยเป็นล่ามให้คณะดูงาน แต่ยังไม่เคยเป็นหัวหน้าทัวร์' }),
    ],
    documents: [
      doc('passport', 'หนังสือเดินทาง', 'xxxxx456', '2021-03-01', '2031-02-28', { fileName: 'passport_tl010_demo.pdf', verifyStatus: 'pending' }),
    ],
    bankAccounts: [
      bank('ธนาคารกรุงเทพ', 'จิราภรณ์ สุขเกษม', 'xxx-x-x1010-x', { branch: 'สาขาจตุจักร', isPrimary: true }),
    ],
    address: {
      houseNo: '45',
      alley: 'พหลโยธิน 24',
      subdistrict: 'จอมพล',
      district: 'จตุจักร',
      province: 'กรุงเทพมหานคร',
      postalCode: '10900',
      countryId: 'C-TH',
    },
    emergencyContacts: [emergency('วิชัย สุขเกษม', 'บิดา', '089-303-4040', { isPrimary: true })],
    internalNote: 'เพิ่งรับเข้าทีม ภาษาญี่ปุ่นระดับเจ้าของภาษา แต่ยังไม่มีประสบการณ์นำทัวร์ — ควรจัดเป็นผู้ช่วยก่อน',
    rating: 0,
    totalJobs: 0,
    totalDays: 0,
    createdAt: '2026-05-15T10:00',
    createdBy: 'พิมพ์ชนก สุริยะ',
    updatedAt: '2026-05-15T10:00',
  }),

  makeLeader({
    id: 'TL-011',
    firstName: 'อนุชา',
    lastName: 'บวรเดชา',
    firstNameEn: 'Anucha',
    lastNameEn: 'Bowondecha',
    nickname: 'ชา',
    gender: 'male',
    birthDate: '1979-10-02',
    avatarColor: 'bg-orange-600',
    leaderType: 'regular',
    typeStartDate: '2016-01-01',
    joinedAt: '2015-03-01',
    compensationNote: 'เรตหัวหน้าทัวร์อาวุโส',
    status: 'available',
    contacts: [
      contact('phone', '081-234-5681', { label: 'เบอร์หลัก', isPrimary: true }),
      contact('email', 'anucha.b@demo-tour.local', {}),
      contact('line', 'cha.history'),
      contact('website', 'https://demo-tour.local/blog/anucha', { note: 'บล็อกประวัติศาสตร์ (จำลอง)' }),
      contact('other', 'Podcast: เล่าเรื่องเมืองเก่า (จำลอง)', { label: 'ช่องทางอื่น' }),
    ],
    languages: [
      lang('อังกฤษ', 'fluent', { isPrimary: true, listening: 'fluent', speaking: 'fluent', reading: 'near_native', writing: 'fluent' }),
      lang('อิตาลี', 'conversational'),
      lang('ญี่ปุ่น', 'conversational'),
    ],
    assignedCountries: [
      assigned('C-IT', { isPrimary: true, regionOrCity: 'โรม', startDate: '2016-01-01' }),
      assigned('C-TR', { regionOrCity: 'อิสตันบูล' }),
    ],
    routeSkills: [
      allRoutes('C-IT', 'principal', { tripCount: 28, lastWorkedAt: '2026-03-30', note: 'บรรยายประวัติศาสตร์โรมันได้ลึก' }),
      allRoutes('C-TR', 'expert', { tripCount: 15, lastWorkedAt: '2025-10-05' }),
      allRoutes('C-JP', 'can_lead', { tripCount: 9, lastWorkedAt: '2025-06-12' }),
      allRoutes('C-GE', 'can_lead', { tripCount: 4 }),
    ],
    // ⚠️ "ได้ทุกประเภท" ทั้งกลุ่มลูกค้าและทักษะ + โดดเด่นเรื่องประวัติศาสตร์
    tourSkills: [
      group(G.ALL, 'strong', { note: 'รับได้ทุกประเภทกรุ๊ป' }),
      group(G.STUDY, 'expert', { note: 'โดดเด่นเป็นพิเศษ' }),
      work(S.ALL, 'good'),
    ],
    documents: [
      doc('passport', 'หนังสือเดินทาง', 'xxxxx509', '2018-09-16', '2028-09-15', { fileName: 'passport_tl011_demo.pdf' }),
      doc('license', 'บัตรมัคคุเทศก์ (บัตรบรอนซ์)', 'GD-11-7788', '2020-02-20', '2027-02-19', { fileName: 'guide_license_tl011_demo.pdf' }),
      doc('certificate', 'ใบรับรองผู้บรรยายประวัติศาสตร์ (จำลอง)', 'HS-2023-0042', '2023-01-10', null, { fileName: 'history_cert_tl011_demo.pdf' }),
    ],
    bankAccounts: [
      bank('ธนาคารกรุงไทย', 'อนุชา บวรเดชา', 'xxx-x-x1122-x', { branch: 'สาขาพระอาทิตย์', isPrimary: true }),
    ],
    // ⚠️ กรณีทดสอบ: ประวัติยาวหลายบริษัท (ประสบการณ์รวมสูง)
    employmentHistory: [
      job('TL-011', 'บริษัท ยูโรเปียนดรีม ฮอลิเดย์ จำกัด (จำลอง)', 'หัวหน้าทัวร์อาวุโส', [2015, 3], 'current', {
        employerPhone: '02-777-8888',
        salary: 55000,
        jobDescription: 'นำกรุ๊ปยุโรปและตุรกี บรรยายประวัติศาสตร์และศิลปวัฒนธรรม',
      }),
      job('TL-011', 'พิพิธภัณฑสถานเอกชน (จำลอง)', 'ภัณฑารักษ์ / วิทยากร', [2009, 5], [2015, 2], {
        salary: 32000,
        jobDescription: 'บรรยายนำชมและจัดนิทรรศการประวัติศาสตร์',
        reasonForLeaving: 'ต้องการนำความรู้ไปใช้ในงานท่องเที่ยว',
      }),
      job('TL-011', 'สำนักพิมพ์ (จำลอง)', 'บรรณาธิการสารคดี', [2005, 6], [2009, 4], {
        salary: 24000,
        reasonForLeaving: 'เปลี่ยนสายงาน',
      }),
    ],
    address: {
      houseNo: '19',
      road: 'พระอาทิตย์',
      subdistrict: 'ชนะสงคราม',
      district: 'พระนคร',
      province: 'กรุงเทพมหานคร',
      postalCode: '10200',
      countryId: 'C-TH',
    },
    emergencyContacts: [emergency('มาลี บวรเดชา', 'ภรรยา', '089-505-6060', { isPrimary: true })],
    internalNote: 'หัวหน้าทัวร์รุ่นใหญ่ รับได้ทุกประเภทกรุ๊ป โดดเด่นเรื่องประวัติศาสตร์และศิลปวัฒนธรรม',
    rating: 4.9,
    totalJobs: 57,
    totalDays: 465,
    createdAt: '2015-03-01T09:00',
    updatedAt: '2026-04-02T09:00',
  }),

  makeLeader({
    id: 'TL-012',
    title: 'นางสาว',
    firstName: 'เมธาวี',
    lastName: 'ชัยพฤกษ์',
    firstNameEn: 'Methawee',
    lastNameEn: 'Chaiyaphruek',
    nickname: 'เมย์',
    gender: 'female',
    birthDate: '1991-01-30',
    avatarColor: 'bg-fuchsia-600',
    religion: 'buddhist',
    maritalStatus: 'single',
    // ⚠️ กรณีทดสอบ: เอเจนท์โดยไม่ระบุบริษัทเอเจนท์ + รับเฉพาะวันหยุด
    leaderType: 'agent',
    typeStartDate: '2025-01-01',
    joinedAt: '2020-10-19',
    availableStartDate: '2026-07-20',
    availabilityMode: 'weekends',
    sourceType: 'agent_referral',
    source: '', // ไม่ระบุชื่อเอเจนท์ (ไม่บังคับ)
    compensationNote: 'จ่ายผ่านเอเจนท์ตามสัญญารายงาน',
    status: 'available',
    typeHistory: [
      { id: uid('TH'), from: 'freelance', to: 'agent', effectiveDate: '2025-01-01', at: '2025-01-04T09:00', by: 'กิตติศักดิ์ พูนสวัสดิ์', reason: 'ย้ายมารับงานผ่านเอเจนท์' },
    ],
    contacts: [
      contact('phone', '081-234-5682', { label: 'เบอร์หลัก', isPrimary: true }),
      contact('email', 'methawee.c@demo-tour.local', {}),
      contact('line', 'may.funtour'),
      contact('tiktok', 'https://tiktok.com/@demo.may.funtour', { note: 'ทำคลิปกิจกรรมบนรถ' }),
      contact('instagram', 'https://instagram.com/demo.may.funtour'),
    ],
    languages: [
      lang('อังกฤษ', 'working', { isPrimary: true, listening: 'working', speaking: 'working' }),
      lang('เกาหลี', 'conversational'),
      lang('เวียดนาม', 'conversational'),
    ],
    assignedCountries: [assigned('C-VN', { isPrimary: true, regionOrCity: 'ดานัง', startDate: '2025-01-01' })],
    routeSkills: [
      allRoutes('C-VN', 'expert', { tripCount: 17, lastWorkedAt: '2026-05-21' }),
      allRoutes('C-KR', 'can_lead', { tripCount: 8 }),
      someRoutes('C-TW', ['R-TW-A1', 'R-TW-T1'], 'can_lead', { tripCount: 5 }),
    ],
    tourSkills: [
      group(G.CHARTER, 'expert', { note: 'กรุ๊ปเหมาบริษัทและกลุ่มเพื่อน' }),
      group(G.INCENTIVE, 'strong'),
      work(S.PHOTO, 'good'), work(S.VIDEO, 'good'),
    ],
    documents: [
      doc('passport', 'หนังสือเดินทาง', 'xxxxx610', '2020-06-12', '2030-06-11', { fileName: 'passport_tl012_demo.pdf' }),
      doc('license', 'บัตรมัคคุเทศก์ (บัตรบรอนซ์)', 'GD-11-2244', '2022-09-01', '2027-08-31', { fileName: 'guide_license_tl012_demo.pdf' }),
    ],
    bankAccounts: [
      bank('ธนาคารกรุงศรีอยุธยา', 'เมธาวี ชัยพฤกษ์', 'xxx-x-x3355-x', { branch: 'สาขาอ่อนนุช', isPrimary: true }),
    ],
    // เอเจนท์ — ไม่ระบุชื่อบริษัทเอเจนท์ (ตามข้อกำหนด)
    employmentHistory: [
      job('TL-012', 'บริษัท อินโดจีน ทราเวลเมท จำกัด (จำลอง)', 'หัวหน้าทัวร์', [2020, 10], 'current', {
        employerPhone: '02-999-0000',
        salary: 38000,
        jobDescription: 'นำกรุ๊ปเหมาและกรุ๊ปอินเซนทีฟ เส้นทางเวียดนามและเกาหลี',
      }),
      job('TL-012', 'บริษัทออร์แกไนเซอร์อีเวนต์ (จำลอง)', 'พิธีกร / MC', [2017, 2], [2020, 9], {
        salary: 30000,
        jobDescription: 'ดำเนินรายการและจัดกิจกรรมกลุ่ม',
        reasonForLeaving: 'ย้ายมาสายท่องเที่ยวเต็มตัว',
      }),
    ],
    // ⚠️ กรณีทดสอบ: ที่อยู่ต่างจังหวัด
    address: {
      houseNo: '199/24',
      building: 'หมู่บ้านบ้านสวนริมทะเล (จำลอง)',
      villageNo: '3',
      road: 'สุขุมวิท',
      subdistrict: 'บางละมุง',
      district: 'บางละมุง',
      province: 'ชลบุรี',
      postalCode: '20150',
      countryId: 'C-TH',
      note: 'ทะเบียนบ้านอยู่กรุงเทพฯ แต่พักอาศัยจริงที่ชลบุรี',
    },
    emergencyContacts: [emergency('ธนา ชัยพฤกษ์', 'พี่ชาย', '089-707-8080', { isPrimary: true })],
    internalNote: 'บรรยากาศบนรถดีมาก เหมาะกับกรุ๊ปเหมาและกรุ๊ปอินเซนทีฟที่เน้นความสนุก',
    rating: 4.7,
    totalJobs: 41,
    totalDays: 198,
    createdAt: '2020-10-19T09:00',
    updatedAt: '2026-03-15T09:00',
  }),
];
