/**
 * POST /api/receipt-scan — อ่านรูปใบเสร็จ (ญี่ปุ่น/จีน/อังกฤษ ฯลฯ) แล้วแปลเป็นไทย
 *
 * ทำงานฝั่งเซิร์ฟเวอร์เท่านั้น — เหตุผลเดียวกับ /api/zego/* (ดู src/app/api/zego/config.ts):
 * ต้องไม่ให้ ANTHROPIC_API_KEY หลุดไปเบราว์เซอร์ ไม่งั้นใครก็เอา Key ไปใช้แทนเราได้จาก Network tab
 *
 * ใช้ Claude (มองเห็นภาพ) อ่าน+แปล+แยกฟิลด์ในคำขอเดียว แทนที่จะทำ OCR ภาษาต้นฉบับ (tesseract.js
 * ที่ระบบพาสปอร์ตใช้) แล้วค่อยแปลแยกอีกที — ใบเสร็จไม่มี pattern ตายตัวแบบ MRZ ของพาสปอร์ต ทำสองขั้น
 * แยกกันความคลาดเคลื่อนจะสะสม ขั้นเดียวจบแม่นกว่าและจัดการได้หลายภาษาพร้อมกันโดยไม่ต้องมีโมเดลภาษา
 * แยกทีละภาษา (ต่างจาก tesseract ที่ต้องโหลดโมเดลภาษาเพิ่มทีละภาษา)
 *
 * ไม่ตั้ง ANTHROPIC_API_KEY ไว้ → ฟีเจอร์นี้ปิดอัตโนมัติ (503) ฝั่งฟอร์มยัง fallback ไปกรอกเองได้ตามปกติ
 * ⚠️ ผลลัพธ์เป็น "ค่าเริ่มต้นให้ตรวจทาน" เท่านั้น ห้ามเชื่อและบันทึกอัตโนมัติโดยไม่ให้ผู้ใช้ตรวจ (§design)
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // กันคำขอรูปใหญ่เกินจำเป็น/ต้นทุนบานปลาย

export class ReceiptScanError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ReceiptScanError';
  }
}

function errorResponse(error: unknown): Response {
  const known = error instanceof ReceiptScanError;
  return Response.json(
    { error: known ? error.message : 'เกิดข้อผิดพลาดที่ไม่คาดคิดขณะอ่านใบเสร็จ' },
    { status: known ? error.status : 500 },
  );
}

interface ExpenseTypeOption {
  code: string;
  name: string;
}

/** ช่องข้อมูลที่ต้องการให้ Claude กรอกกลับมา — บังคับเรียกเครื่องมือนี้เพื่อให้ได้ JSON ที่ parse ได้เสมอ
 *  รับรายการ "ประเภทค่าใช้จ่าย" จริงของระบบมาด้วย (ถ้ามี) เพื่อให้ enum ของ suggestedExpenseTypeCode
 *  บังคับเป็นรหัสที่มีอยู่จริงเท่านั้น — กันโมเดลเดา/สร้างรหัสเอง */
