/**
 * ตัวช่วยอ่าน/เขียน localStorage ที่ใช้ร่วมกันทุก Store (Demo)
 *
 * กติกาเดียวกันทุกที่:
 *   • SSR / เบราว์เซอร์ที่ปิด storage → อ่านคืนค่า fallback ไม่ทำให้หน้าเว็บพัง
 *   • JSON เสีย → คืน fallback ไม่ทำให้หน้าเว็บพัง
 *   • เขียนไม่สำเร็จ → **โยน StorageWriteError พร้อมสาเหตุจริง**
 *     (ห้ามกลืน error เงียบ ๆ เพราะ UI จะขึ้นว่า "บันทึกสำเร็จ" ทั้งที่ข้อมูลไม่ได้ถูกบันทึก)
 */

/** เขียนข้อมูลลงเบราว์เซอร์ไม่สำเร็จ — `message` อธิบายสาเหตุจริงให้ผู้ใช้อ่านได้ */
export class StorageWriteError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageWriteError';
  }
}

export function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

/** true เมื่อรันอยู่ในเบราว์เซอร์ (ต่างจาก canUseStorage ที่รวมเงื่อนไข storage ใช้ได้ด้วย) */
function inBrowser(): boolean {
  return typeof window !== 'undefined';
}

/** อ่านค่าดิบ — คืน null เมื่อไม่มี Key หรืออ่านไม่ได้ */
export function readRaw(key: string): string | null {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** อ่าน JSON อย่างปลอดภัย — ข้อมูลเสีย/ไม่มี Key → คืน fallback */
export function readJson<T>(key: string, fallback: T): T {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

/** โควตาเต็มหรือไม่ — ชื่อ/รหัส error ต่างกันตามเบราว์เซอร์ */
function isQuotaError(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 ||
      err.code === 1014
    );
  }
  return err instanceof Error && /quota/i.test(err.message);
}

/**
 * เขียน JSON — สำเร็จเงียบ ๆ · ไม่สำเร็จโยน StorageWriteError พร้อมสาเหตุจริง
 * บน SSR (ไม่มี window) จะข้ามไปโดยไม่โยน เพราะไม่มีการกดบันทึกจากผู้ใช้อยู่แล้ว
 */
export function writeJson(key: string, value: unknown): void {
  if (!inBrowser()) return;
  if (!canUseStorage()) {
    throw new StorageWriteError(
      'เบราว์เซอร์ปิดการใช้งานพื้นที่จัดเก็บข้อมูล (localStorage) — บันทึกข้อมูลไม่ได้',
    );
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (isQuotaError(err)) {
      throw new StorageWriteError(
        'พื้นที่จัดเก็บข้อมูลของเบราว์เซอร์เต็ม — กรุณาลดขนาดรูปประจำตัว/ไฟล์แนบ แล้วบันทึกใหม่',
        { cause: err },
      );
    }
    throw new StorageWriteError(
      `บันทึกลงพื้นที่จัดเก็บของเบราว์เซอร์ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

/** ข้อความสาเหตุจริงสำหรับแสดงบน UI — ไม่ใช่ข้อความรวม ๆ ว่า "ลองใหม่" */
export function saveErrorMessage(err: unknown, fallback = 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}
