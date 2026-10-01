/**
 * Receipt Scan (client) — เรียก /api/receipt-scan (ฝั่งเซิร์ฟเวอร์) ให้อ่าน+แปลรูปใบเสร็จ
 * ไม่เรียก Anthropic API ตรงจากเบราว์เซอร์เด็ดขาด (ดูเหตุผลที่ src/app/api/receipt-scan/route.ts)
 */

export interface ReceiptScanItem {
  descriptionTh: string;
  descriptionOriginal?: string;
  /** ติดลบได้ — ใช้แทนส่วนลด/รายการที่หักออกจากยอด */
  amount?: number;
  /** true = อ่านตัวเลข/ข้อความรายการนี้ได้ไม่ชัดเจน ต้องตรวจทานเป็นพิเศษ */
  uncertain?: boolean;
}

export interface ReceiptFullTextLine {
  original: string;
  translated: string;
}

export interface ReceiptScanResult {
  merchantNameTh: string;
  merchantNameOriginal?: string;
  merchantAddressTh?: string;
  merchantAddressOriginal?: string;
  receiptDate?: string;
  totalAmount: number;
  currency: string;
  receiptNo?: string;
  items?: ReceiptScanItem[];
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
  /** คำแปลละเอียดทุกบรรทัดบนใบเสร็จ เรียงบนลงล่าง — ใช้แสดงตัวอย่างเทียบต้นฉบับ/คำแปล แยกจาก items ที่คัดมาเฉพาะรายการค่าใช้จ่าย */
  fullTextTh?: ReceiptFullTextLine[];
  /** รหัสประเภทค่าใช้จ่ายที่โมเดลเดามาจาก expenseTypeOptions ที่ส่งไป — ค่าว่างถ้าไม่ชัดเจน ผู้ใช้เปลี่ยนได้เสมอ */
  suggestedExpenseTypeCode?: string;
}

export interface ExpenseTypeOption {
  code: string;
  name: string;
}

export class ReceiptScanClientError extends Error {}

/** อ่านไฟล์เป็น base64 ล้วน (ตัด "data:image/...;base64," ส่วนหน้าทิ้ง) */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx === -1 ? result : result.slice(commaIdx + 1));
    };
    reader.onerror = () => reject(new ReceiptScanClientError('อ่านไฟล์รูปไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

/**
 * สแกน+แปลใบเสร็จ — throw ReceiptScanClientError พร้อมข้อความอ่านรู้เรื่องเมื่อไม่สำเร็จ
 * ส่ง expenseTypeOptions (ถ้ามี) ไปด้วยเพื่อให้ผลลัพธ์มี suggestedExpenseTypeCode เดาประเภทค่าใช้จ่ายกลับมา
 */
export async function scanReceipt(file: File, expenseTypeOptions?: ExpenseTypeOption[]): Promise<ReceiptScanResult> {
  const imageBase64 = await fileToBase64(file);
  let res: Response;
  try {
    res = await fetch('/api/receipt-scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageBase64, mimeType: file.type || 'image/jpeg', expenseTypeOptions }),
    });
  } catch {
    throw new ReceiptScanClientError('เชื่อมต่อไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ReceiptScanClientError(
      (json && typeof json.error === 'string' && json.error) || 'อ่านใบเสร็จไม่สำเร็จ',
    );
  }
  return json as ReceiptScanResult;
}
