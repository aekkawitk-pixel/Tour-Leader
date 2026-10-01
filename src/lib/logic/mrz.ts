/**
 * MRZ (Machine Readable Zone) — ตัวอ่าน/ตรวจสอบแถบข้อมูลด้านล่างหนังสือเดินทาง (§2.5/§2.6/§6)
 *
 * รองรับ TD3 (หนังสือเดินทาง): 2 บรรทัด × 44 อักขระ ตามมาตรฐาน ICAO 9303
 * เป็นตรรกะล้วน (ไม่มี I/O) — ตรวจสอบได้ด้วย unit test
 *
 * MRZ เป็น "แหล่งข้อมูลหลัก" (§2.5) เพราะมี Check Digit ตรวจความถูกต้องได้จริง
 * ฟังก์ชันนี้ไม่เดาค่าที่อ่านไม่ได้ — อ่านไม่ออกคืน null (§ห้ามสร้างข้อมูลเอง)
 */

export const MRZ_TD3_LENGTH = 44;

/** ตัวอักษรที่เป็นไปได้ใน MRZ */
export const MRZ_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

export interface MrzParsed {
  documentCode: string;       // เช่น "P"
  documentSubType: string;    // อักขระที่ 2 (มักว่าง "<")
  issuingCountry: string;     // 3 อักขระ เช่น THA
  lastName: string;           // นามสกุล (อังกฤษตามเล่ม)
  firstName: string;          // ชื่อ (+ชื่อกลาง)
  passportNo: string;
  nationality: string;
  dateOfBirth: string | null; // ISO yyyy-mm-dd
  gender: string;             // M / F / X (จาก '<')
  expiryDate: string | null;  // ISO yyyy-mm-dd
  personalNumber: string;
  checks: {
    passportNo: boolean;
    dateOfBirth: boolean;
    expiry: boolean;
    personalNumber: boolean | null; // null = ไม่มีเลขส่วนบุคคล หรืออ่านส่วนท้ายไม่ครบ
    composite: boolean | null;      // null = อ่านบรรทัดไม่ครบ 44 ตัว จึงตรวจไม่ได้ (ไม่ใช่ "ไม่ผ่าน")
  };
  /** false เมื่ออ่านบรรทัดไม่ครบ 44 อักขระ — ส่วนท้าย (เลขส่วนบุคคล/Check Digit รวม) เชื่อถือไม่ได้ */
  complete: boolean;
  /** true เมื่อ Check Digit ที่ตรวจได้ผ่านทั้งหมด (ไม่นับรายการที่ตรวจไม่ได้) */
  allChecksPassed: boolean;
}

/** ค่าตัวอักษรสำหรับคำนวณ Check Digit: 0-9 = 0-9, A-Z = 10-35, '<' = 0 */
function charValue(c: string): number {
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
  if (c === '<') return 0;
  return -1; // อักขระที่ไม่ถูกต้อง
}

/**
 * Check Digit ตาม ICAO 9303 — น้ำหนัก 7,3,1 วนซ้ำ แล้ว mod 10
 * คืน null เมื่อพบอักขระที่ไม่อยู่ในชุด MRZ (อ่านผิด)
 */
export function mrzCheckDigit(input: string): number | null {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const v = charValue(input[i]);
    if (v < 0) return null;
    sum += v * weights[i % 3];
  }
  return sum % 10;
}

/** ตรวจว่าอักขระ check ตรงกับค่าที่คำนวณได้หรือไม่ ('<' ถือว่าไม่ระบุ → false) */
export function verifyCheckDigit(input: string, check: string): boolean {
  const computed = mrzCheckDigit(input);
  if (computed === null) return false;
  return String(computed) === check;
}

/**
 * แปลงปี 2 หลักของวันเกิดเป็น ค.ศ. เต็ม
 * วันเกิดต้องไม่เป็นอนาคต → ปีที่มากกว่าปีปัจจุบัน (2 หลัก) ให้เป็นศตวรรษก่อน
 */
function fullYearForBirth(yy: number, todayISO: string): number {
  const currentYear = Number(todayISO.slice(0, 4));
  const currentYY = currentYear % 100;
  const century = Math.floor(currentYear / 100) * 100;
  return yy > currentYY ? century - 100 + yy : century + yy;
}

