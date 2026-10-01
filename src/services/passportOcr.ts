/**
 * Passport OCR Service (§2) — อ่านข้อมูลจากรูปหนังสือเดินทางจริงด้วย tesseract.js (ทำงานในเบราว์เซอร์)
 *
 * จุดสลับ provider: ทั้งไฟล์นี้เป็น adapter เดียว — เปลี่ยนไปเรียก REST API OCR ฝั่งเซิร์ฟเวอร์
 * ได้โดยแก้เฉพาะ runOcrEngine() โดยที่ UI/ตรรกะการแม็ปช่อง (passportOcrMapping) ไม่ต้องแก้
 *
 * ไฟล์โมเดล/เอนจิน self-host ที่ /public/tesseract (ไม่พึ่ง CDN ภายนอก · ใช้งานออฟไลน์ได้)
 * รูปไม่ถูกส่งออกนอกเครื่องผู้ใช้ — สอดคล้อง §9 (Private Storage / ห้าม Public URL)
 */

import { mapOcrToFields, type MappedOcr, type OcrLine } from '@/lib/logic/passportOcrMapping';

/** ขั้นตอนที่ต้องแสดงระหว่างประมวลผล (§2) */
export type OcrStage = 'UPLOADING' | 'QUALITY_CHECK' | 'READING' | 'VALIDATING' | 'DONE';

export const OCR_STAGE_LABEL: Record<OcrStage, string> = {
  UPLOADING: 'กำลังอัปโหลดรูป',
  QUALITY_CHECK: 'กำลังตรวจสอบคุณภาพรูป',
  READING: 'กำลังอ่านข้อมูล Passport',
  VALIDATING: 'กำลังตรวจสอบความถูกต้อง',
  DONE: 'อ่านข้อมูลเรียบร้อย',
};

export interface OcrProgress {
  stage: OcrStage;
  /** ความคืบหน้าโดยรวม 0-100 */
  percent: number;
}

/** ปัญหาคุณภาพรูปที่ตรวจพบ (§2.2) */
export type QualityIssueCode = 'LOW_RESOLUTION' | 'BLURRY' | 'GLARE' | 'TOO_DARK' | 'NO_MRZ_ZONE';

export interface QualityIssue {
  code: QualityIssueCode;
  label: string;
  /** true = ร้ายแรงพอที่จะทำให้ OCR ล้มเหลว */
  severe: boolean;
}

export interface PassportOcrResult extends MappedOcr {
  quality: QualityIssue[];
  rawText: string;
  /** เวลาที่ใช้ (ms) — เก็บไว้ตรวจย้อนหลัง */
  durationMs: number;
}

const TESS_BASE = '/tesseract';

/* ---------------------------------------------------------------------------
 * เตรียมภาพ (§2.3) — หมุนตาม EXIF, ปรับขนาด, เทาและเพิ่มคอนทราสต์
 * ------------------------------------------------------------------------- */

/** โหลดไฟล์เป็น ImageBitmap (จัดการ EXIF orientation ให้อัตโนมัติ) */
async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

