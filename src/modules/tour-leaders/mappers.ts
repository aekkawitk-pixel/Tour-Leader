/**
 * แปลงข้อมูลฟอร์ม ↔ ข้อมูลที่บันทึก (record)
 * แยกจาก UI เพื่อให้ทดสอบและเปลี่ยนไปใช้ API ได้โดยไม่แก้ Component
 */

import type {
  AssignedCountry,
  ContactChannel,
  DocHoldingStatus,
  EmergencyContact,
  EmploymentHistory,
  EmploymentWorkStatus,
  Gender,
  LanguageSkill,
  LeaderAddress,
  LeaderBankAccount,
  LeaderDocument,
  LeaderSourceType,
  LeaderStatus,
  LeaderType,
  MaritalStatus,
  PayType,
  PayUnit,
  PersonType,
  Religion,
  TourLeader,
  WorkAvailabilityMode,
  TourLeaderRouteSkill,
  TourRoute,
  TourTypeSkill,
  TypeHistoryEntry,
} from '@/types';
import {
  AVATAR_COLORS,
  DEFAULT_ACTIVE,
  DEFAULT_COUNTRY_ID,
  DEFAULT_GENDER,
  DEFAULT_LEADER_TYPE,
  DEFAULT_PERSON_TYPE,
  DEFAULT_TITLE,
  DEFAULT_WORK_STATUS,
  TITLE_TH_TO_EN,
} from './constants';
import { withResolvedProvinceCode } from './address';
import { migrateLanguageSkill } from './languageMigration';
import { sortByDisplayOrder } from './experience';
import {
  EMPTY_ADDRESS,
  initialsOf,
  maskAccountNumber,
  maskDocumentNumber,
  newChildId,
  normalizeAllRouteSkills,
} from './utils';

/* ------------------------------- ชนิดของฟอร์ม ------------------------------- */

export interface LeaderFormState {
  // Section 1 — ข้อมูลพื้นฐาน
  id: string;
  title: string;
  /** คำนำหน้าภาษาอังกฤษ — เติมจากคำนำหน้าไทย แก้เองได้ */
  titleEn: string;
  firstName: string;
  lastName: string;
  firstNameEn: string;
  lastNameEn: string;
  nickname: string;
  nicknameEn: string;
  gender: Gender;
  birthDate: string;
  nationalityCountryId: string;
  religion?: Religion;
  religionOther: string;
  maritalStatus?: MaritalStatus;
  photoUrl: string | null;
  active: boolean;

  /** ที่อยู่ปัจจุบัน — แยกฟิลด์ */
  address: LeaderAddress;

  /* ---- ประเภทบุคคลและเอกสารประจำตัว ---- */
  /** ยังไม่เลือก = undefined (บังคับเลือกก่อนบันทึก) */
  personType?: PersonType;

  // คนไทย
  nationalIdNumber: string;
  nationalIdExpiresAt: string;
  /** ที่อยู่ตามบัตรประชาชน — แยกฟิลด์ */
  idCardAddress: LeaderAddress;
  /** ติ๊ก "เหมือนกับที่อยู่ปัจจุบัน" → คัดลอกและล็อกช่องที่อยู่ตามบัตรประชาชน */
  idCardSameAsCurrent: boolean;

  // บุคคลต่างชาติ
  birthCountryId: string;
  passportNumber: string;
  passportCountryId: string;
  passportIssuedAt: string;
  passportExpiresAt: string;
  visaStatus?: DocHoldingStatus;
  visaNumber: string;
  visaType: string;
  visaExpiresAt: string;
  workPermitStatus?: DocHoldingStatus;
  workPermitNumber: string;
  workPermitExpiresAt: string;
  /** สวิตช์ "ระบุที่อยู่ในประเทศต้นทาง" — ปิดไว้เป็นค่าเริ่มต้น (ข้อมูลเสริม) */
  hasHomeCountryAddress: boolean;
  /** ที่อยู่ในประเทศต้นทาง — แยกฟิลด์ (ที่อยู่ปัจจุบันในไทยใช้ `address` ร่วมกับคนไทย) */
  homeCountryAddress: LeaderAddress;

