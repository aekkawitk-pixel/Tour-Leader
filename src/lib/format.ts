/** ฟังก์ชันจัดรูปแบบวันที่ไทยและสกุลเงินบาท ใช้ร่วมกันทั้งระบบ */

const TH_MONTHS_FULL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export const TH_WEEKDAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/** แปลง 'YYYY-MM-DD' หรือ ISO datetime เป็น Date แบบ local (ไม่เลื่อน timezone) */
export function parseDate(value: string): Date {
  const [datePart, timePart] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  if (timePart) {
    const [hh, mm] = timePart.split(':').map(Number);
    return new Date(y, m - 1, d, hh || 0, mm || 0);
  }
  return new Date(y, m - 1, d);
}

/** 'YYYY-MM-DD' จาก Date */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 'YYYY-MM-DDTHH:mm:ss' แบบ local (ไม่ใช่ UTC) จาก Date — คู่กับ parseDate ที่อ่านค่านี้แบบ local ตรง ๆ
 * ⚠️ ห้ามใช้ `date.toISOString()` เก็บเวลาจริงในระบบนี้ — toISOString() คืนเวลาแบบ UTC (มี Z ต่อท้าย)
 * แต่ parseDate ทั้งระบบตั้งใจอ่านตัวเลขในสตริงเป็นเวลา local ตรง ๆ โดยไม่แปลง timezone (ดูคอมเมนต์ parseDate)
 * ถ้าผสมกันจะได้เวลาเพี้ยนไปเท่ากับผลต่าง timezone ของเครื่อง (เช่น ไทย UTC+7 จะเห็นเวลาเร็วกว่าจริง 7 ชม.)
 */
export function toISODateTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${toISODate(date)}T${hh}:${mm}:${ss}`;
}

/* --------------------------- วันที่รูปแบบ dd/mm/yy -------------------------- */
/**
 * ช่องกรอกวันที่ทั้งระบบแสดงและรับค่าเป็น `dd/mm/yy` (เช่น 17/07/26)
 * แต่ยังเก็บภายในเป็น ISO `YYYY-MM-DD` เพื่อไม่กระทบ logic/ข้อมูลเดิม
 * ปี 2 หลักตัดศตวรรษที่ 55: 00–54 → 20xx, 55–99 → 19xx
 * (ครอบคลุมทั้งวันเกิด (อดีต) และวันหมดอายุ (อนาคต) ของข้อมูลจริง)
 */
export const SHORT_YEAR_PIVOT = 55;

/**
 * ข้อความบอกระบบปีที่ใช้ในช่องวันที่ — ต่อท้ายหัวข้อช่องให้ผู้กรอกรู้ก่อนพิมพ์
 *
 * ช่องวันที่ทั้งระบบรับปี ค.ศ. 2 หลัก แต่ 'yy' ใน dd/mm/yy ไม่บอกว่าเป็น ค.ศ. หรือ พ.ศ.
 * คนไทยคุ้นกับ พ.ศ. จึงต้องบอกไว้ที่หัวข้อ ไม่งั้นจะพิมพ์ 68 แทนที่จะเป็น 25
 *
 * หัวข้อที่มีวงเล็บอยู่แล้วจะเติมต่อในวงเล็บเดิม ไม่ให้มีวงเล็บซ้อนสองชุด
 */
export const YEAR_ERA_NOTE = 'ปี ค.ศ.';

export function withYearEraNote(label: string): string {
  const trimmed = label.trim();
  if (trimmed.endsWith(')')) return `${trimmed.slice(0, -1)} · ${YEAR_ERA_NOTE})`;
  return `${trimmed} (${YEAR_ERA_NOTE})`;
}

/** ขยายปี 2 หลักเป็นปีเต็ม ค.ศ. ตามเกณฑ์ตัดศตวรรษ */
export function expandShortYear(yy: number): number {
  return yy < SHORT_YEAR_PIVOT ? 2000 + yy : 1900 + yy;
}

/** ตรวจว่าเป็นวันที่มีอยู่จริง (เช่น 31/02 = false) */
function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** ISO 'YYYY-MM-DD' → 'dd/mm/yy' (คืน '' เมื่อว่างหรือผิดรูป) */
export function isoToShortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  if (!y || !m || !d) return '';
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y.slice(-2)}`;
}

/** เติม '/' อัตโนมัติระหว่างพิมพ์ คงเฉพาะตัวเลข ≤ 6 หลัก → 'dd/mm/yy' */
export function maskShortDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 6);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)]
    .filter((part) => part.length > 0)
    .join('/');
}

