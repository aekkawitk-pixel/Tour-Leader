/**
 * Validation ของฟอร์มหัวหน้าทัวร์ (Step Form 5 ขั้นตอน) — ฟังก์ชันบริสุทธิ์ ไม่มี UI
 * คืนข้อผิดพลาดพร้อม step และ field เพื่อให้ UI เลื่อนไปยังช่องแรกที่ผิดได้
 */

import type {
  ContactChannel,
  EmploymentHistory,
  LeaderAddress,
  TourLeader,
} from '@/types';
import { findProvinceByCode, findProvinceByName } from '@/data/thaiAdmin';
import type { FormStepKey, StepStatus } from './constants';
import { daysBetween } from '@/lib/format';
import {
  DEFAULT_COUNTRY_ID,
  DOC_EXPIRY_WARNING_DAYS,
  LEADER_CODE_PATTERN,
  MASKED_NUMBER_PATTERN,
  NAME_EN_PATTERN,
  NAME_TH_PATTERN,
  NOTE_MAX_LENGTH,
  NATIONAL_ID_PATTERN,
  POSTAL_CODE_PATTERN,
} from './constants';
import type { LeaderFormState } from './mappers';
import { isLeaderCodeUnique } from './utils';
import { rangeOf, hasOverlappingRanges } from './experience';

export interface FieldError {
  step: FormStepKey;
  /** คีย์สำหรับผูกกับ input (ใช้ id ของ child record ได้) */
  field: string;
  message: string;
  /** คำเตือน — บันทึกได้ แต่ควรตรวจสอบ */
  isWarning?: boolean;
}

export interface ValidationResult {
  ok: boolean;
  errors: FieldError[];
  warnings: FieldError[];
  byField: Record<string, string>;
  firstStep?: FormStepKey;
  firstField?: string;
}

/** เบอร์โทร — รองรับรหัสประเทศนำหน้า เช่น +66 81-234-5678 หรือ +1 (555) 123-4567 */
const PHONE_RE = /^\+?[0-9][0-9\-() ]{7,24}$/;