function buildReceiptTool(expenseTypeOptions: ExpenseTypeOption[]) {
  const properties: Record<string, unknown> = {
    merchantNameTh: { type: 'string', description: 'ชื่อร้าน/ผู้ออกใบเสร็จ แปลเป็นไทย — อ่านไม่ได้ให้เว้นว่าง' },
    merchantNameOriginal: { type: 'string', description: 'ชื่อร้านตามต้นฉบับ (ภาษาเดิมบนใบเสร็จ)' },
    merchantAddressTh: { type: 'string', description: 'ที่อยู่ร้าน/ผู้ออกใบเสร็จ แปลเป็นไทย — ไม่มีบนใบเสร็จให้เว้นว่าง' },
    merchantAddressOriginal: { type: 'string', description: 'ที่อยู่ร้านตามต้นฉบับ' },
    receiptDate: { type: 'string', description: 'วันที่บนใบเสร็จ รูปแบบ YYYY-MM-DD — ไม่แน่ใจให้เว้นว่าง ห้ามเดา' },
    totalAmount: { type: 'number', description: 'ยอดรวมสุทธิบนใบเสร็จ (ตัวเลขล้วน ไม่มีหน่วยเงิน)' },
    currency: { type: 'string', description: 'รหัสสกุลเงิน ISO 4217 3 ตัวอักษร เช่น JPY, CNY, THB — เดาจากสัญลักษณ์/บริบทได้' },
    receiptNo: { type: 'string', description: 'เลขที่ใบเสร็จ/ใบกำกับภาษี — ไม่มีให้เว้นว่าง' },
    items: {
      type: 'array',
      description:
        'รายการค่าใช้จ่ายจริงทุกบรรทัดบนใบเสร็จ แปลเป็นไทย — สินค้า/บริการ ค่าธรรมเนียม และส่วนลด (ใส่เป็นจำนวนติดลบ) ' +
        'ห้ามละบรรทัดใดไว้แค่ใน notes เพราะอ่านไม่ชัด ให้ใส่เป็นรายการพร้อม uncertain:true แทนเสมอ ' +
        'ห้ามใส่ยอดเงินที่รับชำระ/เงินทอน หรือตารางสรุปภาษีแยกตามอัตราที่เป็นข้อมูลประกอบ (รวมอยู่ในราคาสินค้าแล้ว ไม่ใช่รายการที่บวกเพิ่ม) ' +
        'ผลรวมของทุกรายการควรบวกกันได้ตรงกับ totalAmount',
      items: {
        type: 'object',
        properties: {
          descriptionTh: { type: 'string', description: 'รายการ แปลเป็นไทย เช่น "ภาษีมูลค่าเพิ่ม" "ส่วนลดคูปอง"' },
          descriptionOriginal: { type: 'string', description: 'รายการตามต้นฉบับ' },
          amount: {
            type: 'number',
            description: 'จำนวนเงินของรายการนี้ — ส่วนลด/รายการที่หักออกจากยอดให้ใส่เป็นค่าติดลบ ประมาณค่าที่ดีที่สุดได้แม้อ่านไม่ชัด (อย่าเว้นว่าง)',
          },
          uncertain: { type: 'boolean', description: 'true ถ้าตัวเลข/ข้อความรายการนี้อ่านได้ไม่ชัดเจน ต้องให้ผู้ใช้ตรวจทานเป็นพิเศษ' },
        },
        required: ['descriptionTh', 'amount'],
      },
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'ความมั่นใจโดยรวมว่าอ่านถูกต้อง' },
    notes: { type: 'string', description: 'ข้อควรระวังภาพรวม เช่น ภาพเบลอ/มีหลายสกุลเงินบนใบเดียว (ไม่ใช่ที่เก็บรายการที่อ่านไม่ชัด — รายการอ่านไม่ชัดให้ใส่ใน items พร้อม uncertain:true)' },
    fullTextTh: {
      type: 'array',
      description:
        'คำแปลแบบละเอียดทุกบรรทัดข้อความที่อ่านออกบนใบเสร็จ เรียงจากบนลงล่างตามที่ปรากฏจริง ไม่คัดกรองใดๆ ' +
        '(ชื่อร้าน ที่อยู่ เลขทะเบียน วันที่เวลา รายการสินค้า ภาษี ส่วนลด ยอดรวม การชำระเงิน เงินทอน ฯลฯ ทุกอย่างที่อ่านออก) ' +
        'ใช้แสดงเทียบต้นฉบับกับคำแปลให้ผู้ใช้ดูละเอียด แยกต่างหากจาก items ที่คัดมาเฉพาะรายการค่าใช้จ่ายจริง',
      items: {
        type: 'object',
        properties: {
          original: { type: 'string', description: 'ข้อความต้นฉบับของบรรทัดนั้น' },
          translated: {
            type: 'string',
            description: 'คำแปลภาษาไทยของบรรทัดนั้น — ถ้าเป็นตัวเลข/ชื่อเฉพาะ/รหัสที่ไม่ต้องแปลให้ใส่ค่าเดิม',
          },
        },
        required: ['original', 'translated'],
      },
    },
  };

  // มีรายการ "ประเภทค่าใช้จ่าย" จริงส่งมาด้วย → เปิดให้โมเดลช่วยเดา แต่บังคับด้วย enum ให้เลือกได้แค่รหัสที่มีจริง
  if (expenseTypeOptions.length > 0) {
    properties.suggestedExpenseTypeCode = {
      type: 'string',
      enum: [...expenseTypeOptions.map((o) => o.code), ''],
      description:
        'รหัสประเภทค่าใช้จ่ายที่ใกล้เคียงเนื้อหาใบเสร็จที่สุด จากรายการที่ให้มา — ถ้าไม่มีรายการไหนเข้ากันชัดเจนให้ใส่ค่าว่าง ("") แทนการเดา',
    };
  }

  return {
    name: 'return_receipt_data',
    description: 'ส่งข้อมูลที่อ่านได้จากใบเสร็จ แปลเป็นภาษาไทยแล้ว',
    input_schema: {
      type: 'object',
      properties,
      required: ['merchantNameTh', 'totalAmount', 'currency', 'confidence'],
    },
  };
}

