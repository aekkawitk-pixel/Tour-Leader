/**
 * POST /api/translate-lines — แปลข้อความหลายบรรทัด (อังกฤษ/ญี่ปุ่น/จีน/เกาหลี) เป็นไทย
 *
 * ใช้กับโหมด "แปลทับบนรูป" ในหน้าดูรูปหลักฐาน: เบราว์เซอร์อ่านข้อความ + ตำแหน่งบนรูปเอง (tesseract.js)
 * แล้วส่งมาเฉพาะ "ตัวหนังสือ" ให้แปล — ไม่ส่งรูป จึงเร็วและถูกกว่าการส่งรูปทั้งใบไปอ่านซ้ำ
 * ลำดับคำแปลตรงกับลำดับบรรทัดที่ส่งมาเสมอ (ผู้เรียกวางคำแปลกลับลงตำแหน่งเดิมตาม index)
 *
 * ทำงานฝั่งเซิร์ฟเวอร์เท่านั้น — ANTHROPIC_API_KEY ห้ามหลุดไปเบราว์เซอร์ (เหตุผลเดียวกับ /api/receipt-scan)
 * ไม่ตั้ง Key → 503 พร้อมข้อความอธิบาย ฝั่งหน้าจอยังแสดงกรอบข้อความต้นฉบับได้ตามปกติ
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';
const MAX_LINES = 200;
const MAX_CHARS = 20_000;

class TranslateError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** ผลลัพธ์บังคับรูปแบบ: คำแปลเรียงตามบรรทัดที่ส่งมา (จำนวนเท่ากัน) */
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    translations: { type: 'array', items: { type: 'string' } },
  },
  required: ['translations'],
  additionalProperties: false,
} as const;

const PROMPT = `แปลข้อความแต่ละบรรทัดด้านล่างเป็นภาษาไทย ข้อความมาจากการอ่านรูปใบเสร็จ/ตั๋ว/ป้ายด้วย OCR
(ภาษาต้นฉบับอาจเป็นอังกฤษ ญี่ปุ่น จีน หรือเกาหลี และอาจมีตัวอักษรที่อ่านผิดเล็กน้อย)

- ตอบกลับคำแปล 1 รายการต่อ 1 บรรทัด เรียงตามลำดับเดิม จำนวนเท่ากับบรรทัดที่ส่งมาพอดี
- แปลให้สั้นกระชับพอวางทับตำแหน่งเดิมบนรูปได้ ใช้ภาษาที่หัวหน้าทัวร์/ฝ่ายบัญชีเข้าใจง่าย
- ตัวเลข ราคา วันที่ เวลา รหัส/เลขที่ และหน่วยเงิน คงไว้ตามต้นฉบับ
- ชื่อเฉพาะ (ร้าน สถานที่ แบรนด์) ถอดเสียงเป็นไทย หรือคงต้นฉบับไว้ถ้าเป็นชื่อที่คนไทยรู้จักในรูปนั้นอยู่แล้ว
- บรรทัดที่เป็นภาษาไทยอยู่แล้ว เป็นแค่ตัวเลข/สัญลักษณ์ หรืออ่านไม่ออก ให้คืนข้อความเดิม`;

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new TranslateError('ยังไม่ได้ตั้งค่าบริการแปลบนเซิร์ฟเวอร์ (ANTHROPIC_API_KEY) — ดูข้อความต้นฉบับบนรูปได้ตามปกติ', 503);
    }

    let body: { lines?: unknown };
    try {
      body = await request.json();
    } catch {
      throw new TranslateError('ส่งข้อมูลมาไม่ถูกรูปแบบ', 400);
    }
    const lines = Array.isArray(body.lines) ? body.lines.filter((l): l is string => typeof l === 'string') : [];
    if (lines.length === 0) throw new TranslateError('ไม่มีข้อความที่จะแปล', 400);
    if (lines.length > MAX_LINES || lines.join('').length > MAX_CHARS) {
      throw new TranslateError('ข้อความบนรูปยาวเกินไป — ครอปรูปให้เหลือเฉพาะส่วนที่ต้องการแปล', 413);
    }

    // Key บางประเภทต้องระบุ workspace (ดูหมายเหตุใน /api/receipt-scan)
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
    const client = new Anthropic({
      ...(workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } } : {}),
    });

    const numbered = lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        // งานแปลสั้น ๆ ไม่ต้องคิดลึก — effort ต่ำ เร็วและประหยัด
        output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        // ถ้าตัวกรองความปลอดภัยปฏิเสธโดยไม่จำเป็น ให้เซิร์ฟเวอร์ลองโมเดลสำรองให้เองในคำขอเดียวกัน
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages: [{ role: 'user', content: `${PROMPT}\n\nข้อความ (${lines.length} บรรทัด):\n${numbered}` }],
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) throw new TranslateError('บริการแปลมีผู้ใช้มาก — ลองใหม่อีกครั้งในสักครู่', 429);
      if (err instanceof Anthropic.AuthenticationError) throw new TranslateError('Key ของบริการแปลไม่ถูกต้อง — ตรวจสอบ ANTHROPIC_API_KEY', 502);
      if (err instanceof Anthropic.APIError) throw new TranslateError(`บริการแปลตอบกลับ ${err.status ?? ''} — ${err.message}`, 502);
      throw new TranslateError('ติดต่อบริการแปลไม่สำเร็จ', 502);
    }

    if (response.stop_reason === 'refusal') throw new TranslateError('บริการแปลปฏิเสธข้อความนี้', 422);
    if (response.stop_reason === 'max_tokens') throw new TranslateError('ข้อความยาวเกินไป แปลไม่ครบ', 413);

    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text ?? '';
    let parsed: { translations?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new TranslateError('อ่านผลแปลไม่สำเร็จ — ลองใหม่อีกครั้ง', 502);
    }
    const out = Array.isArray(parsed.translations) ? parsed.translations.map((t) => (typeof t === 'string' ? t : '')) : [];
    // กันจำนวนไม่ตรง: ขาด = ใช้ข้อความเดิม · เกิน = ตัดทิ้ง (วางทับตาม index ต้องตรงกันเสมอ)
    const translations = lines.map((l, i) => out[i]?.trim() || l);
    return Response.json({ translations });
  } catch (error) {
    const known = error instanceof TranslateError;
    return Response.json(
      { error: known ? error.message : 'เกิดข้อผิดพลาดที่ไม่คาดคิดขณะแปล' },
      { status: known ? error.status : 500 },
    );
  }
}
