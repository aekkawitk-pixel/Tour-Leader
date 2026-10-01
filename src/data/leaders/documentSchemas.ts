/**
 * Document Schemas — นิยาม "ช่องข้อมูลของเอกสารประจำตัว" แยกตามชนิดเอกสาร
 *
 * ไฟล์นี้เป็นชั้นข้อมูลบริสุทธิ์ (ไม่มี state ของฟอร์ม ไม่มี UI ไม่มีไฟล์แนบ)
 * เพื่อให้ทั้งวิซาร์ดเพิ่มหัวหน้าทัวร์ · หน้าแก้ไขเอกสาร · และตัวเก็บเอกสารในอนาคต
 * อ้าง schema ชุดเดียวกัน ไม่ต้องนิยามช่องข้อมูลซ้ำคนละที่
 *
 * ขอบเขต:
 *   • มีเฉพาะ "เอกสารมีช่องข้อมูลอะไรบ้าง" + ตรวจความสอดคล้องของวันที่
 *   • สถานะการกรอก/OCR/ไฟล์แนบ อยู่ที่ผู้เรียก (เช่น DocEntry ในวิซาร์ด)
 *
 * ⚠️ ห้าม import จาก modules/ หรือ components/ — ชั้น data ต้องไม่ผูกกับชั้นบน
 */

/** ประเภทวีซ่าที่เลือกได้ */
export const VISA_TYPES = ['Tourist', 'Business', 'Transit', 'Multiple Entry'] as const;
export type VisaType = (typeof VISA_TYPES)[number];

/** ชนิดเอกสารที่มีช่อง "ข้อมูลจากเอกสาร" แยกตาม schema */
export type DocKind =
  | 'id_card' | 'passport' | 'visa' | 'tour_card'
  /* ---- กลุ่มเอกสารแนบไฟล์ — ข้อมูลหลักคือไฟล์ ช่องข้อความเป็นเพียงคำอธิบาย ---- */
  | 'criminal_record' | 'certificate' | 'other';

/**
 * ชนิดที่ "ตัวไฟล์คือเนื้อหาหลัก" — ต้องแนบไฟล์เสมอ และไม่บังคับเลขที่เอกสาร
 * ต่างจากเอกสารประจำตัวที่ข้อมูลบนหน้าเอกสารสำคัญกว่าตัวไฟล์
 */
export const FILE_BASED_DOC_KINDS: readonly DocKind[] = ['criminal_record', 'certificate', 'other'];

export function isFileBasedDocKind(kind: DocKind): boolean {
  return FILE_BASED_DOC_KINDS.includes(kind);
}

/** ข้อมูลจากเอกสาร — เก็บทุกช่องเป็น string (วันที่ = ISO 'YYYY-MM-DD') */
export type DocData = Record<string, string>;

type DocFieldType = 'text' | 'idnumber' | 'date' | 'country' | 'nationality' | 'select' | 'textarea';

/** นิยาม 1 ช่องข้อมูลของเอกสาร (ใช้เรนเดอร์ฟอร์มแบบ reusable) */
export interface DocFieldDef {
  key: string;
  label: string;
  type: DocFieldType;
  options?: { value: string; label: string }[];
  /**
   * ข้อความชี้นำในช่อง — ปกติไม่ต้องระบุ ชั้น UI สร้างเป็น "ระบุ<ชื่อช่อง>" ให้เอง
   * ระบุเองเฉพาะช่องที่ต้องบอกรูปแบบ ไม่ใช่ยกตัวอย่างค่า
   */
  placeholder?: string;
  /** ให้กินความกว้าง 2 คอลัมน์ (เช่น ที่อยู่/หมายเหตุ) */
  full?: boolean;
  /** ช่องวันหมดอายุ: อ้างอิง key ของวันที่ออก เพื่อตรวจว่าห้ามก่อนวันออก */
  minKey?: string;
  /**
   * ช่องที่เป็นวันในอนาคตไม่ได้ (เช่น วันเกิด)
   * นอกจากกันกรอกผิดแล้ว ยังทำให้ปี 2 หลักตีความถูกด้วย — '17/12/52' = 1952 ไม่ใช่ 2052
   */
  notFuture?: boolean;
  /**
   * ช่องที่มีตัวควบคุมรวมดูแลให้ (เช่น รหัสจังหวัด/อำเภอที่มาพร้อมช่องที่อยู่)
   * ฟอร์มที่เรนเดอร์จาก schema ตรง ๆ ต้องข้ามช่องนี้ ไม่งั้นจะโผล่เป็นช่องรหัสให้ผู้ใช้กรอกเอง
   */
  hidden?: boolean;
}