  // Section 2 — ประเภทการใช้งาน
  leaderType: LeaderType;
  typeStartDate: string;
  /** วันที่เริ่มร่วมงาน (ความสัมพันธ์กับบริษัท) */
  joinedAt: string;
  /** วันที่พร้อมเริ่มงาน (พร้อมรับมอบหมายงาน) — คนละอย่างกับ joinedAt */
  availableStartDate: string;
  availabilityMode?: WorkAvailabilityMode;
  availabilityFrom: string;
  availabilityTo: string;
  source: string;
  sourceType?: LeaderSourceType;
  sourceOther: string;
  compensationNote: string;
  availabilityNote: string;
  typeNote: string;
  status: LeaderStatus;
  /** เหตุผลของการเปลี่ยนประเภท (ใช้ตอนแก้ไข) */
  typeChangeReason: string;

  /* ---- รายละเอียดตามรูปแบบการร่วมงาน (แสดง/ตรวจ/บันทึกเฉพาะของรูปแบบที่เลือก) ---- */
  // หัวหน้าทัวร์ประจำ
  employeeCode: string;
  team: string;
  workStatus?: EmploymentWorkStatus;

  // หัวหน้าทัวร์ฟรีแลนซ์
  payType?: PayType;
  /** เก็บเป็นข้อความในฟอร์ม เพื่อไม่ให้ input ว่างกลายเป็น NaN */
  payRate: string;
  payUnit?: PayUnit;

  // หัวหน้าทัวร์เอเจนท์
  agencyName: string;
  agencyContactName: string;
  agencyContactPhone: string;
  agencyContactEmail: string;
  agencyRefCode: string;

  // Section 3–7
  contacts: ContactChannel[];
  languages: LanguageSkill[];
  assignedCountries: AssignedCountry[];
  routeSkills: TourLeaderRouteSkill[];
  tourSkills: TourTypeSkill[];

  /** ประวัติการทำงานกับสถานประกอบการ */
  employmentHistory: EmploymentHistory[];

  // Section 8–10
  documents: LeaderDocument[];
  bankAccounts: LeaderBankAccount[];
  emergencyContacts: EmergencyContact[];
  generalNote: string;
  internalNote: string;
  cautions: string;
}

/* --------------------------- ค่าเริ่มต้นของฟอร์มใหม่ -------------------------- */

