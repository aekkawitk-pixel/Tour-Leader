/**
 * อ่านข้อความ + ตำแหน่งบนรูป (OCR ในเบราว์เซอร์ด้วย tesseract.js) — ใช้กับโหมด "แปลทับบนรูป"
 *
 * ทำงานในเครื่องผู้ใช้ทั้งหมด (โมเดลภาษา self-host ที่ /public/tesseract/lang เหมือนระบบพาสปอร์ต)
 * ได้ "บรรทัด + กรอบสี่เหลี่ยม" เป็นพิกัดพิกเซลของรูปจริง → หน้าจอวางคำแปลทับตำแหน่งเดิมได้
 * การแปลเป็นไทยทำแยกที่ /api/translate-lines (ส่งไปแค่ตัวหนังสือ ไม่ส่งรูป)
 *
 * 1 ภาษา = 1 worker ใช้ซ้ำทั้งหน้า (โหลดโมเดลครั้งแรกครั้งเดียว ~2–11 MB) · รวม 'eng' ทุกชุด
 * เพราะใบเสร็จ/ป้ายเอเชียมักมีตัวอักษรละติน ตัวเลข และคำภาษาอังกฤษปนอยู่เสมอ
 */

export type OcrLang = 'en' | 'ja' | 'zh' | 'ko';

export const OCR_LANGS: { value: OcrLang; label: string }[] = [
  { value: 'en', label: 'อังกฤษ' },
  { value: 'ja', label: 'ญี่ปุ่น' },
  { value: 'zh', label: 'จีน' },
  { value: 'ko', label: 'เกาหลี' },
];

const TESS_LANGS: Record<OcrLang, string[]> = {
  en: ['eng'],
  ja: ['jpn', 'eng'],
  zh: ['chi_sim', 'chi_tra', 'eng'],
  ko: ['kor', 'eng'],
};

const TESS_BASE = '/tesseract';

export interface OcrLine {
  text: string;
  /** พิกัดพิกเซลบนรูปจริง (naturalWidth × naturalHeight) */
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js').createWorker>>;

const workers = new Map<OcrLang, Promise<TesseractWorker>>();
let progressHandler: ((p: number) => void) | undefined;

function getWorker(lang: OcrLang): Promise<TesseractWorker> {
  let w = workers.get(lang);
  if (!w) {
    w = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker(TESS_LANGS[lang], 1, {
        workerPath: `${TESS_BASE}/worker.min.js`,
        corePath: `${TESS_BASE}/core`,
        langPath: `${TESS_BASE}/lang`,
        gzip: true,
        logger: (m) => {
          if (m.status === 'recognizing text') progressHandler?.(m.progress);
        },
      });
    })().catch((e) => {
      workers.delete(lang);
      throw e;
    });
    workers.set(lang, w);
  }
  return w;
}

/**
 * tesseract เว้นวรรคระหว่างตัวอักษรจีน/ญี่ปุ่นทีละตัว — ตัดออกให้อ่าน/แปลเป็นคำได้
 * ไม่รวมอักษรเกาหลี (ฮันกึล) เพราะภาษาเกาหลีเว้นวรรคระหว่างคำจริง ตัดแล้วคำจะติดกันผิด
 */
function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/(?<=[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]) (?=[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef])/g, '')
    .trim();
}

/** ความมั่นใจขั้นต่ำ (0–100) — ต่ำกว่านี้มักเป็นลาย/โลโก้/QR ที่ OCR ฝืนอ่านเป็นตัวอักษร */
const MIN_LINE_CONFIDENCE = 60;
const MIN_WORD_CONFIDENCE = 50;

/**
 * บรรทัดนี้เป็น "ข้อความจริง" ที่ควรแปลไหม — กันสิ่งที่ไม่ใช่ตัวหนังสือ (โลโก้ ลายกรอบ QR code ขีดคั่น)
 * ที่ OCR อ่านออกมาเป็นขยะ เช่น "'OY", "[=][ H r | Im", "7\ 7"
 */