/** วาดลง canvas พร้อมหมุนตามที่ผู้ใช้สั่ง (§1 ปุ่มหมุนรูป) และขยายให้ความกว้างพอต่อการอ่าน */
function drawToCanvas(bitmap: ImageBitmap, rotateDeg: number, targetWidth: number): HTMLCanvasElement {
  const rad = (rotateDeg * Math.PI) / 180;
  const swap = rotateDeg === 90 || rotateDeg === 270;
  const srcW = swap ? bitmap.height : bitmap.width;
  const srcH = swap ? bitmap.width : bitmap.height;

  const scale = Math.min(Math.max(targetWidth / srcW, 1), 4); // ไม่ย่อ · ไม่ขยายเกิน 4 เท่า
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(srcW * scale);
  canvas.height = Math.round(srcH * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('ไม่สามารถเตรียมภาพได้ (canvas ไม่พร้อมใช้งาน)');
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(bitmap, (-bitmap.width * scale) / 2, (-bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
  return canvas;
}

/** เทา + ยืดคอนทราสต์ (ช่วยให้ MRZ อ่านง่ายขึ้น) */
function enhance(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  let min = 255, max = 0;
  const grey = new Uint8ClampedArray(d.length / 4);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    grey[p] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = ((grey[p] - min) * 255) / range;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

/* ---------------------------------------------------------------------------
 * ตรวจคุณภาพรูป (§2.2) — วัดจากพิกเซลจริง ไม่ใช่ค่าที่สมมติขึ้น
 * ------------------------------------------------------------------------- */

function assessQuality(canvas: HTMLCanvasElement): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const ctx = canvas.getContext('2d');
  if (!ctx) return issues;

  const { width: w, height: h } = canvas;
  const { data } = ctx.getImageData(0, 0, w, h);

  // ความละเอียด — MRZ ต้องการความกว้างพอสมควรจึงจะแยกตัวอักษรได้
  if (w < 900) {
    issues.push({ code: 'LOW_RESOLUTION', label: `ความละเอียดต่ำ (กว้าง ${w}px) — ควรถ่ายให้ชัดและเต็มหน้าข้อมูล`, severe: w < 600 });
  }

  // ความคมชัด: ความแปรปรวนของ Laplacian (ค่ายิ่งต่ำ = ยิ่งเบลอ)
  const grey = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    grey[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  let sum = 0, sumSq = 0, n = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 500)); // สุ่มตัวอย่างเพื่อความเร็ว
  for (let y = step; y < h - step; y += step) {
    for (let x = step; x < w - step; x += step) {
      const c = grey[y * w + x];
      const lap = 4 * c - grey[(y - step) * w + x] - grey[(y + step) * w + x] - grey[y * w + x - step] - grey[y * w + x + step];
      sum += lap; sumSq += lap * lap; n++;
    }
  }
  const variance = n > 0 ? sumSq / n - (sum / n) ** 2 : 0;
  if (variance < 120) {
    issues.push({ code: 'BLURRY', label: 'ภาพไม่คมชัด (เบลอ) — ถือกล้องให้นิ่งและโฟกัสที่หน้าข้อมูล', severe: variance < 40 });
  }

  // แสงสะท้อน / มืดเกินไป
  let bright = 0, dark = 0, total = 0;
  for (let p = 0; p < grey.length; p += 7) {
    const v = grey[p];
    if (v > 250) bright++;
    if (v < 40) dark++;
    total++;
  }
  if (total > 0 && bright / total > 0.06) {
    issues.push({ code: 'GLARE', label: 'พบแสงสะท้อนบนหน้าเล่ม — หลีกเลี่ยงแสงตรงหรือแฟลช', severe: bright / total > 0.18 });
  }
  if (total > 0 && dark / total > 0.55) {
    issues.push({ code: 'TOO_DARK', label: 'ภาพมืดเกินไป — ถ่ายในที่ที่มีแสงเพียงพอ', severe: dark / total > 0.8 });
  }

  return issues;
}

/* ---------------------------------------------------------------------------
 * เรียก engine
 * ------------------------------------------------------------------------- */

type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js').createWorker>>;

let workerPromise: Promise<TesseractWorker> | null = null;

/** สร้าง worker ครั้งเดียวแล้วใช้ซ้ำ (โหลดโมเดล ~10MB ครั้งแรกเท่านั้น) */
async function getWorker(onProgress?: (p: number) => void): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      // อังกฤษ (หน้าเล่ม + MRZ) + ไทย (ชื่อไทยตามเล่ม §2) — โมเดล self-host ที่ /public/tesseract
      return createWorker(['eng', 'tha'], 1, {
        workerPath: `${TESS_BASE}/worker.min.js`,
        corePath: `${TESS_BASE}/core`,
        langPath: `${TESS_BASE}/lang`,
        gzip: true,
        logger: (m) => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress); },
      });
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

/** ปล่อย worker (เรียกเมื่อออกจากหน้า) */
export async function disposeOcrEngine(): Promise<void> {
  if (!workerPromise) return;
  try { const w = await workerPromise; await w.terminate(); } catch { /* ไม่มีผลต่อผู้ใช้ */ }
  workerPromise = null;
}

interface EngineOutput {
  vizText: string;
  vizLines: OcrLine[];
  mrzText: string;
  mrzConfidence: number;
}

/**
 * จุดเดียวที่ผูกกับ tesseract.js — สลับเป็น REST API ได้โดยแก้เฉพาะฟังก์ชันนี้
 * อ่าน 2 รอบ: ทั้งหน้า (VIZ) และเฉพาะแถบ MRZ ด้านล่างด้วยชุดอักขระจำกัด (§2.5)
 */