export function emptyLeaderForm(nextCode: string, today: string): LeaderFormState {
  return {
    id: nextCode,
    title: DEFAULT_TITLE,
    titleEn: TITLE_TH_TO_EN[DEFAULT_TITLE] ?? '',
    firstName: '',
    lastName: '',
    firstNameEn: '',
    lastNameEn: '',
    nickname: '',
    nicknameEn: '',
    gender: DEFAULT_GENDER,
    birthDate: '',
    // สัญชาติเริ่มต้น = ไทย
    nationalityCountryId: DEFAULT_COUNTRY_ID,
    religion: undefined,
    religionOther: '',
    maritalStatus: undefined,
    photoUrl: null,
    active: DEFAULT_ACTIVE,

    address: { ...EMPTY_ADDRESS },

    // สร้างใหม่ → เริ่มที่ "บุคคลสัญชาติไทย" (กรณีที่พบบ่อยที่สุด) ผู้ใช้เปลี่ยนเป็นต่างชาติได้
    personType: DEFAULT_PERSON_TYPE,
    nationalIdNumber: '',
    nationalIdExpiresAt: '',
    idCardAddress: { ...EMPTY_ADDRESS },
    idCardSameAsCurrent: false,
    birthCountryId: '',
    passportNumber: '',
    passportCountryId: '',
    passportIssuedAt: '',
    passportExpiresAt: '',
    visaStatus: undefined,
    visaNumber: '',
    visaType: '',
    visaExpiresAt: '',
    workPermitStatus: undefined,
    workPermitNumber: '',
    workPermitExpiresAt: '',
    // ข้อมูลเสริม — เริ่มต้นปิด · ประเทศต้นทางต้องเลือกเอง ไม่ตั้งค่าเริ่มต้นเป็นไทย
    hasHomeCountryAddress: false,
    homeCountryAddress: { ...EMPTY_ADDRESS, countryId: '' },

    leaderType: DEFAULT_LEADER_TYPE,
    typeStartDate: today,
    joinedAt: today,
    // ค่าเริ่มต้น: พร้อมเริ่มงานวันนี้
    availableStartDate: today,
    availabilityMode: 'continuous',
    availabilityFrom: '',
    availabilityTo: '',
    source: '',
    sourceType: undefined,
    sourceOther: '',
    compensationNote: '',
    availabilityNote: '',
    typeNote: '',
    status: DEFAULT_WORK_STATUS,
    typeChangeReason: '',

    // รายละเอียดตามรูปแบบการร่วมงาน — เริ่มต้นว่างทั้งหมด
    employeeCode: '',
    team: '',
    workStatus: undefined,
    payType: undefined,
    payRate: '',
    payUnit: undefined,
    agencyName: '',
    agencyContactName: '',
    agencyContactPhone: '',
    agencyContactEmail: '',
    agencyRefCode: '',

    contacts: [
      {
        id: newChildId('CC'),
        type: 'phone',
        label: 'เบอร์หลัก',
        value: '',
        isPrimary: true,
      },
    ],
    languages: [],
    assignedCountries: [],
    routeSkills: [],
    tourSkills: [],
    employmentHistory: [],

    documents: [],
    bankAccounts: [],
    emergencyContacts: [],
    generalNote: '',
    internalNote: '',
    cautions: '',
  };
}

/* ---------------------------- record → ค่าเริ่มต้นฟอร์ม --------------------------- */

/**
 * โหลดข้อมูลเดิมกลับเข้าฟอร์ม
 * ⚠️ ใช้ ?? ไม่ใช้ || เพื่อไม่ให้ค่า false / 0 / '' ถูกตีความผิดว่า "ไม่มีข้อมูล"
 */