function buildPrompt(expenseTypeOptions: ExpenseTypeOption[]) {
  const categoryRule =
    expenseTypeOptions.length > 0
      ? `\n8. เลือก suggestedExpenseTypeCode จากรายการประเภทค่าใช้จ่ายนี้เท่านั้น (แสดงเป็น "รหัส: ชื่อ"):\n` +
        expenseTypeOptions.map((o) => `   - ${o.code}: ${o.name}`).join('\n') +
        `\n   พิจารณาจากร้าน/รายการบนใบเสร็จว่าใกล้เคียงประเภทไหนที่สุด ถ้าไม่ชัดเจนให้ใส่ค่าว่าง ("") ห้ามเดาสุ่ม`
      : '';
  return `นี่คือรูปใบเสร็จ/ใบกำกับภาษีที่หัวหน้าทัวร์ถ่ายมาระหว่างทริปต่างประเทศ อาจเป็นภาษาญี่ปุ่น จีน อังกฤษ หรือภาษาอื่น
อ่านและแปลทุกข้อความที่เกี่ยวข้องเป็นภาษาไทยอย่างละเอียดและแม่นยำ (ชื่อร้าน/รายการสินค้า) เหมือนอ่านด้วยเครื่องมือแปลภาพคุณภาพสูง ก่อนส่งกลับผ่านเครื่องมือ return_receipt_data
กฎสำคัญ:
1. แตกทุกบรรทัด "ค่าใช้จ่ายจริง" บนใบเสร็จเป็นรายการใน items เสมอ (สินค้า/บริการ/ค่าธรรมเนียม/ส่วนลด — ส่วนลดใส่เป็นค่าติดลบ)
   ห้ามละรายการที่อ่านไม่ชัดไว้แค่ในคำอธิบาย (notes) — ให้ประมาณค่าที่ดีที่สุดใส่เป็นรายการแล้วทำเครื่องหมาย uncertain: true แทน
2. ห้ามใส่เป็นรายการใน items: (ก) ยอดเงินที่รับชำระหรือเงินทอน (เช่น เงินสด/บัตร/ทอนเงิน) ไม่ใช่ค่าใช้จ่าย
   (ข) ตารางสรุปภาษีแยกตามอัตรา (เช่น "ภาษี 8%" "ภาษี 10%") ที่เป็นข้อมูลประกอบยอดรวมซึ่งรวมอยู่ในราคาสินค้าอยู่แล้ว ไม่ใช่รายการที่บวกเพิ่มต่างหาก
3. ถ้ารายการระบุจำนวน (คน/ชิ้น) คูณราคาต่อหน่วย ให้ใส่ยอดรวมของบรรทัดนั้นเป็น amount รายการเดียว และระบุจำนวน+ราคาต่อหน่วยไว้ใน descriptionTh เช่น "ค่าอาหารผู้ใหญ่ (33 ท่าน x 2,500 เยน)"
4. ผลรวมของทุกรายการใน items ควรบวกกันได้ตรงกับ totalAmount (ยอดรวมสุทธิ/ทั้งหมด/合計/Total บนใบเสร็จ — ไม่ใช่ยอดที่รับชำระหรือเงินทอน)
5. เฉพาะ receiptDate ห้ามเดาถ้าอ่านไม่ออก — เว้นว่างได้
6. ใส่ fullTextTh ให้ครบทุกบรรทัดข้อความที่อ่านออกบนใบเสร็จ เรียงบนลงล่างตามจริง ไม่ต้องคัดกรองแบบ items (ข้อ 1-2) — ใส่ทุกอย่างที่อ่านออกทั้งหมด
7. ถ้าใบเสร็จมีที่อยู่ร้าน/ผู้ออกใบเสร็จ ให้ใส่ merchantAddressTh (แปลไทย) และ merchantAddressOriginal (ต้นฉบับ) ด้วย — ไม่มีให้เว้นว่าง${categoryRule}`;
}

