/**
 * ตัวเชื่อม Zego API — ทำงานฝั่งเซิร์ฟเวอร์เท่านั้น
 *
 * ⚠️ ทุกคำขอต้องผ่าน Route Handler เสมอ ห้ามยิงจากหน้าเว็บตรง ๆ
 *    เพราะ Zego API ไม่เปิด CORS และ Token จะโผล่ใน Network tab ให้ทุกคนที่เปิดหน้านั้นเห็น
 *
 * Token มาได้ 2 ทาง — เรียงตามลำดับที่ใช้:
 *   1) ZEGO_API_TOKEN (env var) — ตั้งที่ .env.local หรือ Environment Variables ของ Vercel
 *      ปลอดภัยกว่าเพราะอยู่ฝั่งเซิร์ฟเวอร์ ไม่มีทางหลุดถึงเบราว์เซอร์เลย
 *   2) Token ที่ผู้ใช้กรอกในหน้า "ตั้งค่าการเชื่อมต่อ" แล้วส่งมากับ header x-zego-token
 *      สะดวกกว่า (ไม่ต้องแตะไฟล์/รีสตาร์ท) แต่เก็บอยู่ใน localStorage ของเครื่องนั้น
 *      ใครเปิด DevTools ที่เครื่องนั้นได้ก็อ่านได้ — ใช้กับงานจริงควรใช้ทาง (1)
 *
 * ตั้ง env var ไว้ = ชนะเสมอ (ค่าที่ Deploy ไว้ต้องไม่ถูกค่าฝั่งเบราว์เซอร์แทนที่โดยไม่รู้ตัว)
 */

export const ZEGO_BASE_URL = 'https://www.zegoapi.com/v1.5';

/** ชื่อ header ที่หน้าเว็บใช้ส่ง Token ที่ตั้งค่าไว้มาให้ Route Handler */
export const ZEGO_TOKEN_HEADER = 'x-zego-token';

/** Token มาจากไหน — ใช้บอกผู้ใช้ว่ากำลังเชื่อมด้วยค่าตัวไหน */
export type ZegoTokenSource = 'env' | 'setup' | 'none';

/** ข้อผิดพลาดที่อธิบายให้ผู้ใช้อ่านรู้เรื่อง พร้อมรหัสสถานะที่ควรตอบกลับ */
export class ZegoRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ZegoRequestError';
  }
}

/** เลือก Token ที่จะใช้ พร้อมบอกที่มา — env ชนะค่าที่ตั้งจากหน้าเว็บเสมอ */
export function resolveToken(request: Request): { token: string | null; source: ZegoTokenSource } {
  const fromEnv = process.env.ZEGO_API_TOKEN?.trim();
  if (fromEnv) return { token: fromEnv, source: 'env' };
  const fromSetup = request.headers.get(ZEGO_TOKEN_HEADER)?.trim();
  if (fromSetup) return { token: fromSetup, source: 'setup' };
  return { token: null, source: 'none' };
}

/**
 * เรียก Zego API 1 ครั้ง แล้วคืน JSON ที่ได้
 * ยังไม่มี Token → โยน 503 พร้อมข้อความบอกวิธีตั้งค่า (ไม่ใช่ 500 ที่ไม่บอกอะไรเลย)
 */
export async function zegoFetch(path: string, token: string | null): Promise<unknown> {
  if (!token) {
    throw new ZegoRequestError(
      'ยังไม่ได้ตั้งค่า Token — กรอกในหัวข้อ “ตั้งค่าการเชื่อมต่อ” ของหน้านี้ หรือตั้ง ZEGO_API_TOKEN บนเซิร์ฟเวอร์',
      503,
    );
  }

  let res: Response;
  try {
    res = await fetch(`${ZEGO_BASE_URL}${path}`, {
      // ยืนยันกับ API จริงแล้วว่า header ชื่อ auth-token (ส่ง authorization ได้ผลเท่ากับไม่ส่งอะไรเลย)
      headers: { 'auth-token': token, 'Content-Type': 'application/json' },
      // ข้อมูลโปรแกรมทัวร์เปลี่ยนได้ตลอด — ไม่ให้ Next แคชคำขอนี้
      cache: 'no-store',
    });
  } catch (cause) {
    throw new ZegoRequestError(`ติดต่อ Zego API ไม่สำเร็จ: ${cause instanceof Error ? cause.message : 'ไม่ทราบสาเหตุ'}`, 502);
  }

  if (!res.ok) {
    /*
      ส่งข้อความที่ Zego บอกมาต่อให้ผู้ใช้เห็นด้วย
      "400 Bad Request" เฉย ๆ ไม่พอให้แก้ปัญหาได้ — Zego แยกเหตุไว้ในฟิลด์ message เช่น
      "Invalid Token !!" (Token ไม่ถูก) กับ "Access Denied" (ไม่ได้ส่ง header มาเลย)
    */
    const detail = await readZegoMessage(res);
    const tokenIssue = [400, 401, 403].includes(res.status);
    const hint = tokenIssue ? ' · สร้าง Token ใหม่ได้ที่เมนู Generate Token บน zegoapi.com' : '';
    throw new ZegoRequestError(
      `Zego API ตอบกลับ ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}${hint}`,
      502,
    );
  }

  try {
    return await res.json();
  } catch {
    throw new ZegoRequestError('Zego API ตอบกลับเป็นข้อมูลที่ไม่ใช่ JSON', 502);
  }
}

/**
 * ข้อความอธิบายเหตุจาก Zego — อ่านจาก body ของคำตอบที่ไม่ผ่าน
 * อ่านไม่ได้/ไม่ใช่ JSON ก็คืนค่าว่าง ไม่ให้การอ่าน error ไปพังทับ error เดิม
 */
async function readZegoMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text.trim()) return '';
    const body = JSON.parse(text) as { message?: unknown; statusMessage?: unknown };
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message) return message;
    return typeof body.statusMessage === 'string' ? body.statusMessage.trim() : '';
  } catch {
    return '';
  }
}

/** แปลง error ใด ๆ เป็น Response ที่หน้าเว็บอ่านได้ (ไม่หลุดรายละเอียดภายในเซิร์ฟเวอร์) */
export function zegoErrorResponse(error: unknown): Response {
  const known = error instanceof ZegoRequestError;
  return Response.json(
    { error: known ? error.message : 'เกิดข้อผิดพลาดที่ไม่คาดคิดขณะติดต่อ Zego API' },
    { status: known ? error.status : 500 },
  );
}