function isRealText(text: string, confidence: number, words: { text: string; confidence: number }[]): boolean {
  if (confidence < MIN_LINE_CONFIDENCE) return false;
  const chars = text.replace(/\s/g, '');
  const letters = (chars.match(/\p{L}/gu) ?? []).length;
  const alnum = (chars.match(/[\p{L}\p{N}]/gu) ?? []).length;
  if (letters === 0) return false; // ตัวเลข/สัญลักษณ์ล้วน ไม่ต้องแปล (ต้นฉบับอ่านได้อยู่แล้ว)
  if ((chars.length - alnum) / chars.length > 0.3) return false; // สัญลักษณ์ปนเยอะ = ลาย/กราฟิก
  // อักษรละตินล้วน ต้องมีตัวอักษรพอเป็นคำ (จีน/ญี่ปุ่น/เกาหลี 1–2 ตัวก็เป็นคำได้)
  const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(chars);
  if (!cjk && letters < 3) return false;
  // คำส่วนใหญ่ในบรรทัดต้องอ่านได้มั่นใจ — ขยะมักมีบางคำมั่นใจสูงปนคำมั่นใจต่ำหลายคำ
  const scored = words.filter((w) => w.text.trim());
  if (scored.length > 0 && scored.filter((w) => w.confidence < MIN_WORD_CONFIDENCE).length / scored.length > 0.4) return false;
  return true;
}

interface OcrWord {
  text: string;
  confidence: number;
  bbox: OcrLine['bbox'];
}

/**
 * ตัด "คำขยะ" หัว/ท้ายบรรทัดทิ้ง — ลายกรอบ/โลโก้ข้างข้อความมักถูกอ่านติดมาเป็นคำแรก/คำสุดท้าย
 * เช่น "& © GRAND", "...take a photo A", "...these places. ( )" · ตัดเฉพาะขอบ ไม่แตะคำกลางบรรทัด
 */
function trimEdgeJunk(words: OcrWord[]): OcrWord[] {
  const junk = (w: OcrWord) => {
    const t = w.text.trim();
    if (!t || !/[\p{L}\p{N}]/u.test(t) || w.confidence < MIN_WORD_CONFIDENCE || /^\p{Script=Latin}$/u.test(t)) return true;
    // สัญลักษณ์มากกว่าหรือเท่าตัวอักษร/ตัวเลข เช่น "\7" — ยกเว้นเลขข้อ/จำนวนเงิน/วันที่ ("1." "500." "01/03")
    const alnum = (t.match(/[\p{L}\p{N}]/gu) ?? []).length;
    return t.length - alnum >= alnum && !/^[\p{N}.,:/()-]+$/u.test(t);
  };
  let start = 0;
  let end = words.length;
  while (start < end && junk(words[start])) start++;
  while (end > start && junk(words[end - 1])) end--;
  return words.slice(start, end);
}

function unionBox(boxes: OcrLine['bbox'][]): OcrLine['bbox'] {
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

/** อ่านบรรทัดข้อความพร้อมตำแหน่ง — เก็บเฉพาะที่เป็นข้อความจริง (ดู isRealText) */
export async function recognizeLines(image: string, lang: OcrLang, onProgress?: (p: number) => void): Promise<OcrLine[]> {
  const worker = await getWorker(lang);
  progressHandler = onProgress;
  try {
    const { data } = await worker.recognize(image, {}, { blocks: true });
    const out: OcrLine[] = [];
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          const words = trimEdgeJunk(line.words);
          if (words.length === 0) continue;
          const text = tidy(words.map((w) => w.text).join(' '));
          if (!text || !isRealText(text, line.confidence, words)) continue;
          out.push({ text, bbox: unionBox(words.map((w) => w.bbox)) });
        }
      }
    }
    // กรอบสูงผิดปกติเทียบบรรทัดทั่วไป = กราฟิก (QR/โลโก้) ที่หลุดเกณฑ์ข้างบน — หัวเรื่องตัวใหญ่ยังไม่เกิน 3 เท่า
    if (out.length >= 3) {
      const heights = out.map((l) => l.bbox.y1 - l.bbox.y0).sort((a, b) => a - b);
      const median = heights[Math.floor(heights.length / 2)];
      return out.filter((l) => l.bbox.y1 - l.bbox.y0 <= median * 3);
    }
    return out;
  } finally {
    progressHandler = undefined;
  }
}