export function leaderToForm(leader: TourLeader): LeaderFormState {
  return {
    id: leader.id,
    title: leader.title,
    // ข้อมูลเดิมยังไม่มีคำนำหน้าอังกฤษ → แปลงจากคำนำหน้าไทยให้
    titleEn: leader.titleEn ?? TITLE_TH_TO_EN[leader.title] ?? '',
    firstName: leader.firstName,
    lastName: leader.lastName,
    firstNameEn: leader.firstNameEn,
    lastNameEn: leader.lastNameEn,
    nickname: leader.nickname,
    nicknameEn: leader.nicknameEn ?? '',
    gender: leader.gender,
    birthDate: leader.birthDate,
    nationalityCountryId: leader.nationalityCountryId,
    religion: leader.religion,
    religionOther: leader.religionOther ?? '',
    maritalStatus: leader.maritalStatus,
    photoUrl: leader.photoUrl,
    active: leader.active,

    // deep copy — แก้ในฟอร์มต้องไม่กระทบ record เดิม
    // เติมรหัสจังหวัดให้ข้อมูลเดิมที่บันทึกไว้ก่อนมี Master (มีแต่ชื่อจังหวัด)
    address: withResolvedProvinceCode({ ...leader.address }),

    // แก้ไขข้อมูลเดิม → ใช้ค่าที่บันทึกไว้จริงเสมอ · ตกมาที่ค่าเริ่มต้นเฉพาะกรณีข้อมูลเก่าที่ไม่เคยระบุไว้
    personType: leader.personType ?? DEFAULT_PERSON_TYPE,
    nationalIdNumber: leader.nationalIdNumber ?? '',
    nationalIdExpiresAt: leader.nationalIdExpiresAt ?? '',
    // ข้อมูลเดิมที่ยังไม่เคยกรอกที่อยู่ตามบัตรประชาชน → เริ่มจากฟอร์มว่าง
    idCardAddress: withResolvedProvinceCode({ ...(leader.idCardAddress ?? EMPTY_ADDRESS) }),
    idCardSameAsCurrent: leader.idCardAddressSameAsCurrent ?? false,
    birthCountryId: leader.birthCountryId ?? '',
    passportNumber: leader.passportNumber ?? '',
    passportCountryId: leader.passportCountryId ?? '',
    passportIssuedAt: leader.passportIssuedAt ?? '',
    passportExpiresAt: leader.passportExpiresAt ?? '',
    visaStatus: leader.visaStatus,
    visaNumber: leader.visaNumber ?? '',
    visaType: leader.visaType ?? '',
    visaExpiresAt: leader.visaExpiresAt ?? '',
    workPermitStatus: leader.workPermitStatus,
    workPermitNumber: leader.workPermitNumber ?? '',
    workPermitExpiresAt: leader.workPermitExpiresAt ?? '',
    // มีที่อยู่ต้นทางบันทึกไว้ = เคยเปิดสวิตช์นี้
    hasHomeCountryAddress: Boolean(leader.homeCountryAddress),
    homeCountryAddress: { ...(leader.homeCountryAddress ?? { ...EMPTY_ADDRESS, countryId: '' }) },

    leaderType: leader.leaderType,
    typeStartDate: leader.typeStartDate,
    joinedAt: leader.joinedAt,
    availableStartDate: leader.availableStartDate,
    availabilityMode: leader.availabilityMode,
    availabilityFrom: leader.availabilityFrom ?? '',
    availabilityTo: leader.availabilityTo ?? '',
    source: leader.source,
    sourceType: leader.sourceType,
    sourceOther: leader.sourceOther ?? '',
    compensationNote: leader.compensationNote,
    availabilityNote: leader.availabilityNote,
    typeNote: leader.typeNote,
    status: leader.status,
    typeChangeReason: '',

    employeeCode: leader.employeeCode ?? '',
    team: leader.team ?? '',
    workStatus: leader.workStatus,
    payType: leader.payType,
    payRate: leader.payRate === undefined ? '' : String(leader.payRate),
    payUnit: leader.payUnit,
    agencyName: leader.agencyName ?? '',
    agencyContactName: leader.agencyContactName ?? '',
    agencyContactPhone: leader.agencyContactPhone ?? '',
    agencyContactEmail: leader.agencyContactEmail ?? '',
    agencyRefCode: leader.agencyRefCode ?? '',

    // deep copy — แก้ไขในฟอร์มต้องไม่กระทบ record เดิมจนกว่าจะกดบันทึก
    contacts: leader.contacts.map((c) => ({ ...c })),
    // ผ่าน migrate เพื่อรองรับข้อมูลเดิม (คืน object ใหม่ทุกครั้งอยู่แล้ว ไม่ต้อง deep copy ซ้ำ)
    languages: leader.languages.map((l) => migrateLanguageSkill(l)),
    assignedCountries: leader.assignedCountries.map((a) => ({ ...a })),
    routeSkills: leader.routeSkills.map((s) => ({ ...s, routeIds: [...s.routeIds] })),
    tourSkills: leader.tourSkills.map((s) => ({ ...s })),
    // เรียงตามลำดับที่ผู้ใช้บันทึกไว้ล่าสุด (sortOrder) แล้ว deep copy
    employmentHistory: sortByDisplayOrder(leader.employmentHistory).map((e) => ({ ...e })),
    documents: leader.documents.map((d) => ({ ...d })),
    bankAccounts: leader.bankAccounts.map((b) => ({ ...b })),
    emergencyContacts: leader.emergencyContacts.map((c) => ({ ...c })),

    generalNote: leader.generalNote,
    internalNote: leader.internalNote,
    cautions: leader.cautions,
  };
}

