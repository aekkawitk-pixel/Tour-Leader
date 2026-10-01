/**
 * แก้ไขรูปก่อนอ่านข้อมูล (§1 หมุนรูป / ครอปรูป)
 *
 * ผลลัพธ์เป็น Blob ที่ "ใช้ทำ OCR จริง" และเก็บเป็นไฟล์ต้นฉบับใน Private Storage (§10)
 * ทำงานในเบราว์เซอร์ทั้งหมด — รูปไม่ถูกส่งออกนอกเครื่อง (§9)
 */

/** สัดส่วนพื้นที่ครอป 0-1 เทียบกับภาพหลังหมุน */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

export function isFullCrop(c: CropRect): boolean {
  return c.x <= 0.001 && c.y <= 0.001 && c.width >= 0.999 && c.height >= 0.999;
}

/** ไฟล์ที่รองรับ (§1) */
export const ACCEPTED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
export const ACCEPT_ATTR = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf';

export function isAcceptedFile(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (ACCEPTED_MIME.includes(type)) return true;
  return /\.(jpe?g|png|pdf)$/i.test(file.name);
}

export function isPdf(file: File | Blob, name = ''): boolean {
  return (file.type || '').toLowerCase() === 'application/pdf' || /\.pdf$/i.test(name);
}

/**
 * แปลงไฟล์เป็น Blob รูปภาพที่หมุน/ครอปแล้ว
 * @param rotateDeg 0 / 90 / 180 / 270
 * @param crop สัดส่วนพื้นที่ที่เลือก (เทียบกับภาพหลังหมุน)
 */
export async function renderEditedImage(source: Blob, rotateDeg: number, crop: CropRect): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    const swap = rotateDeg === 90 || rotateDeg === 270;
    const rotW = swap ? bitmap.height : bitmap.width;
    const rotH = swap ? bitmap.width : bitmap.height;

    // 1) วาดภาพที่หมุนแล้วลง canvas ชั่วคราว
    const rotated = document.createElement('canvas');
    rotated.width = rotW;
    rotated.height = rotH;
    const rctx = rotated.getContext('2d');
    if (!rctx) throw new Error('เตรียมภาพไม่สำเร็จ');
    rctx.translate(rotW / 2, rotH / 2);
    rctx.rotate((rotateDeg * Math.PI) / 180);
    rctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

    // 2) ครอปตามสัดส่วนที่เลือก
    const sx = Math.round(crop.x * rotW);
    const sy = Math.round(crop.y * rotH);
    const sw = Math.max(1, Math.round(crop.width * rotW));
    const sh = Math.max(1, Math.round(crop.height * rotH));

    const out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;
    const octx = out.getContext('2d');
    if (!octx) throw new Error('เตรียมภาพไม่สำเร็จ');
    octx.drawImage(rotated, sx, sy, sw, sh, 0, 0, sw, sh);

    return await new Promise<Blob>((resolve, reject) => {
      out.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('แปลงรูปไม่สำเร็จ'))),
        'image/jpeg',
        0.92,
      );
    });
  } finally {
    bitmap.close();
  }
}

/**
 * แปลงหน้าแรกของ PDF เป็นรูป (§1 รองรับ PDF เฉพาะหน้าข้อมูล Passport)
 * เรนเดอร์ด้วย pdf.js ในเบราว์เซอร์ (worker self-host ที่ /pdfjs) — ไฟล์ไม่ถูกส่งออกนอกเครื่อง (§9)
 * เรนเดอร์ที่ scale สูงเพื่อให้แถบ MRZ คมพอสำหรับ OCR
 */
export async function pdfFirstPageToImage(file: Blob): Promise<Blob> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;
  try {
    if (doc.numPages < 1) throw new Error('ไฟล์ PDF ไม่มีหน้าเอกสาร');
    const page = await doc.getPage(1);

    // ตั้งเป้าให้ความกว้างราว 2000px เพื่อให้ MRZ อ่านได้
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(Math.max(2000 / base.width, 1), 4);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('เตรียมภาพจาก PDF ไม่สำเร็จ');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('แปลงหน้า PDF เป็นรูปไม่สำเร็จ'))),
        'image/jpeg',
        0.92,
      );
    });
  } finally {
    await doc.cleanup();
    await loadingTask.destroy();
  }
}