export class TranslateClientError extends Error {}

export type TranslateProvider = 'claude' | 'free';

/**
 * แปลหลายบรรทัดเป็นไทย — คืนคำแปลเรียงตามบรรทัดที่ส่งไป
 *
 * ลำดับ: บริการแปลของระบบ (/api/translate-lines, คุณภาพดีสุด) → ถ้าเซิร์ฟเวอร์ยังไม่ได้ตั้ง Key (503)
 * ใช้ "โหมดทดลองฟรี" (MyMemory — ไม่ต้องมี Key, โควตาฟรีราว 5,000 ตัวอักษร/วัน, คุณภาพต่ำกว่า)
 * ⚠️ โหมดฟรีส่งข้อความบนรูปไปบริการภายนอกโดยตรงจากเบราว์เซอร์ — หน้าจอแจ้งผู้ใช้ทุกครั้งที่ใช้
 */
export async function translateLines(lines: string[], lang: OcrLang): Promise<{ translations: string[]; provider: TranslateProvider }> {
  let res: Response;
  try {
    res = await fetch('/api/translate-lines', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines }),
    });
  } catch {
    throw new TranslateClientError('เชื่อมต่อบริการแปลไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
  }
  const json = await res.json().catch(() => null);
  if (res.status === 503) return { translations: await translateFree(lines, lang), provider: 'free' };
  if (!res.ok) throw new TranslateClientError((json && typeof json.error === 'string' && json.error) || 'แปลไม่สำเร็จ');
  return { translations: Array.isArray(json?.translations) ? json.translations : [], provider: 'claude' };
}

/* ------------------------- โหมดทดลองฟรี (MyMemory) ------------------------- */

const FREE_SOURCE: Record<OcrLang, string> = { en: 'en', ja: 'ja', zh: 'zh-CN', ko: 'ko' };
const FREE_MAX_CHARS = 450; // จำกัดต่อคำขอของบริการ (500) — เผื่อไว้

async function translateFreeOne(text: string, lang: OcrLang): Promise<string> {
  // ตัวเลข/สัญลักษณ์ล้วน ไม่ต้องแปล (ประหยัดโควตา)
  if (!/\p{L}/u.test(text)) return text;
  const q = text.slice(0, FREE_MAX_CHARS);
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${FREE_SOURCE[lang]}|th`;
  const res = await fetch(url);
  const json = await res.json().catch(() => null);
  if (json?.quotaFinished) throw new TranslateClientError('โควตาโหมดทดลองฟรีของวันนี้หมดแล้ว — ลองใหม่พรุ่งนี้ หรือตั้งค่าบริการแปลของระบบ');
  const out = json?.responseData?.translatedText;
  // บริการคืนข้อความเตือนเป็นตัวพิมพ์ใหญ่เมื่อมีปัญหา (เช่น "MYMEMORY WARNING") — ใช้ต้นฉบับแทน
  return typeof out === 'string' && out.trim() && !/^MYMEMORY WARNING/i.test(out) ? out.trim() : text;
}

async function translateFree(lines: string[], lang: OcrLang): Promise<string[]> {
  const out: string[] = new Array(lines.length);
  let next = 0;
  // ทีละ 4 คำขอพร้อมกัน — เร็วพอ และไม่ยิงถี่จนโดนจำกัด
  const worker = async () => {
    while (next < lines.length) {
      const i = next++;
      try {
        out[i] = await translateFreeOne(lines[i], lang);
      } catch (err) {
        if (err instanceof TranslateClientError) throw err;
        out[i] = lines[i];
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(4, lines.length) }, worker));
  } catch (err) {
    if (err instanceof TranslateClientError) throw err;
    throw new TranslateClientError('เชื่อมต่อบริการแปลฟรีไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
  }
  return out;
}