/* ---------------------------- ฟอร์ม → record ที่บันทึก --------------------------- */

export interface BuildContext {
  /** record เดิม (undefined = สร้างใหม่) */
  existing?: TourLeader;
  routes: TourRoute[];
  actor: string;
  now: string; // ISO datetime
  today: string; // ISO date
}

/**
 * ตัดช่องว่างหัวท้ายของทุกฟิลด์ที่อยู่ และแปลงค่าว่างเป็น undefined
 * `fallbackCountryId` — ที่อยู่ในไทยใช้ C-TH เป็นค่าเริ่มต้น ส่วนที่อยู่ต่างประเทศต้องเลือกเอง
 */
function cleanAddress(address: LeaderAddress, fallbackCountryId = DEFAULT_COUNTRY_ID): LeaderAddress {
  return {
    houseNo: address.houseNo.trim(),
    building: address.building?.trim() || undefined,
    villageNo: address.villageNo?.trim() || undefined,
    alley: address.alley?.trim() || undefined,
    road: address.road?.trim() || undefined,
    subdistrict: address.subdistrict?.trim() || undefined,
    district: address.district?.trim() || undefined,
    province: address.province?.trim() || undefined,
    // รหัสจังหวัด/อำเภอ จาก Master เขตปกครองไทย — เก็บคู่กับชื่อ
    provinceCode: address.provinceCode || undefined,
    districtCode: address.districtCode || undefined,
    postalCode: address.postalCode?.trim() || undefined,
    countryId: address.countryId || fallbackCountryId,
    note: address.note?.trim() || undefined,
  };
}

/** ทำความสะอาดข้อมูลภาษาหนึ่งรายการก่อนบันทึก — trim ข้อความ, ล้างระดับเมื่อเป็นภาษาแม่ (ไม่ต้องระบุ) */
function cleanLanguageSkill(skill: LanguageSkill): LanguageSkill {
  return {
    id: skill.id,
    languageCode: skill.languageCode,
    languageName: skill.languageName.trim(),
    isNativeLanguage: skill.isNativeLanguage,
    standard: skill.standard,
    levelCode: skill.isNativeLanguage ? null : skill.levelCode,
    levelName: skill.isNativeLanguage ? null : skill.levelName,
    levelRank: skill.isNativeLanguage ? null : skill.levelRank,
  };
}