/**
 * คำนำหน้าที่เลือกได้ในช่องข้อมูลของเอกสาร
 * ⚠️ ต้องตรงกับ WIZARD_TITLES ใน modules/tour-leaders/newLeaderWizard.ts
 *    (ประกาศซ้ำที่นี่เพื่อไม่ให้ชั้น data ผูกกับชั้น modules)
 */
export const DOC_TITLE_VALUES = ['นาย', 'นาง', 'นางสาว'] as const;

const TITLE_OPTIONS = DOC_TITLE_VALUES.map((t) => ({ value: t, label: t }));

/**
 * คำนำหน้าภาษาอังกฤษบนบัตร — คู่กับคำนำหน้าไทยตามลำดับเดียวกัน
 * แยกเป็นช่องของตัวเองเพราะบางกรณีไม่ตรงกันตรง ๆ (เช่น ยศ/ตำแหน่งทางวิชาการ) จึงต้องแก้ได้เอง
 */
export const DOC_TITLE_EN_BY_TH: Record<(typeof DOC_TITLE_VALUES)[number], string> = {
  'นาย': 'Mr.',
  'นาง': 'Mrs.',
  'นางสาว': 'Miss',
};

const TITLE_EN_OPTIONS = DOC_TITLE_VALUES.map((t) => ({
  value: DOC_TITLE_EN_BY_TH[t],
  label: DOC_TITLE_EN_BY_TH[t],
}));
const GENDER_OPTIONS = [
  { value: 'ชาย', label: 'ชาย' },
  { value: 'หญิง', label: 'หญิง' },
  { value: 'อื่น ๆ', label: 'อื่น ๆ' },
];
const VISA_ENTRY_OPTIONS = [
  { value: 'single', label: 'เข้าได้ครั้งเดียว (Single)' },
  { value: 'double', label: 'เข้าได้สองครั้ง (Double)' },
  { value: 'multiple', label: 'เข้าได้หลายครั้ง (Multiple)' },
];

/**
 * ขอบเขตพื้นที่ที่วีซ่าใช้ได้ (ช่อง Valid for) — เพิ่มรายการใหม่ได้ที่นี่จุดเดียว
 * ค่าที่บันทึกเป็นตัวอักษรตามที่พิมพ์บนสติกเกอร์ คำอธิบายไทยอยู่ที่ป้ายกำกับ
 */
const VISA_VALID_FOR_OPTIONS = [
  { value: 'SCHENGEN STATES', label: 'SCHENGEN STATES — กลุ่มประเทศเชงเก้น' },
  { value: 'ISSUING COUNTRY ONLY', label: 'ISSUING COUNTRY ONLY — เฉพาะประเทศผู้ออกวีซ่า' },
];

/** เพศตามที่พิมพ์บนสติกเกอร์วีซ่า (เต็มคำ ไม่ใช่ตัวย่อแบบหน้าเล่ม) */
const VISA_SEX_OPTIONS = [
  { value: 'MALE', label: 'MALE — ชาย' },
  { value: 'FEMALE', label: 'FEMALE — หญิง' },
];

/**
 * ข้อความจำนวนครั้งที่เข้าได้สำหรับแสดงผล — ค่าที่เก็บเป็นรหัส ('single') อ่านไม่รู้เรื่อง
 * ค่าที่ไม่รู้จัก (เช่นข้อมูลนำเข้าเก่า) คืนค่าเดิม ดีกว่าแสดงว่าง
 */