async function runOcrEngine(canvas: HTMLCanvasElement, onProgress: (p: number) => void): Promise<EngineOutput> {
  const worker = await getWorker();

  // รอบที่ 1 — ทั้งหน้า
  await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '3' as never });
  const viz = await worker.recognize(canvas, {}, { text: true, blocks: true });
  onProgress(0.6);

  const vizLines: OcrLine[] = [];
  for (const block of viz.data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) vizLines.push({ text: line.text, confidence: line.confidence });
    }
  }

  // รอบที่ 2 — เฉพาะแถบ MRZ (1 ใน 4 ส่วนล่างของภาพ) ด้วยชุดอักขระของ MRZ
  const mrzTop = Math.floor(canvas.height * 0.72);
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
    tessedit_pageseg_mode: '6' as never,
  });
  const mrzRes = await worker.recognize(
    canvas,
    { rectangle: { left: 0, top: mrzTop, width: canvas.width, height: canvas.height - mrzTop } },
    { text: true, blocks: true },
  );
  onProgress(0.95);

  return {
    vizText: viz.data.text,
    vizLines,
    mrzText: mrzRes.data.text,
    mrzConfidence: mrzRes.data.confidence,
  };
}

/* ---------------------------------------------------------------------------
 * API หลัก
 * ------------------------------------------------------------------------- */

export interface RecognizeOptions {
  todayISO: string;
  /** องศาที่ผู้ใช้หมุนรูป (0/90/180/270) */
  rotateDeg?: number;
  onProgress?: (p: OcrProgress) => void;
}

/**
 * อ่านข้อมูลจากรูปหนังสือเดินทาง — คืนเฉพาะค่าที่อ่านได้จริงจากรูป
 * ห้ามเรียกใช้เพื่อบันทึกลงฐานข้อมูลโดยตรง (§2 ท้ายข้อ) — ต้องผ่านหน้าตรวจสอบก่อนเสมอ
 */
export async function recognizePassport(file: Blob, opts: RecognizeOptions): Promise<PassportOcrResult> {
  const started = Date.now();
  const report = (stage: OcrStage, percent: number) => opts.onProgress?.({ stage, percent });

  report('UPLOADING', 5);
  const bitmap = await loadBitmap(file);

  report('QUALITY_CHECK', 15);
  const canvas = drawToCanvas(bitmap, opts.rotateDeg ?? 0, 1800);
  bitmap.close();
  const quality = assessQuality(canvas);
  enhance(canvas);

  report('READING', 25);
  let engine: EngineOutput;
  try {
    engine = await runOcrEngine(canvas, (p) => report('READING', 25 + Math.round(p * 55)));
  } catch (err) {
    // เอนจินโหลด/ทำงานไม่ได้ → ถือเป็น "OCR ไม่สำเร็จ" (§8) ไม่ใช่ข้อผิดพลาดที่ทำให้ผู้ใช้ไปต่อไม่ได้
    const reason = err instanceof Error ? err.message : String(err);
    return {
      fields: mapOcrToFields({ vizText: '', vizLines: [], mrzText: '', mrzConfidence: 0, todayISO: opts.todayISO }).fields,
      mrz: null,
      mrzCheck: { parsed: false, passportNoValid: null, dateOfBirthValid: null, expiryValid: null, compositeValid: null },
      failureReasons: [`เริ่มระบบอ่านข้อมูลไม่สำเร็จ: ${reason}`],
      succeeded: false,
      quality,
      rawText: '',
      durationMs: Date.now() - started,
    };
  }

  report('VALIDATING', 85);
  const mapped = mapOcrToFields({
    vizText: engine.vizText,
    vizLines: engine.vizLines,
    mrzText: engine.mrzText,
    mrzConfidence: engine.mrzConfidence,
    todayISO: opts.todayISO,
  });

  // เพิ่มเหตุผลจากคุณภาพรูปเมื่ออ่านไม่สำเร็จ (§8 แจ้งสาเหตุที่เป็นไปได้)
  const failureReasons = [...mapped.failureReasons];
  if (!mapped.succeeded || !mapped.mrz) {
    for (const q of quality) failureReasons.push(q.label);
    if (quality.length === 0 && !mapped.mrz) {
      failureReasons.push('อาจถ่ายไม่ครบหน้าข้อมูล (หน้าที่มีรูปถ่ายและแถบตัวอักษรด้านล่าง)');
    }
  }

  report('DONE', 100);
  return {
    ...mapped,
    failureReasons,
    quality,
    rawText: engine.vizText,
    durationMs: Date.now() - started,
  };
}