/** 'dd/mm/yy' → ISO 'YYYY-MM-DD'; คืน null เมื่อยังไม่ครบ 6 หลักหรือวันที่ไม่มีจริง */
export function shortDateToISO(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  if (digits.length !== 6) return null;
  const d = Number(digits.slice(0, 2));
  const m = Number(digits.slice(2, 4));
  const y = expandShortYear(Number(digits.slice(4, 6)));
  if (!isRealDate(y, m, d)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * ตีความปี 2 หลักโดยเคารพขอบเขตของช่องนั้น
 *
 * เกณฑ์ตัดศตวรรษเป็นค่ากลางที่ใช้ได้กับข้อมูลส่วนใหญ่ แต่ช่องที่ห้ามเป็นวันอนาคต
 * (เช่น วันเกิด) จะตีความพลาดทันทีเมื่อปีต่ำกว่าเกณฑ์ — '17/12/52' ควรเป็น 1952
 * ไม่ใช่ 2052 ถ้าผลลัพธ์เลย max ไป จึงถอยศตวรรษให้ 1 รอบ และใช้ก็ต่อเมื่อ
 * ค่าที่ถอยแล้วอยู่ในขอบเขตจริง ๆ (ไม่งั้นคงค่าเดิมไว้ให้ error อธิบายเอง)
 */
export function shortDateToISOWithin(
  text: string,
  bounds: { min?: string; max?: string } = {},
): string | null {
  const iso = shortDateToISO(text);
  if (!iso || !bounds.max || iso <= bounds.max) return iso;

  const [y, m, d] = iso.split('-');
  const back = `${Number(y) - 100}-${m}-${d}`;
  const inRange = back <= bounds.max && (!bounds.min || back >= bounds.min);
  return inRange ? back : iso;
}

/* ======================================================================== */
/*  มาตรฐานการแสดงผลทั้งระบบ — วันที่ DD/MM/YY · เวลา HH:mm (24 ชม.)          */
/*  ทุก Component ต้องเรียกใช้ Utility กลางชุดนี้ ห้าม format แยกกันในแต่ละหน้า   */
/*  และห้ามพึ่ง Browser locale (toLocaleDateString / Intl ที่ไม่ระบุ options)   */
/* ======================================================================== */

/** ISO/‌datetime → 'DD/MM/YY' (คืน '—' เมื่อว่าง) เช่น 21/07/26 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return isoToShortDate(value) || '—';
}

/** ตรวจ/จัดรูปเวลาเป็น 'HH:mm' 24 ชม. — รับ 'HH:mm' · 'HHmm' · 'H.mm' · ISO datetime */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  if (value.includes('T')) {
    const d = parseDate(value);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return parseDisplayTime(value) ?? value;
}

/**
 * เลขประจำตัวประชาชน 13 หลัก → 'X-XXXX-XXXXX-XX-X' ตามที่พิมพ์บนบัตรจริง
 * ไม่ครบ 13 หลักคืนค่าเดิม (ยังกรอกไม่เสร็จ — ไม่ควรจัดรูปให้ดูเหมือนเลขจริง)
 */
export function formatThaiId(value: string | null | undefined, sep = '-'): string {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length !== 13) return value ?? '';
  const parts = [digits[0], digits.slice(1, 5), digits.slice(5, 10), digits.slice(10, 12), digits[12]];
  return parts.join(sep);
}

/** ISO datetime → 'DD/MM/YY HH:mm' (คืน '—' เมื่อว่าง) เช่น 21/07/26 23:00 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parseDate(value);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(value)} ${hh}:${mm}`;
}

/** ช่วงวันที่: 'DD/MM/YY–DD/MM/YY' (วันเดียวกันแสดงค่าเดียว) เช่น 21/07/26–23/07/26 */
export function formatDateRange(start: string, end: string): string {
  const s = formatDate(start);
  const e = formatDate(end);
  return s === e ? s : `${s}–${e}`;
}

/** 13 กรกฎาคม 2569 — ใช้เฉพาะหัวปฏิทิน/แบนเนอร์ที่อนุญาตให้แสดงชื่อเดือนไทย (§7) */
export function formatThaiDateLong(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parseDate(value);
  return `${date.getDate()} ${TH_MONTHS_FULL[date.getMonth()]} ${date.getFullYear() + 543}`;
}

/* ------------------------------ parse / validate ------------------------- */

/** 'DD/MM/YY' → ISO 'YYYY-MM-DD' (null เมื่อไม่ครบ/ไม่มีจริง) — alias ของ shortDateToISO */
export function parseDisplayDate(text: string): string | null {
  return shortDateToISO(text);
}

/** 'DD/MM/YY' → ISO สำหรับจัดเก็บ (เก็บเป็น ISO เสมอ ห้ามเก็บเป็นข้อความ DD/MM/YY) */
export function toStorageDate(text: string): string | null {
  return shortDateToISO(text);
}

/** ประกอบ ISO 8601 +07:00 (Asia/Bangkok) จากวัน ISO + เวลา 'HH:mm' สำหรับจัดเก็บ */
export function toStorageDateTime(isoDate: string, time: string): string {
  const t = parseDisplayTime(time) ?? '00:00';
  return `${isoDate}T${t}:00+07:00`;
}

/**
 * แปลง/ตรวจเวลาเป็น 'HH:mm' 24 ชม. — รองรับ auto-format:
 *   '0900'→'09:00' · '1830'→'18:30' · '9:5'→'09:05' · '18.30'→'18:30'
 * คืน null เมื่อไม่ถูกต้อง (เช่น '25:00', '12:60') — ห้ามแก้เป็นเวลาอื่นเอง
 */
export function parseDisplayTime(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = String(text).trim();
  let hh: number;
  let mm: number;
  const sep = trimmed.match(/^(\d{1,2})[:.](\d{1,2})$/);
  if (sep) {
    hh = Number(sep[1]);
    mm = Number(sep[2]);
  } else {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 3) {
      hh = Number(digits.slice(0, 1));
      mm = Number(digits.slice(1));
    } else if (digits.length === 4) {
      hh = Number(digits.slice(0, 2));
      mm = Number(digits.slice(2));
    } else return null;
  }
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** วันที่ 'DD/MM/YY' ถูกต้อง (มีอยู่จริง)? */
export function isValidDate(text: string): boolean {
  return shortDateToISO(text) !== null;
}

/** เวลา 'HH:mm' 24 ชม. ถูกต้อง? */
export function isValidTime(text: string): boolean {
  return parseDisplayTime(text) !== null;
}

/** เติม ':' อัตโนมัติระหว่างพิมพ์เวลา คงเฉพาะตัวเลข ≤ 4 หลัก → 'HH:mm' */
export function maskTime(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** ฿1,234,567 */
export function formatTHB(amount: number, withDecimals = false): string {
  const value = amount.toLocaleString('th-TH', {
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  });
  return `฿${value}`;
}

/** แสดงยอดสุทธิพร้อมเครื่องหมาย เช่น +฿3,200 / −฿1,500 */
export function formatSignedTHB(amount: number): string {
  if (amount === 0) return '฿0';
  const sign = amount > 0 ? '+' : '−';
  return `${sign}${formatTHB(Math.abs(amount))}`;
}

/** 1,234.50 EUR */
export function formatCurrency(amount: number, currency: string): string {
  return `${amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('th-TH');
}

/** จำนวนวันระหว่างสองวัน (นับรวมวันเริ่ม) */
export function daysBetween(start: string, end: string): number {
  const s = parseDate(start).getTime();
  const e = parseDate(end).getTime();
  return Math.round((e - s) / 86_400_000) + 1;
}

/** จำนวนวันจาก a ถึง b (ค่าบวก = b อยู่หลัง a) */
export function diffDays(from: string, to: string): number {
  const f = parseDate(from).getTime();
  const t = parseDate(to).getTime();
  return Math.round((t - f) / 86_400_000);
}

export function addDays(value: string, amount: number): string {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);
  return toISODate(date);
}

/* ------------------------------- ระดับเดือน ------------------------------- */

/** วันแรกของเดือน (ISO 'YYYY-MM-01') */
export function startOfMonth(value: string): string {
  const d = parseDate(value);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** วันสุดท้ายของเดือน (ISO) */
export function endOfMonth(value: string): string {
  const d = parseDate(value);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** เลื่อนเดือน (คืนวันแรกของเดือนผลลัพธ์) — รองรับข้ามปีอัตโนมัติ */
export function addMonths(value: string, amount: number): string {
  const d = parseDate(value);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + amount, 1));
}

/** 'สิงหาคม 2569' — ชื่อเดือนไทย + ปี พ.ศ. (แสดงผลเท่านั้น เก็บภายในเป็น ค.ศ.) */
export function formatThaiMonthYear(value: string): string {
  const d = parseDate(value);
  return `${TH_MONTHS_FULL[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/** ข้อความสัมพัทธ์ เช่น "อีก 5 วัน" / "เกินกำหนด 3 วัน" */
export function relativeDayLabel(target: string, today: string): string {
  const d = diffDays(today, target);
  if (d === 0) return 'วันนี้';
  if (d === 1) return 'พรุ่งนี้';
  if (d > 0) return `อีก ${d} วัน`;
  return `เกินกำหนด ${Math.abs(d)} วัน`;
}