export function formToLeader(form: LeaderFormState, ctx: BuildContext): TourLeader {
  const { existing, routes, actor, now, today } = ctx;

  /* ที่อยู่ — ติ๊ก "เหมือนกับที่อยู่ปัจจุบัน" → บันทึกสำเนาที่อยู่ปัจจุบัน */
  const address = cleanAddress(form.address);
  const idCardAddress = form.idCardSameAsCurrent ? { ...address } : cleanAddress(form.idCardAddress);

  /* เอกสารประจำตัว — บันทึกเฉพาะชุดของประเภทที่เลือก
     ฟิลด์ของอีกประเภทถูกตัดทิ้งเสมอ แม้ผู้ใช้เคยกรอกไว้ก่อนเปลี่ยนประเภท */
  const isThai = form.personType === 'thai';
  const isForeigner = form.personType === 'foreigner';
  const hasVisa = isForeigner && form.visaStatus === 'has';
  const hasWorkPermit = isForeigner && form.workPermitStatus === 'has';
  // ที่อยู่ต้นทางเป็นข้อมูลเสริม — บันทึกเฉพาะเมื่อผู้ใช้เปิดสวิตช์ไว้
  const hasHomeAddress = isForeigner && form.hasHomeCountryAddress;

  /* รายละเอียดตามรูปแบบการร่วมงาน — เก็บเฉพาะของรูปแบบที่เลือก
     รูปแบบ "ทั่วไป" ไม่มีข้อมูลเพิ่มเติม จึงเป็น undefined ทั้งหมด */
  const isRegular = form.leaderType === 'regular';
  const isFreelance = form.leaderType === 'freelance';
  const isAgent = form.leaderType === 'agent';
  const parsedRate = Number(form.payRate);

  const leaderTypeDetails = {
    employeeCode: isRegular ? form.employeeCode.trim() || undefined : undefined,
    team: isRegular ? form.team.trim() || undefined : undefined,
    workStatus: isRegular ? form.workStatus : undefined,

    payType: isFreelance ? form.payType : undefined,
    payRate:
      isFreelance && form.payRate.trim() !== '' && Number.isFinite(parsedRate)
        ? parsedRate
        : undefined,
    payUnit: isFreelance ? form.payUnit : undefined,

    agencyName: isAgent ? form.agencyName.trim() || undefined : undefined,
    agencyContactName: isAgent ? form.agencyContactName.trim() || undefined : undefined,
    agencyContactPhone: isAgent ? form.agencyContactPhone.trim() || undefined : undefined,
    agencyContactEmail: isAgent ? form.agencyContactEmail.trim() || undefined : undefined,
    agencyRefCode: isAgent ? form.agencyRefCode.trim() || undefined : undefined,
  };

  const personalDocs = {
    // ต้องมีค่าเสมอ — ห้ามบันทึกเป็นค่าว่าง/null (ฟอร์มไม่มีค่า → ใช้ค่าเริ่มต้น)
    personType: form.personType ?? DEFAULT_PERSON_TYPE,

    // คนไทย — เลขบัตรประชาชนถูกปิดบังเสมอก่อนบันทึก
    nationalIdNumber:
      isThai && form.nationalIdNumber.trim()
        ? maskDocumentNumber('national_id', form.nationalIdNumber)
        : undefined,
    nationalIdExpiresAt: isThai ? form.nationalIdExpiresAt || undefined : undefined,
    idCardAddress: isThai ? idCardAddress : undefined,
    idCardAddressSameAsCurrent: isThai ? form.idCardSameAsCurrent : undefined,

    // ชาวต่างชาติ — เลขหนังสือเดินทางถูกปิดบังเสมอก่อนบันทึก
    passportNumber:
      isForeigner && form.passportNumber.trim()
        ? maskDocumentNumber('passport', form.passportNumber)
        : undefined,
    birthCountryId: isForeigner ? form.birthCountryId || undefined : undefined,
    passportCountryId: isForeigner ? form.passportCountryId || undefined : undefined,
    passportIssuedAt: isForeigner ? form.passportIssuedAt || undefined : undefined,
    passportExpiresAt: isForeigner ? form.passportExpiresAt || undefined : undefined,

    // รายละเอียดวีซ่า/ใบอนุญาตทำงาน เก็บเฉพาะเมื่อสถานะเป็น "มี"
    visaStatus: isForeigner ? form.visaStatus : undefined,
    visaNumber: hasVisa ? form.visaNumber.trim() || undefined : undefined,
    visaType: hasVisa ? form.visaType.trim() || undefined : undefined,
    visaExpiresAt: hasVisa ? form.visaExpiresAt || undefined : undefined,
    workPermitStatus: isForeigner ? form.workPermitStatus : undefined,
    workPermitNumber: hasWorkPermit ? form.workPermitNumber.trim() || undefined : undefined,
    workPermitExpiresAt: hasWorkPermit ? form.workPermitExpiresAt || undefined : undefined,

    // ที่อยู่ต่างประเทศ — ไม่บังคับกรอก จึงบันทึกเฉพาะเมื่อมีข้อมูลจริง
    homeCountryAddress:
      isForeigner && hasHomeAddress ? cleanAddress(form.homeCountryAddress, '') : undefined,
  };

  // ต่างชาติที่ไม่กรอกชื่อไทย → ใช้ชื่อตามหนังสือเดินทางทำอักษรย่อ
  const initials = initialsOf(
    form.firstName.trim() || form.firstNameEn,
    form.lastName.trim() || form.lastNameEn,
  );

  /* ประวัติการเปลี่ยนประเภท — เก็บทุกครั้งที่ประเภทเปลี่ยน */
  const typeHistory: TypeHistoryEntry[] = existing ? [...existing.typeHistory] : [];
  const typeChanged = !existing || existing.leaderType !== form.leaderType;
  if (typeChanged) {
    typeHistory.unshift({
      id: newChildId('TH'),
      from: existing ? existing.leaderType : null,
      to: form.leaderType,
      effectiveDate: form.typeStartDate || today,
      at: now,
      by: actor,
      reason: form.typeChangeReason.trim() || undefined,
    });
  }

  /* ทำความสะอาดข้อมูลก่อนบันทึก */
  const contacts = form.contacts
    .filter((c) => c.value.trim() !== '') // ห้ามบันทึกรายการว่าง
    .map((c) => ({
      ...c,
      value: c.value.trim(),
      label: c.label?.trim() || undefined,
      preferredContactTime: c.preferredContactTime?.trim() || undefined,
      note: c.note?.trim() || undefined,
    }));

  const documents = form.documents
    .filter((d) => d.name.trim() !== '')
    .map((d) => ({
      ...d,
      name: d.name.trim(),
      // เลขเอกสารอ่อนไหวถูกปิดบังก่อนบันทึกเสมอ
      number: maskDocumentNumber(d.kind, d.number),
      fileName: d.fileName.trim() || 'ไม่มีไฟล์แนบ',
      note: d.note?.trim() || undefined,
    }));

  const bankAccounts = form.bankAccounts
    .filter((b) => b.bank.trim() !== '' && b.accountName.trim() !== '')
    .map((b) => ({
      ...b,
      accountName: b.accountName.trim(),
      // ปิดบังเลขบัญชีเสมอ (รองรับกรณีผู้ใช้กรอกเลขจริงเข้ามา)
      accountNoMasked: b.accountNoMasked.includes('x')
        ? b.accountNoMasked
        : maskAccountNumber(b.accountNoMasked),
      branch: b.branch?.trim() || undefined,
      promptPay: b.promptPay?.trim() || undefined,
    }));

  return {
    id: form.id,
    title: form.title,
    titleEn: form.titleEn.trim() || undefined,
    // บุคคลต่างชาติไม่บังคับชื่อไทย — ใช้ชื่อตามหนังสือเดินทางแทนเพื่อไม่ให้รายการแสดงชื่อว่าง
    firstName: form.firstName.trim() || (isForeigner ? form.firstNameEn.trim() : ''),
    lastName: form.lastName.trim() || (isForeigner ? form.lastNameEn.trim() : ''),
    firstNameEn: form.firstNameEn.trim(),
    lastNameEn: form.lastNameEn.trim(),
    nickname: form.nickname.trim(),
    nicknameEn: form.nicknameEn.trim() || undefined,
    gender: form.gender,
    birthDate: form.birthDate,
    // บุคคลสัญชาติไทย — สัญชาติถูกกำหนดเป็นไทยเสมอ
    nationalityCountryId: isThai ? DEFAULT_COUNTRY_ID : form.nationalityCountryId,
    religion: form.religion,
    // เก็บข้อความระบุเพิ่มเติมเฉพาะเมื่อเลือก "ศาสนาอื่น"
    religionOther: form.religion === 'other' ? form.religionOther.trim() || undefined : undefined,
    maritalStatus: form.maritalStatus,
    avatarInitials: initials,
    avatarColor:
      existing?.avatarColor ??
      AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    photoUrl: form.photoUrl,
    // สถานะการใช้งาน — แหล่งความจริง · active เป็นค่าสะท้อน (ฟอร์มนี้แก้ได้แค่ใช้งาน/สิ้นสุด)
    usageStatus: form.active ? 'active' : 'ended',
    active: form.active,

    leaderType: form.leaderType,
    typeStartDate: form.typeStartDate || today,
    typeHistory,
    // รายละเอียดตามรูปแบบการร่วมงาน (ของรูปแบบอื่นถูกตัดออกเสมอ)
    ...leaderTypeDetails,
    joinedAt: form.joinedAt || today,
    availableStartDate: form.availableStartDate || today,
    availabilityMode: form.availabilityMode,
    // เก็บช่วงวันที่เฉพาะเมื่อเลือก "รับตามช่วงเวลาที่กำหนด"
    availabilityFrom:
      form.availabilityMode === 'date_range' ? form.availabilityFrom || undefined : undefined,
    availabilityTo:
      form.availabilityMode === 'date_range' ? form.availabilityTo || undefined : undefined,
    source: form.source.trim(),
    sourceType: form.sourceType,
    sourceOther: form.sourceType === 'other' ? form.sourceOther.trim() || undefined : undefined,
    compensationNote: form.compensationNote.trim(),
    availabilityNote: form.availabilityNote.trim(),
    typeNote: form.typeNote.trim(),
    status: form.status,

    contacts,
    languages: form.languages.map(cleanLanguageSkill),
    assignedCountries: form.assignedCountries,
    // ล้างเส้นทางที่ไม่อยู่ในประเทศ และไม่บันทึก routeIds เมื่อเลือก "ทุกเส้นทาง"
    routeSkills: normalizeAllRouteSkills(form.routeSkills, routes),
    tourSkills: form.tourSkills,

    // ประวัติการทำงาน — ตัดรายการว่างออก และล้างวันสิ้นสุดเมื่อยังทำงานอยู่
    employmentHistory: form.employmentHistory
      .filter((e) => e.employerName.trim() !== '')
      .map((e, index) => ({
        ...e,
        tourLeaderId: form.id,
        employerName: e.employerName.trim(),
        position: e.position.trim(),
        endMonth: e.isCurrentJob ? undefined : e.endMonth,
        endYear: e.isCurrentJob ? undefined : e.endYear,
        reasonForLeaving: e.isCurrentJob ? undefined : e.reasonForLeaving?.trim() || undefined,
        // บันทึกลำดับที่ผู้ใช้จัดไว้ (ตามลำดับในฟอร์ม) เพื่อคงไว้เมื่อโหลดใหม่
        sortOrder: index,
        updatedAt: now,
      })),

    documents,
    bankAccounts,
    // ที่อยู่ — เก็บแยกฟิลด์ ตัดช่องว่างหัวท้าย
    address,
    // เอกสารประจำตัวตามประเภทบุคคล (ชุดของอีกประเภทถูกตัดออกแล้ว)
    ...personalDocs,
    emergencyContacts: form.emergencyContacts
      .filter((c) => c.name.trim() !== '')
      .map((c) => ({
        ...c,
        name: c.name.trim(),
        relation: c.relation.trim(),
        phone: c.phone.trim(),
        otherChannel: c.otherChannel?.trim() || undefined,
        note: c.note?.trim() || undefined,
      })),
    generalNote: form.generalNote,
    internalNote: form.internalNote,
    cautions: form.cautions,

    // ข้อมูลสะสมและประวัติ — ต้องไม่หายเมื่อแก้ไขข้อมูลส่วนอื่น
    rating: existing?.rating ?? 0,
    totalJobs: existing?.totalJobs ?? 0,
    totalDays: existing?.totalDays ?? 0,
    evaluations: existing?.evaluations ?? [],
    auditLog: existing?.auditLog ?? [],

    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? actor,
    updatedAt: now,
    updatedBy: actor,
  };
}