export function visaEntriesLabel(value: string | undefined): string {
  const v = (value ?? '').trim();
  return VISA_ENTRY_OPTIONS.find((o) => o.value === v)?.label ?? v;
}
/** ประเภทบัตร 1 รายการ — ค่าที่บันทึก + ชื่อที่ขึ้นหัวบัตร */
export interface TourCardTypeDef {
  /** ค่าที่บันทึกลงเอกสาร (ใช้เป็น label ในช่องเลือกด้วย) */
  value: string;
  /** ชื่อบนหัวบัตร — ไทย */
  titleTh: string;
  /** ชื่อบนหัวบัตร — อังกฤษ */
  titleEn: string;
}

/**
 * ประเภทบัตรที่เลือกได้ — แก้ไข/เพิ่มรายการได้ที่นี่จุดเดียว
 * (ยังไม่ผูกกับ Master เพราะรายการนี้เปลี่ยนตามระเบียบกรมการท่องเที่ยว ไม่ใช่ข้อมูลของบริษัท)
 */
export const TOUR_CARD_TYPES: TourCardTypeDef[] = [
  { value: 'บัตรผู้นำเที่ยว (Tour Leader Licence)', titleTh: 'ผู้นำเที่ยว', titleEn: 'Tour Leader Licence' },
  { value: 'บัตรมัคคุเทศก์ทั่วไป (ต่างประเทศ)', titleTh: 'มัคคุเทศก์ทั่วไป (ต่างประเทศ)', titleEn: 'Tourist Guide Licence (General)' },
  { value: 'บัตรมัคคุเทศก์ทั่วไป (ไทย)', titleTh: 'มัคคุเทศก์ทั่วไป (ไทย)', titleEn: 'Tourist Guide Licence (General)' },
  { value: 'บัตรมัคคุเทศก์เฉพาะพื้นที่', titleTh: 'มัคคุเทศก์เฉพาะพื้นที่', titleEn: 'Specific Area Guide Licence' },
  { value: 'อื่น ๆ', titleTh: 'บัตรประจำตัว', titleEn: 'Identification Card' },
];

/**
 * ชื่อที่ขึ้นหัวบัตรตามประเภทที่เลือก
 * ยังไม่เลือก/ไม่รู้จักประเภท → ใช้บัตรผู้นำเที่ยวเป็นค่าตั้งต้น (ประเภทที่พบบ่อยที่สุด)
 */
export function tourCardTitle(cardType: string | undefined): { th: string; en: string } {
  const found = TOUR_CARD_TYPES.find((t) => t.value === (cardType ?? '').trim());
  return { th: found?.titleTh ?? TOUR_CARD_TYPES[0].titleTh, en: found?.titleEn ?? TOUR_CARD_TYPES[0].titleEn };
}

const TOUR_CARD_TYPE_OPTIONS = TOUR_CARD_TYPES.map((t) => ({ value: t.value, label: t.value }));