interface AnthropicContentBlock {
  type: string;
  input?: unknown;
}
interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  error?: { message?: string };
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new ReceiptScanError(
        'ยังไม่ได้ตั้งค่าฟีเจอร์สแกนใบเสร็จบนเซิร์ฟเวอร์ (ANTHROPIC_API_KEY) — กรอกข้อมูลด้วยตนเองได้ตามปกติ',
        503,
      );
    }

    let body: { imageBase64?: unknown; mimeType?: unknown; expenseTypeOptions?: unknown };
    try {
      body = await request.json();
    } catch {
      throw new ReceiptScanError('ส่งข้อมูลรูปมาไม่ถูกรูปแบบ', 400);
    }

    const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
    if (!imageBase64 || !mimeType.startsWith('image/')) {
      throw new ReceiptScanError('ไม่พบไฟล์รูปที่จะอ่าน', 400);
    }
    const expenseTypeOptions: ExpenseTypeOption[] = Array.isArray(body.expenseTypeOptions)
      ? body.expenseTypeOptions.filter(
          (o): o is ExpenseTypeOption => !!o && typeof o.code === 'string' && typeof o.name === 'string',
        )
      : [];
    // ขนาด base64 ≈ 4/3 เท่าของไฟล์จริง — ประมาณคร่าว ๆ พอกันคำขอใหญ่เกินไป
    if (imageBase64.length > MAX_IMAGE_BYTES * 1.4) {
      throw new ReceiptScanError('ไฟล์รูปใหญ่เกินไป — ถ่ายใหม่หรือเลือกรูปที่มีขนาดเล็กลง', 413);
    }

    // Key บางประเภทผูกกับ identity (SSO/Google login) ไม่ใช่ workspace ตรง ๆ — ต้องระบุ workspace
    // ที่จะให้ทำงานด้วยผ่าน header นี้ ไม่งั้น Anthropic จะตอบ 400 "anthropic-workspace-id is required"
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
    const receiptTool = buildReceiptTool(expenseTypeOptions);
    const prompt = buildPrompt(expenseTypeOptions);

    let res: Response;
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          ...(workspaceId ? { 'anthropic-workspace-id': workspaceId } : {}),
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2048, // fullTextTh แปลทุกบรรทัดจริง — ใบเสร็จยาวใช้ token เยอะกว่ารายการค่าใช้จ่ายอย่างเดียว
          tools: [receiptTool],
          tool_choice: { type: 'tool', name: receiptTool.name },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
                { type: 'text', text: prompt },
              ],
            },
          ],
        }),
      });
    } catch (cause) {
      throw new ReceiptScanError(`ติดต่อบริการอ่านใบเสร็จไม่สำเร็จ: ${cause instanceof Error ? cause.message : 'ไม่ทราบสาเหตุ'}`, 502);
    }

    const json = (await res.json().catch(() => null)) as AnthropicResponse | null;

    if (!res.ok) {
      const detail = json?.error?.message?.trim();
      throw new ReceiptScanError(`บริการอ่านใบเสร็จตอบกลับ ${res.status}${detail ? ` — ${detail}` : ''}`, 502);
    }

    const toolUse = json?.content?.find((b) => b.type === 'tool_use');
    if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) {
      throw new ReceiptScanError('อ่านข้อมูลจากรูปไม่สำเร็จ — ลองถ่ายใหม่ให้ชัดขึ้น หรือกรอกข้อมูลด้วยตนเอง', 502);
    }

    return Response.json(toolUse.input);
  } catch (error) {
    return errorResponse(error);
  }
}