/**
 * แปลงปี 2 หลักของวันหมดอายุ — หนังสือเดินทางมีอายุไม่เกิน ~10 ปี
 * ใช้เกณฑ์: ปีที่ห่างจากปัจจุบันเกิน 50 ปีข้างหน้า ถือเป็นศตวรรษก่อน
 */
function fullYearForExpiry(yy: number, todayISO: string): number {
  const currentYear = Number(todayISO.slice(0, 4));
  const century = Math.floor(currentYear / 100) * 100;
  const candidate = century + yy;
  return candidate - currentYear > 50 ? candidate - 100 : candidate;
}

/** yymmdd → ISO (คืน null เมื่อไม่ใช่วันที่จริง เช่น เดือน 13 / วันที่ 32) */
export function mrzDateToISO(yymmdd: string, todayISO: string, kind: 'birth' | 'expiry'): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const year = kind === 'birth' ? fullYearForBirth(yy, todayISO) : fullYearForExpiry(yy, todayISO);
  // ตรวจว่าวันที่มีอยู่จริงในเดือนนั้น (กัน 31/02)
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return `${String(year).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/**
 * ตัดส่วนท้ายที่เป็นตัวอักษรเดิมซ้ำติดกันตั้งแต่ 4 ตัวขึ้นไป
 * เครื่อง OCR มักอ่านแถบเติม '<<<<' ผิดเป็นตัวอักษรซ้ำ (เช่น KKKK / LLLL)
 * ชื่อจริงไม่มีตัวอักษรเดียวกันซ้ำติดกัน 4 ตัว จึงตัดได้อย่างปลอดภัย
 */
function trimFillerRun(s: string): string {
  return s.replace(/(.)\1{3,}$/, '').trim();
}

/** แปลงชื่อในรูปแบบ MRZ (SURNAME<<GIVEN<NAMES) เป็น {lastName, firstName} */
export function parseMrzName(nameField: string): { lastName: string; firstName: string } {
  const [surnamePart, givenPart = ''] = nameField.split('<<');
  const clean = (s: string) => trimFillerRun(s.replace(/</g, ' ').replace(/\s+/g, ' ').trim());
  return { lastName: clean(surnamePart), firstName: clean(givenPart) };
}

/** ทำความสะอาดบรรทัด MRZ ที่ OCR อ่านมา — ตัดช่องว่าง/ตัวพิมพ์เล็ก และแก้อักขระที่สับสนบ่อย */
export function normalizeMrzLine(raw: string): string {
  // ไม่ "เดา" แก้ตัวอักษรที่สับสน (0/O, 1/I) — ปล่อยให้ Check Digit เป็นตัวชี้ว่าอ่านผิด
  return raw
    .toUpperCase()
    .replace(/\s/g, '')
    .replace(/[«»]/g, '<')
    .replace(/[^A-Z0-9<]/g, '<');
}

/** ความยาวขั้นต่ำที่ยังอ่านข้อมูลสำคัญของบรรทัดที่ 2 ได้ (ตำแหน่ง 0-27 = เลขเล่ม/สัญชาติ/วันเกิด/เพศ/วันหมดอายุ + Check Digit) */
export const MRZ_LINE2_DATA_LENGTH = 28;

/**
 * ค้นหา 2 บรรทัด MRZ จากข้อความที่ OCR อ่านได้ทั้งหน้า
 *
 * ยอมรับบรรทัดที่ "ส่วนท้ายขาด" ได้ เพราะแถบเติม '<<<<' ท้ายบรรทัดมักถูกอ่านผิด/หายไป
 * แต่ข้อมูลสำคัญอยู่ต้นบรรทัดซึ่งตำแหน่งไม่เลื่อน — ตรวจความถูกต้องด้วย Check Digit อีกชั้น
 */
export function findMrzLines(ocrText: string): { line1: string; line2: string } | null {
  const candidates = ocrText
    .split(/\r?\n/)
    .map((l) => normalizeMrzLine(l))
    .filter((l) => l.length >= MRZ_LINE2_DATA_LENGTH);

  for (let i = 0; i < candidates.length - 1; i++) {
    const l1 = candidates[i].slice(0, MRZ_TD3_LENGTH);
    const l2 = candidates[i + 1].slice(0, MRZ_TD3_LENGTH);
    // บรรทัดแรกของ TD3 ขึ้นต้นด้วยรหัสเอกสาร P และบรรทัดสองมีตัวเลขจำนวนมาก
    const digitsInL2 = (l2.match(/\d/g) ?? []).length;
    if (l1.startsWith('P') && l1.length >= 10 && digitsInL2 >= 12) return { line1: l1, line2: l2 };
  }
  return null;
}

/**
 * อ่านข้อมูลจาก MRZ TD3
 * @param todayISO วันอ้างอิงระบบ (ใช้เทียบศตวรรษของปี 2 หลัก)
 * @returns null เมื่อรูปแบบไม่ใช่ TD3 ที่อ่านได้
 */
export function parseMrzTd3(line1: string, line2: string, todayISO: string): MrzParsed | null {
  const raw1 = normalizeMrzLine(line1);
  const raw2 = normalizeMrzLine(line2);
  // ต้องอ่านได้อย่างน้อยส่วนข้อมูลต้นบรรทัด — สั้นกว่านี้ถือว่าไม่ใช่ MRZ
  if (raw1.length < 10 || raw2.length < MRZ_LINE2_DATA_LENGTH) return null;

  const complete = raw1.length >= MRZ_TD3_LENGTH && raw2.length >= MRZ_TD3_LENGTH;
  // เติม '<' ท้ายบรรทัดที่ขาด เพื่อให้ตัดตำแหน่งได้ — ส่วนที่เติมจะไม่ถูกนำไปตรวจ Check Digit รวม
  const l1 = raw1.slice(0, MRZ_TD3_LENGTH).padEnd(MRZ_TD3_LENGTH, '<');
  const l2 = raw2.slice(0, MRZ_TD3_LENGTH).padEnd(MRZ_TD3_LENGTH, '<');

  const documentCode = l1[0];
  const documentSubType = l1[1] === '<' ? '' : l1[1];
  const issuingCountry = l1.slice(2, 5).replace(/</g, '');
  const { lastName, firstName } = parseMrzName(l1.slice(5));

  const passportNoRaw = l2.slice(0, 9);
  const passportNoCheck = l2[9];
  const nationality = l2.slice(10, 13).replace(/</g, '');
  const dobRaw = l2.slice(13, 19);
  const dobCheck = l2[19];
  const genderRaw = l2[20];
  const expiryRaw = l2.slice(21, 27);
  const expiryCheck = l2[27];
  const personalRaw = l2.slice(28, 42);
  const personalCheck = l2[42];
  const compositeCheck = l2[43];

  const compositeInput = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43);
  const hasPersonal = personalRaw.replace(/</g, '') !== '';

  const checks = {
    // ตำแหน่ง 0-27 ไม่เลื่อนแม้ส่วนท้ายขาด → ตรวจได้เสมอ
    passportNo: verifyCheckDigit(passportNoRaw, passportNoCheck),
    dateOfBirth: verifyCheckDigit(dobRaw, dobCheck),
    expiry: verifyCheckDigit(expiryRaw, expiryCheck),
    // ส่วนท้ายเชื่อถือได้เฉพาะเมื่ออ่านบรรทัดครบ — ไม่ครบให้เป็น null (ตรวจไม่ได้) ไม่ใช่ "ไม่ผ่าน"
    personalNumber: complete ? (hasPersonal ? verifyCheckDigit(personalRaw, personalCheck) : null) : null,
    composite: complete ? verifyCheckDigit(compositeInput, compositeCheck) : null,
  };

  return {
    complete,
    documentCode,
    documentSubType,
    issuingCountry,
    lastName,
    firstName,
    passportNo: passportNoRaw.replace(/</g, ''),
    nationality,
    dateOfBirth: mrzDateToISO(dobRaw, todayISO, 'birth'),
    gender: genderRaw === '<' ? '' : genderRaw,
    expiryDate: mrzDateToISO(expiryRaw, todayISO, 'expiry'),
    personalNumber: personalRaw.replace(/</g, ''),
    checks,
    // นับเฉพาะรายการที่ตรวจได้ — composite = null (อ่านไม่ครบ) ไม่ถือว่าไม่ผ่าน
    allChecksPassed: checks.passportNo && checks.dateOfBirth && checks.expiry && checks.composite !== false,
  };
}