/** schema ของ "ข้อมูลจากเอกสาร" แยกตามชนิดเอกสาร */
export const DOC_SCHEMAS: Record<DocKind, DocFieldDef[]> = {
  id_card: [
    { key: 'idNumber', label: 'เลขบัตรประชาชน', type: 'idnumber' },
    { key: 'title', label: 'คำนำหน้า (ไทย)', type: 'select', options: TITLE_OPTIONS },
    { key: 'firstName', label: 'ชื่อ (ไทย)', type: 'text' },
    { key: 'lastName', label: 'นามสกุล (ไทย)', type: 'text' },
    // บัตรจริงพิมพ์ชื่ออังกฤษไว้ใต้ชื่อไทย — เก็บด้วยเพื่อให้หน้าบัตรจำลองตรงกับของจริง
    { key: 'titleEn', label: 'คำนำหน้า (Title)', type: 'select', options: TITLE_EN_OPTIONS },
    { key: 'firstNameEn', label: 'ชื่อ (Given Name)', type: 'text' },
    { key: 'lastNameEn', label: 'นามสกุล (Surname)', type: 'text' },
    { key: 'birthDate', label: 'วันเดือนปีเกิด', type: 'date', notFuture: true },
    /*
     * ที่อยู่แยกเป็นส่วน ๆ ให้อ้างอิง Master เขตปกครองไทยได้ — จังหวัดคุมอำเภอ
     * อำเภอคุมตำบล และตำบลเติมรหัสไปรษณีย์ให้ (ดู ThaiAddressFields)
     * รหัสจังหวัด/อำเภอเก็บคู่กับชื่อไว้ เพื่อให้เปิดแก้ไขแล้วรู้ว่าเลือกอะไรอยู่
     */
    { key: 'addressLine', label: 'ที่อยู่ (บ้านเลขที่ หมู่ ซอย ถนน)', type: 'text', full: true },
    { key: 'province', label: 'จังหวัด', type: 'text' },
    { key: 'district', label: 'เขต/อำเภอ', type: 'text' },
    { key: 'subdistrict', label: 'แขวง/ตำบล', type: 'text' },
    { key: 'postalCode', label: 'รหัสไปรษณีย์', type: 'text' },
    { key: 'provinceCode', label: 'รหัสจังหวัด', type: 'text', hidden: true },
    { key: 'districtCode', label: 'รหัสเขต/อำเภอ', type: 'text', hidden: true },
    { key: 'issuedDate', label: 'วันที่ออกบัตร', type: 'date' },
    { key: 'expiryDate', label: 'วันหมดอายุ', type: 'date', minKey: 'issuedDate' },
  ],
  passport: [
    { key: 'number', label: 'เลขที่หนังสือเดินทาง', type: 'text' },
    { key: 'issuingCountryId', label: 'ประเทศผู้ออก', type: 'country' },
    { key: 'nationality', label: 'สัญชาติ', type: 'text' },
    { key: 'title', label: 'คำนำหน้า (Title)', type: 'select', options: TITLE_OPTIONS },
    { key: 'firstName', label: 'ชื่อ (Given Name)', type: 'text' },
    { key: 'lastName', label: 'นามสกุล (Surname)', type: 'text' },
    { key: 'birthDate', label: 'วันเดือนปีเกิด', type: 'date', notFuture: true },
    { key: 'gender', label: 'เพศ', type: 'select', options: GENDER_OPTIONS },
    { key: 'issuedDate', label: 'วันที่ออก', type: 'date' },
    { key: 'expiryDate', label: 'วันหมดอายุ', type: 'date', minKey: 'issuedDate' },
  ],
  /* ช่องเรียงตามที่พิมพ์บนสติกเกอร์วีซ่าจริง (แบบเชงเก้น/สากล) */
  visa: [
    { key: 'countryId', label: 'ประเทศผู้ออก', type: 'country' },
    { key: 'number', label: 'เลขที่ Visa', type: 'text' },
    { key: 'issuedPlace', label: 'สถานที่ออกวีซ่า (Place of issue)', type: 'text' },
    { key: 'startDate', label: 'วันที่เริ่มใช้ (Valid from)', type: 'date' },
    { key: 'expiryDate', label: 'วันที่หมดอายุ (Valid until)', type: 'date', minKey: 'startDate' },
    { key: 'visaType', label: 'ประเภทวีซ่า (Type of visa)', type: 'select', options: VISA_TYPES.map((t) => ({ value: t, label: t })) },
    { key: 'category', label: 'รหัสวีซ่า (Category)', type: 'text' },
    { key: 'entries', label: 'จำนวนครั้งที่เข้าได้ (No. of entry)', type: 'select', options: VISA_ENTRY_OPTIONS },
    { key: 'holderLastName', label: 'นามสกุล (Surname)', type: 'text' },
    { key: 'holderFirstName', label: 'ชื่อ (Given Name)', type: 'text' },
    { key: 'birthDate', label: 'วันเกิด (Date of birth)', type: 'date', notFuture: true },
    { key: 'nationality', label: 'สัญชาติ (Nationality)', type: 'nationality' },
    { key: 'passportNo', label: 'หมายเลขหนังสือเดินทาง (Passport number)', type: 'text' },
    { key: 'sex', label: 'เพศ (Sex)', type: 'select', options: VISA_SEX_OPTIONS },
    { key: 'authorizedBy', label: 'อนุญาตโดย (Authorized signature)', type: 'text' },
    /* ช่องของสติกเกอร์แบบเชงเก้นที่สติกเกอร์ไทยไม่มี — คงไว้ให้กรอกได้เมื่อเป็นวีซ่าแบบนั้น */
    { key: 'validFor', label: 'ใช้ได้สำหรับ (Valid for)', type: 'select', options: VISA_VALID_FOR_OPTIONS },
    { key: 'duration', label: 'ระยะเวลาพำนัก (Duration of stay)', type: 'text' },
    { key: 'issuedDate', label: 'วันที่ออกเอกสาร (Date of issue)', type: 'date' },
  ],
  /* ช่องเรียงตามที่ปรากฏบนหน้าบัตรจริง — ชื่อบนบัตรมีทั้งไทยและอังกฤษ */
  tour_card: [
    { key: 'cardType', label: 'ประเภทบัตร', type: 'select', options: TOUR_CARD_TYPE_OPTIONS },
    { key: 'number', label: 'เลขที่บัตร', type: 'text' },
    { key: 'holderName', label: 'ชื่อผู้ถือบัตร (ไทย)', type: 'text' },
    { key: 'holderNameEn', label: 'ชื่อผู้ถือบัตร (Full name)', type: 'text' },
    { key: 'issuedDate', label: 'วันที่ออกบัตร', type: 'date' },
    { key: 'expiryDate', label: 'วันหมดอายุ', type: 'date', minKey: 'issuedDate' },
  ],
  /*
    กลุ่มแนบไฟล์ — ตัวไฟล์คือเอกสาร ไม่ต้องพิมพ์ซ้ำสิ่งที่อยู่บนหน้าเอกสาร
    รายละเอียดของไฟล์ (ชื่อไฟล์ · ขนาด · วันเวลาที่แนบ · ผู้แนบ) ระบบเก็บให้เอง

    เหลือไว้แค่สองช่องวันที่ ซึ่งไม่บังคับกรอกทุกชนิด
    ประวัติอาชญากรรมใช้ค่านี้จริงในการตรวจความพร้อมก่อนจ่ายงาน (criminal_record_stale)
    ส่วนชนิดอื่นเก็บไว้เพื่อให้รู้อายุเอกสารโดยไม่ต้องเปิดไฟล์ดู
  */
  criminal_record: [
    { key: 'issuedDate', label: 'วันที่ออกเอกสาร', type: 'date' },
    { key: 'expiryDate', label: 'วันที่เอกสารหมดอายุ (ถ้ามี)', type: 'date', minKey: 'issuedDate' },
  ],
  certificate: [
    { key: 'issuedDate', label: 'วันที่ออกเอกสาร', type: 'date' },
    { key: 'expiryDate', label: 'วันที่เอกสารหมดอายุ (ถ้ามี)', type: 'date', minKey: 'issuedDate' },
  ],
  /* ชนิดรวมทุกอย่าง — ต้องบอกว่าไฟล์ที่แนบคือเอกสารอะไร ไม่งั้นดูจากชนิดอย่างเดียวไม่รู้เรื่อง */
  other: [
    { key: 'docTitle', label: 'ชื่อเอกสาร', type: 'text', full: true },
    { key: 'issuedDate', label: 'วันที่ออกเอกสาร', type: 'date' },
    { key: 'expiryDate', label: 'วันที่เอกสารหมดอายุ (ถ้ามี)', type: 'date', minKey: 'issuedDate' },
  ],
};

