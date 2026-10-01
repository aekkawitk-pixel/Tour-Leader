/**
 * ย่อรูปหลักฐาน (ใบเสร็จ) เป็น JPEG data URL — เก็บไว้กับรายการค่าใช้จ่ายเพื่อเปิดดูรูปภายหลังได้
 *
 * รูปจากกล้องมือถือมักใหญ่ 3–8 MB → ย่อด้านยาวสุดเหลือ maxSide px ที่คุณภาพ 0.75 (ราว 150–400 KB)
 * ตัวหนังสือบนใบเสร็จยังอ่านออก แต่ไม่หนักหน่วยความจำ/พื้นที่เก็บ
 * ย่อไม่สำเร็จ (ไฟล์เสีย / เบราว์เซอร์ไม่รองรับ) → คืน null ให้ผู้เรียกเก็บแค่ชื่อไฟล์ตามเดิม
 */
export async function compressImageToDataUrl(file: File, maxSide = 1600, quality = 0.75): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}