/** จังหวัดต้องมาจาก Master — ยอมรับทั้งกรณีมีรหัส และกรณีข้อมูลเดิมที่มีแต่ชื่อตรงกับรายการ */
function isProvinceFromMaster(address: LeaderAddress): boolean {
  if (address.provinceCode) return Boolean(findProvinceByCode(address.provinceCode));
  return Boolean(findProvinceByName(address.province ?? ''));
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#].*)?$/i;
/** ชื่อผู้ใช้โซเชียล เช่น @somchai หรือ somchai.tour */
const HANDLE_RE = /^@?[\w.]{2,30}$/;

/** ตรวจรูปแบบข้อมูลตามชนิดช่องทางติดต่อ */
export function validateContactValue(channel: ContactChannel): string | undefined {
  const value = channel.value.trim();
  if (!value) return 'กรุณากรอกข้อมูลช่องทางติดต่อ';

  switch (channel.type) {
    case 'phone':
    case 'whatsapp':
      return PHONE_RE.test(value)
        ? undefined
        : 'รูปแบบเบอร์โทรไม่ถูกต้อง (เช่น 081-234-5678 หรือ +66 81-234-5678)';
    case 'email':
      return EMAIL_RE.test(value) ? undefined : 'รูปแบบอีเมลไม่ถูกต้อง';
    case 'website':
      return URL_RE.test(value) ? undefined : 'รูปแบบ URL ไม่ถูกต้อง (เช่น https://example.com)';
    // โซเชียล — รับได้ทั้ง URL เต็มและชื่อผู้ใช้ (@username)
    case 'facebook':
    case 'instagram':
    case 'tiktok':
      return URL_RE.test(value) || HANDLE_RE.test(value)
        ? undefined
        : 'กรอกชื่อผู้ใช้ (เช่น @username) หรือ URL เต็ม';
    default:
      return undefined;
  }
}

/** ตรวจประวัติการทำงานหนึ่งรายการ */
export function validateEmploymentEntry(
  entry: EmploymentHistory,
  today: string,
): string | undefined {
  if (!entry.employerName.trim()) return 'กรุณากรอกชื่อสถานประกอบการ';
  if (!entry.position.trim()) return 'กรุณากรอกหน้าที่หรือตำแหน่ง';
  if (!entry.startMonth || !entry.startYear) return 'กรุณาระบุเดือนและปีที่เริ่มงาน';

  if (!entry.isCurrentJob) {
    if (!entry.endMonth || !entry.endYear) return 'กรุณาระบุเดือนและปีที่สิ้นสุด';
    if (!entry.reasonForLeaving?.trim()) return 'กรุณาระบุเหตุผลที่ออก';
  }

  if (entry.salary !== undefined && (Number.isNaN(entry.salary) || entry.salary < 0)) {
    return 'เงินเดือนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป';
  }
  if (entry.employerPhone?.trim() && !PHONE_RE.test(entry.employerPhone.trim())) {
    return 'รูปแบบเบอร์โทรของสถานประกอบการไม่ถูกต้อง';
  }
  if (rangeOf(entry, today) === null) {
    return 'วันที่เริ่มต้องไม่มากกว่าวันที่สิ้นสุด';
  }
  return undefined;
}

export function validateLeaderForm(
  form: LeaderFormState,
  context: { existingLeaders: TourLeader[]; isNew: boolean; today: string },
): ValidationResult {
  const errors: FieldError[] = [];
  const warnings: FieldError[] = [];

  const add = (step: FormStepKey, field: string, message: string) =>
    errors.push({ step, field, message });
  const warn = (step: FormStepKey, field: string, message: string) =>
    warnings.push({ step, field, message, isWarning: true });

  /**
   * เตือนเอกสารหมดอายุ / ใกล้หมดอายุ — เป็นคำเตือน ไม่บล็อกการบันทึก
   * (เอกสารที่กำลังรอต่ออายุยังต้องบันทึกข้อมูลบุคคลได้)
   */
  const expiryCheck = (field: string, expiresAt: string, docName: string) => {
    if (!expiresAt) return;
    if (expiresAt < context.today) {
      warn('general', field, `${docName}หมดอายุแล้ว — ต่ออายุก่อนมอบหมายงาน`);
      return;
    }
    const days = daysBetween(context.today, expiresAt);
    if (days <= DOC_EXPIRY_WARNING_DAYS) {
      warn('general', field, `${docName}จะหมดอายุในอีก ${days} วัน — ควรเตือนให้ต่ออายุ`);
    }
  };

  /* ======================= ขั้นตอนที่ 1: ข้อมูลทั่วไป ====================== */

  /* --- Card 1: ข้อมูลส่วนบุคคล ---
     รหัสสร้างโดยระบบและอ่านอย่างเดียว — ตรวจเป็นด่านสุดท้ายกันข้อมูลเพี้ยน
     (ค่าว่าง / รูปแบบผิด / ซ้ำ) แม้ปกติผู้ใช้จะแก้ไขไม่ได้ */
  if (!form.id.trim()) {
    add('general', 'id', 'ยังไม่มีรหัสหัวหน้าทัวร์ — ระบบจะสร้างให้อัตโนมัติ');
  } else if (!LEADER_CODE_PATTERN.test(form.id.trim())) {
    add('general', 'id', 'รูปแบบรหัสหัวหน้าทัวร์ไม่ถูกต้อง (เช่น TL-0001)');
  } else if (
    !isLeaderCodeUnique(form.id, context.existingLeaders, context.isNew ? undefined : form.id)
  ) {
    add('general', 'id', 'รหัสหัวหน้าทัวร์นี้ถูกใช้แล้ว กรุณาใช้รหัสอื่น');
  }
  const isThai = form.personType === 'thai';
  const isForeigner = form.personType === 'foreigner';

  if (!form.title.trim()) add('general', 'title', 'กรุณาเลือกคำนำหน้าชื่อ');

  /* ชื่อ — บุคคลสัญชาติไทยบังคับชื่อไทย · บุคคลต่างชาติบังคับชื่อตามหนังสือเดินทาง
     ชื่อเล่นไม่บังคับทั้งไทยและอังกฤษ */
  if (!isForeigner) {
    if (!form.firstName.trim()) add('general', 'firstName', 'กรุณากรอกชื่อภาษาไทย');
    if (!form.lastName.trim()) add('general', 'lastName', 'กรุณากรอกนามสกุลภาษาไทย');
  }

  // ชื่อภาษาไทย — อักษรไทย ช่องว่าง จุด และขีดกลางเท่านั้น (ตรวจเมื่อกรอกแล้ว)
  const THAI_NAME_HINT = 'ใช้ได้เฉพาะอักษรไทย ช่องว่าง จุด และเครื่องหมายขีด';
  if (form.firstName.trim() && !NAME_TH_PATTERN.test(form.firstName.trim())) {
    add('general', 'firstName', THAI_NAME_HINT);
  }
  if (form.lastName.trim() && !NAME_TH_PATTERN.test(form.lastName.trim())) {
    add('general', 'lastName', THAI_NAME_HINT);
  }
  if (form.nickname.trim() && !NAME_TH_PATTERN.test(form.nickname.trim())) {
    add('general', 'nickname', THAI_NAME_HINT);
  }
  if (form.nicknameEn.trim() && !NAME_EN_PATTERN.test(form.nicknameEn.trim())) {
    add(
      'general',
      'nicknameEn',
      'ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษ ช่องว่าง จุด ขีดกลาง และ apostrophe',
    );
  }

  if (isForeigner) {
    if (!form.firstNameEn.trim()) {
      add('general', 'firstNameEn', 'กรุณากรอกชื่อตามหนังสือเดินทาง');
    }
    if (!form.lastNameEn.trim()) {
      add('general', 'lastNameEn', 'กรุณากรอกนามสกุลตามหนังสือเดินทาง');
    }
  }

  // ชื่อภาษาอังกฤษ — ตัวอักษร ช่องว่าง ขีดกลาง และ apostrophe เท่านั้น (ตรวจเมื่อกรอกแล้ว)
  if (form.firstNameEn.trim() && !NAME_EN_PATTERN.test(form.firstNameEn.trim())) {
    add('general', 'firstNameEn', 'ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษ ช่องว่าง ขีดกลาง และ apostrophe');
  }
  if (form.lastNameEn.trim() && !NAME_EN_PATTERN.test(form.lastNameEn.trim())) {
    add('general', 'lastNameEn', 'ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษ ช่องว่าง ขีดกลาง และ apostrophe');
  }

  if (!form.birthDate) {
    add('general', 'birthDate', 'กรุณาระบุวันเดือนปีเกิด');
  } else if (form.birthDate > context.today) {
    add('general', 'birthDate', 'วันเกิดต้องไม่เป็นวันในอนาคต');
  }

  if (!form.gender) add('general', 'gender', 'กรุณาเลือกเพศ');

  /* สัญชาติ — คนไทยถูกกำหนดเป็นไทยอัตโนมัติ · ต่างชาติต้องเลือกและห้ามเป็นไทย */
  if (!isThai) {
    if (!form.nationalityCountryId) {
      add('general', 'nationality', 'กรุณาเลือกสัญชาติ');
    } else if (isForeigner && form.nationalityCountryId === DEFAULT_COUNTRY_ID) {
      add('general', 'nationality', 'บุคคลต่างชาติต้องไม่ใช้สัญชาติไทย — เลือกประเทศอื่น');
    }
  }

  // ศาสนาไม่บังคับ — แต่ถ้าเลือก "ศาสนาอื่น" ต้องระบุเพิ่มเติม
  if (form.religion === 'other' && !form.religionOther.trim()) {
    add('general', 'religionOther', 'กรุณาระบุศาสนาเพิ่มเติม');
  }

  /* --- Card 3: ที่อยู่ปัจจุบัน "ไม่บังคับ" (§3) — เว้นว่างได้ทั้งหมด
     ตรวจเฉพาะช่องที่กรอก (§4): จังหวัดต้องเลือกจากรายการ · รหัสไปรษณีย์ 5 หลัก */
  if (form.address.province?.trim() && !isProvinceFromMaster(form.address)) {
    add('general', 'province', 'กรุณาเลือกจังหวัดจากรายการ');
  }
  if (form.address.postalCode?.trim() && !POSTAL_CODE_PATTERN.test(form.address.postalCode.trim())) {
    add('general', 'postalCode', 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก');
  }

  /* --- Card 3–4: เอกสารและที่อยู่ตามประเภทบุคคล ---
     ตรวจเฉพาะชุดของประเภทที่เลือกไว้ — ฟิลด์ของอีกประเภทถูกซ่อนและไม่ขัดขวางการบันทึก */
  if (!form.personType) {
    add('general', 'personType', 'กรุณาเลือกประเภทบุคคล');
  }

  if (isThai) {
    /* §2 ข้อมูลบัตรประชาชน "ไม่บังคับ" — เว้นว่างได้ทั้งเลขบัตรและวันหมดอายุ
       ตรวจรูปแบบเฉพาะเมื่อผู้ใช้กรอกค่าแล้วเท่านั้น (ไม่บังคับให้กรอกพร้อมกัน) */
    const idNumber = form.nationalIdNumber.trim();
    const digits = idNumber.replace(/\D/g, '');
    // เลขที่โหลดกลับมาแก้ไขถูกปิดบังไว้แล้ว (มี x) จึงข้ามการตรวจรูปแบบ
    if (idNumber && !NATIONAL_ID_PATTERN.test(idNumber) && !MASKED_NUMBER_PATTERN.test(idNumber)) {
      add(
        'general',
        'nationalIdNumber',
        `กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก (ตัวเลขเท่านั้น · ตอนนี้กรอก ${digits.length} หลัก)`,
      );
    }
    if (form.nationalIdExpiresAt) {
      expiryCheck('nationalIdExpiresAt', form.nationalIdExpiresAt, 'บัตรประชาชน');
    }

    /* ที่อยู่ตามบัตรประชาชน "ไม่บังคับ" (§5) — ติ๊ก "เหมือนกับที่อยู่ปัจจุบัน" ใช้ค่าที่ตรวจแล้ว
       เว้นว่างได้ทั้งหมด · ตรวจเฉพาะช่องที่กรอก (จังหวัดจากรายการ · รหัสไปรษณีย์ 5 หลัก §4) */
    if (!form.idCardSameAsCurrent) {
      if (form.idCardAddress.province?.trim() && !isProvinceFromMaster(form.idCardAddress)) {
        add('general', 'idCardProvince', 'กรุณาเลือกจังหวัดจากรายการ');
      }
      if (form.idCardAddress.postalCode?.trim() && !POSTAL_CODE_PATTERN.test(form.idCardAddress.postalCode.trim())) {
        add('general', 'idCardPostalCode', 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก');
      }
    }
  }

  if (isForeigner) {
    if (!form.birthCountryId) {
      add('general', 'birthCountryId', 'กรุณาเลือกประเทศที่เกิด');
    }

    if (!form.passportNumber.trim()) {
      add('general', 'passportNumber', 'กรุณากรอกหมายเลขหนังสือเดินทาง');
    }
    if (!form.passportCountryId) {
      add('general', 'passportCountryId', 'กรุณาเลือกประเทศผู้ออกหนังสือเดินทาง');
    }
    if (!form.passportIssuedAt) {
      add('general', 'passportIssuedAt', 'กรุณาระบุวันที่ออกหนังสือเดินทาง');
    } else if (form.passportIssuedAt > context.today) {
      add('general', 'passportIssuedAt', 'วันที่ออกหนังสือเดินทางต้องไม่เป็นวันในอนาคต');
    }
    if (!form.passportExpiresAt) {
      add('general', 'passportExpiresAt', 'กรุณาระบุวันหมดอายุหนังสือเดินทาง');
    } else if (form.passportIssuedAt && form.passportExpiresAt <= form.passportIssuedAt) {
      add(
        'general',
        'passportExpiresAt',
        'วันหมดอายุต้องอยู่หลังวันที่ออกหนังสือเดินทาง — ตรวจสอบวันที่ทั้งสองช่องอีกครั้ง',
      );
    } else {
      expiryCheck('passportExpiresAt', form.passportExpiresAt, 'หนังสือเดินทาง');
    }

    /* วีซ่า — กรอกรายละเอียดเฉพาะเมื่อสถานะเป็น "มี" */
    if (!form.visaStatus) {
      add('general', 'visaStatus', 'กรุณาเลือกสถานะวีซ่า (มี / ไม่มี / ไม่เกี่ยวข้อง)');
    } else if (form.visaStatus === 'has') {
      if (!form.visaType.trim()) add('general', 'visaType', 'กรุณาระบุประเภทวีซ่า เช่น Non-B');
      if (!form.visaNumber.trim()) add('general', 'visaNumber', 'กรุณากรอกหมายเลขวีซ่าตามหน้าวีซ่า');
      if (!form.visaExpiresAt) {
        add('general', 'visaExpiresAt', 'กรุณาระบุวันหมดอายุวีซ่า');
      } else {
        expiryCheck('visaExpiresAt', form.visaExpiresAt, 'วีซ่า');
      }
    }

    /* ใบอนุญาตทำงาน — กรอกรายละเอียดเฉพาะเมื่อสถานะเป็น "มี" */
    if (!form.workPermitStatus) {
      add(
        'general',
        'workPermitStatus',
        'กรุณาเลือกสถานะใบอนุญาตทำงาน (มี / ไม่มี / ไม่เกี่ยวข้อง)',
      );
    } else if (form.workPermitStatus === 'has') {
      if (!form.workPermitNumber.trim()) {
        add('general', 'workPermitNumber', 'กรุณากรอกหมายเลขใบอนุญาตทำงาน');
      }
      if (!form.workPermitExpiresAt) {
        add('general', 'workPermitExpiresAt', 'กรุณาระบุวันหมดอายุใบอนุญาตทำงาน');
      } else {
        expiryCheck('workPermitExpiresAt', form.workPermitExpiresAt, 'ใบอนุญาตทำงาน');
      }
    }

    /* ที่อยู่ในประเทศต้นทาง — ข้อมูลเสริม
       สวิตช์ปิด = ช่องถูกซ่อน จึงต้องไม่ตรวจและไม่ขัดขวางการบันทึก */
    if (form.hasHomeCountryAddress) {
      if (!form.homeCountryAddress.houseNo.trim()) {
        add('general', 'homeAddressLine', 'กรุณากรอกที่อยู่ในประเทศต้นทาง');
      }
      if (!form.homeCountryAddress.countryId) {
        add('general', 'homeCountry', 'กรุณาเลือกประเทศของที่อยู่ในประเทศต้นทาง');
      }
    }
  }

  /* --- รูปแบบการร่วมงาน + รายละเอียดเฉพาะของรูปแบบที่เลือก ---
     รูปแบบอื่นถูกซ่อน จึงไม่ตรวจและไม่ขัดขวางการบันทึก */
  if (!form.leaderType) add('general', 'leaderType', 'กรุณาเลือกรูปแบบการร่วมงาน');

  /* หัวหน้าทัวร์ประจำ — ไม่มีรายละเอียดที่ต้องกรอกแล้ว
     รหัสพนักงาน · วันที่เริ่มรูปแบบนี้ · หน่วยงาน/ทีม · สถานะการร่วมงาน ถูกนำออกจากหน้าจอ
     จึงต้องไม่บังคับกรอก (ฟิลด์ยังอยู่ในโมเดล · ค่าเดิมที่เคยบันทึกไว้ไม่ถูกแตะ)
     ⚠️ ห้ามเพิ่มเงื่อนไขบังคับให้ฟิลด์ที่ไม่มีช่องกรอกบนหน้าจอ — จะบันทึกไม่ได้และผู้ใช้แก้ไม่ได้ */

  if (form.leaderType === 'freelance') {
    if (!form.payType) {
      add('general', 'payType', 'กรุณาเลือกรูปแบบค่าจ้าง');
    }
    // อัตราค่าจ้างไม่บังคับ — แต่ถ้ากรอกต้องเป็นตัวเลขบวกและมีหน่วยกำกับ
    if (form.payRate.trim()) {
      const rate = Number(form.payRate);
      if (!Number.isFinite(rate) || rate <= 0) {
        add('general', 'payRate', 'อัตราค่าจ้างต้องเป็นตัวเลขมากกว่า 0');
      }
      if (!form.payUnit) {
        add('general', 'payUnit', 'กรอกอัตราค่าจ้างแล้วต้องเลือกหน่วย (ต่อวัน / ต่อทริป)');
      }
    }
  }

  if (form.leaderType === 'agent') {
    if (!form.agencyName.trim()) {
      add('general', 'agencyName', 'กรุณากรอกชื่อเอเจนซี่');
    }
    if (!form.agencyContactName.trim()) {
      add('general', 'agencyContactName', 'กรุณากรอกชื่อผู้ติดต่อของเอเจนซี่');
    }
    if (!form.agencyContactPhone.trim()) {
      add('general', 'agencyContactPhone', 'กรุณากรอกเบอร์โทรศัพท์ผู้ติดต่อ');
    } else if (!PHONE_RE.test(form.agencyContactPhone.trim())) {
      add(
        'general',
        'agencyContactPhone',
        'รูปแบบเบอร์โทรไม่ถูกต้อง (เช่น 081-234-5678 หรือ +66 81-234-5678)',
      );
    }
    // อีเมลผู้ติดต่อไม่บังคับ — แต่ถ้ากรอกต้องถูกรูปแบบ
    if (form.agencyContactEmail.trim() && !EMAIL_RE.test(form.agencyContactEmail.trim())) {
      add('general', 'agencyContactEmail', 'รูปแบบอีเมลไม่ถูกต้อง (เช่น name@example.com)');
    }
  }

  /* --- Card 5: ข้อมูลระบบและหมายเหตุ --- */
  if (!form.joinedAt) add('general', 'joinedAt', 'กรุณาระบุวันที่เริ่มร่วมงาน');
  if (form.joinedAt && form.typeStartDate && form.typeStartDate < form.joinedAt) {
    add('general', 'typeStartDate', 'วันที่เริ่มประเภทต้องไม่อยู่ก่อนวันที่เริ่มร่วมงาน');
  }
  if (form.sourceType === 'other' && !form.sourceOther.trim()) {
    add('general', 'sourceOther', 'กรุณาระบุช่องทางอื่นเพิ่มเติม');
  }

  /* หมายเหตุ — ไม่บังคับ แต่จำกัดความยาว (UI มี maxLength กำกับอีกชั้น) */
  const noteFields = [
    { key: 'generalNote', label: 'หมายเหตุทั่วไป', value: form.generalNote },
    { key: 'internalNote', label: 'หมายเหตุภายใน', value: form.internalNote },
    { key: 'cautions', label: 'ข้อควรระวัง', value: form.cautions },
  ] as const;
  for (const note of noteFields) {
    const max = NOTE_MAX_LENGTH[note.key];
    if (note.value.length > max) {
      add('general', note.key, `${note.label}ยาวเกิน ${max} ตัวอักษร — กรุณาย่อข้อความ`);
    }
  }

  /* ======================== ขั้นตอนที่ 2: การติดต่อ ======================= */
  const filledContacts = form.contacts.filter((c) => c.value.trim() !== '');
  if (filledContacts.length === 0) {
    add('contact', 'contacts', 'ต้องมีช่องทางติดต่ออย่างน้อย 1 รายการ');
  } else {
    for (const channel of filledContacts) {
      const message = validateContactValue(channel);
      if (message) add('contact', channel.id, message);
    }
    const primaries = filledContacts.filter((c) => c.isPrimary).length;
    if (primaries === 0) add('contact', 'contacts', 'กรุณากำหนดช่องทางหลัก 1 รายการ');
    if (primaries > 1) add('contact', 'contacts', 'กำหนดช่องทางหลักได้เพียง 1 รายการ');
  }

  const filledEmergency = form.emergencyContacts.filter((c) => c.name.trim() !== '');
  for (const contact of filledEmergency) {
    if (!contact.phone.trim()) {
      add('contact', contact.id, 'กรุณากรอกเบอร์โทรของผู้ติดต่อฉุกเฉิน');
    } else if (!PHONE_RE.test(contact.phone.trim())) {
      add('contact', contact.id, 'รูปแบบเบอร์โทรฉุกเฉินไม่ถูกต้อง');
    }
  }
  if (filledEmergency.length > 0) {
    const primaries = filledEmergency.filter((c) => c.isPrimary).length;
    if (primaries === 0)
      add('contact', 'emergencyContacts', 'กรุณากำหนดผู้ติดต่อฉุกเฉินหลัก 1 รายการ');
    if (primaries > 1)
      add('contact', 'emergencyContacts', 'กำหนดผู้ติดต่อฉุกเฉินหลักได้เพียง 1 รายการ');
  }

  /* ================= ขั้นตอนที่ 3: ความสามารถและพื้นที่ ================== */
  if (form.languages.length === 0) {
    add('skills', 'languages', 'ต้องระบุภาษาอย่างน้อย 1 ภาษา');
  } else {
    const seen = new Set<string>();
    for (const skill of form.languages) {
      // ภาษาที่เลือก "อื่น ๆ" ต้องระบุชื่อภาษา
      if (skill.languageCode === 'OTHER' && !skill.languageName.trim()) {
        add('skills', skill.id, 'กรุณาระบุชื่อภาษาที่เลือก “อื่น ๆ”');
      } else if (!skill.languageName.trim()) {
        add('skills', skill.id, 'กรุณาเลือกภาษา');
      } else if (seen.has(skill.languageName)) {
        add('skills', skill.id, 'มีภาษานี้อยู่ในรายการแล้ว กรุณาแก้ไขข้อมูลรายการเดิม');
      }
      seen.add(skill.languageName);

      // ระดับภาษาเป็นข้อมูลบังคับ — ยกเว้นภาษาแม่ที่ไม่ต้องระบุระดับ
      if (!skill.isNativeLanguage && !skill.levelCode) {
        add('skills', skill.id, 'กรุณาเลือกระดับภาษา');
      }
    }
  }

  if (form.assignedCountries.length > 0) {
    const seen = new Set<string>();
    for (const item of form.assignedCountries) {
      if (!item.countryId) add('skills', item.id, 'กรุณาเลือกประเทศประจำ');
      if (item.countryId && seen.has(item.countryId))
        add('skills', item.id, 'ประเทศประจำนี้ถูกเพิ่มซ้ำ');
      seen.add(item.countryId);
    }
    const primaries = form.assignedCountries.filter((c) => c.isPrimary).length;
    if (primaries === 0)
      add('skills', 'assignedCountries', 'กรุณากำหนดประเทศประจำหลัก 1 ประเทศ');
    if (primaries > 1)
      add('skills', 'assignedCountries', 'กำหนดประเทศประจำหลักได้เพียง 1 ประเทศ');
  }

  const seenCountries = new Set<string>();
  for (const skill of form.routeSkills) {
    if (!skill.countryId) {
      add('skills', skill.id, 'กรุณาเลือกประเทศ');
      continue;
    }
    if (seenCountries.has(skill.countryId)) add('skills', skill.id, 'ประเทศนี้ถูกเพิ่มซ้ำ');
    seenCountries.add(skill.countryId);

    if (skill.coverage === 'selected_routes' && skill.routeIds.length === 0) {
      add('skills', skill.id, 'เลือก “เฉพาะสนามบิน/จุดหมายปลายทาง” ต้องเลือกอย่างน้อย 1 สนามบิน');
    }
    if (skill.tripCount !== undefined && skill.tripCount < 0) {
      add('skills', skill.id, 'จำนวนครั้งที่นำทัวร์ต้องไม่ติดลบ');
    }
  }

  const seenSkills = new Set<string>();
  for (const skill of form.tourSkills) {
    /* ทักษะที่ระบุเองไม่มี masterId — ใช้ชื่อแทน ไม่งั้นรายการที่พิมพ์เองทุกอันจะนับว่าซ้ำกัน */
    const key = skill.masterId
      ? `${skill.category}:${skill.masterId}`
      : `${skill.category}:custom:${skill.name.trim().toLowerCase()}`;
    if (seenSkills.has(key)) add('skills', skill.id, `“${skill.name}” ถูกเพิ่มซ้ำ`);
    seenSkills.add(key);
  }

  /* =================== ขั้นตอนที่ 4: ประวัติการทำงาน ==================== */
  const filledJobs = form.employmentHistory.filter((e) => e.employerName.trim() !== '');
  for (const entry of filledJobs) {
    const message = validateEmploymentEntry(entry, context.today);
    if (message) add('employment', entry.id, message);
  }
  // งานปัจจุบันมากกว่าหนึ่งแห่ง → เตือน แต่บันทึกได้
  const currentCount = filledJobs.filter((e) => e.isCurrentJob).length;
  if (currentCount > 1) {
    warn(
      'employment',
      'employmentHistory',
      `มีงานปัจจุบัน ${currentCount} แห่ง — บันทึกได้ แต่ควรตรวจสอบว่าถูกต้อง`,
    );
  }
  // ช่วงเวลาซ้อนกัน → เตือน แต่บันทึกได้
  const ranges = filledJobs
    .map((e) => rangeOf(e, context.today))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (hasOverlappingRanges(ranges)) {
    warn(
      'employment',
      'employmentHistory',
      'มีช่วงเวลาทำงานที่ซ้อนกัน — บันทึกได้ และระบบจะไม่นับเดือนซ้ำในประสบการณ์รวม',
    );
  }

  /* ================= ขั้นตอนที่ 5: เอกสารและการเงิน ==================== */
  for (const doc of form.documents.filter((d) => d.name.trim() !== '')) {
    if (!doc.number.trim()) add('finance', doc.id, 'กรุณากรอกเลขที่เอกสาร');
    if (doc.expiresAt && doc.issuedAt && doc.expiresAt < doc.issuedAt) {
      add('finance', doc.id, 'วันหมดอายุต้องอยู่หลังวันที่ออกเอกสาร');
    }
  }

  if (form.bankAccounts.length > 0) {
    for (const account of form.bankAccounts) {
      if (!account.bank.trim()) add('finance', account.id, 'กรุณาเลือกธนาคาร');
      if (!account.accountName.trim()) add('finance', account.id, 'กรุณากรอกชื่อบัญชี');
      if (!account.accountNoMasked.trim()) add('finance', account.id, 'กรุณากรอกเลขที่บัญชี');
    }
    const primaries = form.bankAccounts.filter((a) => a.isPrimary).length;
    if (primaries === 0) add('finance', 'bankAccounts', 'กรุณากำหนดบัญชีหลัก 1 บัญชี');
    if (primaries > 1) add('finance', 'bankAccounts', 'กำหนดบัญชีหลักได้เพียง 1 บัญชี');
  }

  const byField: Record<string, string> = {};
  for (const error of [...errors, ...warnings]) {
    if (!byField[error.field]) byField[error.field] = error.message;
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    byField,
    firstStep: errors[0]?.step,
    firstField: errors[0]?.field,
  };
}

/** ตรวจเฉพาะขั้นตอนเดียว (ใช้ตอนกด "ถัดไป") */
export function validateStep(
  form: LeaderFormState,
  step: FormStepKey,
  context: { existingLeaders: TourLeader[]; isNew: boolean; today: string },
): FieldError[] {
  return validateLeaderForm(form, context).errors.filter((e) => e.step === step);
}

/* ------------------------------ สถานะของขั้นตอน ----------------------------- */

/** ขั้นตอนนี้มีข้อมูลกรอกแล้วหรือยัง */
function stepHasData(form: LeaderFormState, step: FormStepKey): boolean {
  switch (step) {
    case 'general':
      return Boolean(form.firstName.trim() || form.lastName.trim() || form.photoUrl);
    case 'contact':
      return (
        form.contacts.some((c) => c.value.trim()) ||
        form.emergencyContacts.some((c) => c.name.trim())
      );
    case 'skills':
      return (
        form.languages.length > 0 ||
        form.assignedCountries.length > 0 ||
        form.routeSkills.length > 0 ||
        form.tourSkills.length > 0
      );
    case 'employment':
      return form.employmentHistory.some((e) => e.employerName.trim());
    case 'finance':
      return form.documents.length > 0 || form.bankAccounts.length > 0;
    default:
      return false;
  }
}

/**
 * สถานะของแต่ละขั้นตอน: ยังไม่กรอก / กำลังกรอก / ข้อมูลครบ / มีข้อผิดพลาด
 * `touched` = ขั้นตอนที่ผู้ใช้เคยเปิดหรือถูกตรวจแล้ว
 */
export function computeStepStatuses(
  form: LeaderFormState,
  result: ValidationResult | null,
  touched: Set<FormStepKey>,
): Record<FormStepKey, StepStatus> {
  const steps: FormStepKey[] = ['general', 'contact', 'skills', 'employment', 'finance'];
  const map = {} as Record<FormStepKey, StepStatus>;

  for (const step of steps) {
    const hasError = (result?.errors ?? []).some((e) => e.step === step);
    const hasData = stepHasData(form, step);

    if (hasError) map[step] = 'error';
    else if (!hasData) map[step] = 'empty';
    else if (result || touched.has(step)) map[step] = 'complete';
    else map[step] = 'in_progress';
  }
  return map;
}