/**
 * ชื่อเอกสารที่พบบ่อยของ "เอกสารอื่น ๆ" (kind 'other') — ให้เลือกจาก list แทนพิมพ์เอง
 * เลือก "อื่น ๆ (ระบุ)" แล้วพิมพ์ชื่อเองได้เสมอ (ค่า OTHER_DOC_TITLE_CUSTOM ในช่อง UI เท่านั้น
 * ไม่ใช่ค่าที่บันทึกจริง — ค่าที่บันทึกคือข้อความที่ผู้ใช้พิมพ์)
 */
export const OTHER_DOC_TITLE_PRESETS = [
  'บัตรประชาชน',
  'หนังสืออาชญากรรม',
  'ใบเซอร์',
] as const;

/**
 * ค่า sentinel ของช่องเลือกชื่อเอกสาร (UI เท่านั้น) เมื่อเลือก "บัตรนำเที่ยว"
 * — เลือกแล้วต้องเลือกประเภทย่อยต่อจาก TOUR_LICENSE_SUBTYPES ค่านี้เองไม่ใช่ค่าที่บันทึกจริง
 */
export const OTHER_DOC_TITLE_TOUR_LICENSE = '__tour_license__';

/** ประเภทบัตรนำเที่ยว — เลือกต่อเมื่อเลือก "บัตรนำเที่ยว" ในช่องชื่อเอกสาร */
export const TOUR_LICENSE_SUBTYPES = ['บัตรหัวหน้าทัวร์', 'บัตรไกด์'] as const;

/** ค่า sentinel ของช่องเลือกชื่อเอกสาร (UI เท่านั้น) เมื่อเลือก "อื่น ๆ (ระบุ)" */
export const OTHER_DOC_TITLE_CUSTOM = '__custom__';

/* --------------------- กติกาห้ามถือเอกสารซ้ำซ้อน --------------------- */

/**
 * ชนิดที่ "ถือได้ครั้งละ 1 ใบเท่านั้น" ไม่ว่าค่าในช่องไหนจะเป็นอะไร
 *
 * บัตรประชาชน: คนหนึ่งมีได้ใบเดียว — ทำใบใหม่ (หาย/ชำรุด/ต่ออายุ) ต้องจัดการใบเดิมก่อน
 * โดยแจ้งสูญหาย/ยกเลิก/ปิดใช้งาน หรือรอจนใบเดิมหมดอายุ ระบบจึงยอมให้เพิ่มใบใหม่
 * (เก็บใบเดิมไว้เป็นประวัติเสมอ ไม่ต้องลบทิ้ง)
 */
export const UNIQUE_ACTIVE_KINDS: readonly DocKind[] = ['id_card'];

/**
 * ชนิดที่ "ถือได้ครั้งละ 1 ใบต่อค่าในช่องนี้"
 *
 * บัตรหัวหน้าทัวร์: มีได้หลายใบก็จริง แต่ต้องคนละประเภท — จะขอใบใหม่ประเภทเดิม
 * ไม่ได้จนกว่าใบเดิมจะหมดอายุ หรือถูกยกเลิก/ปิดใช้งาน (ตรงกับระเบียบการออกบัตรจริง)
 *
 * ค่าว่างในช่องนี้ไม่นับ — ยังไม่ระบุประเภทก็ยังตัดสินไม่ได้ว่าซ้ำกับใบไหน
 */
export const UNIQUE_ACTIVE_BY_FIELD: Partial<Record<DocKind, string>> = {
  tour_card: 'cardType',
};

/** คำนำหน้ารหัสของเอกสารแต่ละชนิด (ใช้ตอนสร้าง id ใหม่) */
export const DOC_ID_PREFIX: Record<DocKind, string> = {
  id_card: 'IDC',
  passport: 'PP',
  visa: 'VS',
  tour_card: 'TC',
  criminal_record: 'CR',
  certificate: 'CERT',
  other: 'DOC',
};

/**
 * ข้อความชี้นำในช่องกรอก — "ระบุ" + ชื่อช่อง เหมือนกันทุกช่องทั้งระบบ
 *
 * ไม่ยกตัวอย่างค่าจริง เพราะตัวอย่างชวนให้กรอกตามตัวอย่างแทนที่จะกรอกตามเอกสารในมือ
 * ช่องที่กำหนด placeholder ไว้เองใน schema (บอกรูปแบบ ไม่ใช่ตัวอย่าง) จะใช้ค่านั้นแทน
 */
export function docFieldPlaceholder(field: Pick<DocFieldDef, 'label' | 'placeholder'>): string {
  return field.placeholder ?? `ระบุ${field.label}`;
}

/** ข้อมูลว่าง (ทุก key ของ schema = '') */
export function emptyDocData(kind: DocKind): DocData {
  const data: DocData = {};
  for (const f of DOC_SCHEMAS[kind]) data[f.key] = '';
  return data;
}

/** วันหมดอายุต้องไม่ก่อนวันที่ออก (คืน true เมื่อผิด) */
export function isExpiryBeforeIssue(issuedDate: string, expiryDate: string): boolean {
  return Boolean(issuedDate && expiryDate && expiryDate < issuedDate);
}
