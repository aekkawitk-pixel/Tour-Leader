/**
 * ลำดับ z-index รวมทั้งระบบ — จุดเดียวแทนตัวเลขที่กระจายอยู่ในแต่ละไฟล์
 *
 * zego-design-system.css กำหนด z ของ chrome ตัวเองไว้ตายตัวอยู่แล้ว: topbar 70, sidebar 80,
 * backdrop 150, command 160, toast-stack 190 — ต้องแทรกเลขของแอปให้ถูกลำดับเทียบกับค่าพวกนั้น
 * ไม่ใช่ใช้สเกลเดิมของ Tailwind (20/30/40/45/50/60) ที่ชนกับ sidebar/topbar ของ zego ทันทีที่
 * Header/Sidebar ปรับไปใช้ zego (เช่น Modal เดิม z-50 จะโผล่ "ใต้" sidebar z-80)
 *
 * แบ่งเป็น 2 กลุ่มที่ต้องคิดคนละแบบ:
 *
 * 1) "Local" — Combobox/MonthPicker/InfoPopover/MultiSelect ไม่ได้ portal ออกไปที่ document.body
 *    วาง position:absolute อยู่ในต้นไม้ของตัวเอง จึงแข่ง z-index กันแค่ "ภายในบริบทเดียวกัน" เท่านั้น
 *    ไม่ว่าที่นั้นจะอยู่ในหน้าเปล่า ๆ หรือใน Modal ก็ตาม (Modal เองสร้าง stacking context ใหม่
 *    ให้ลูกของมันอยู่แล้ว) — ตัวเลขกลุ่มนี้จึงคงสเกลเดิม (20/30/40) ได้โดยไม่ชนอะไรจากภายนอก
 *
 * 2) "Global" — Modal/Drawer/ConfirmDialog ใช้ .zego-backdrop ของ zego เองตรง ๆ (z:150) จึงต้องมี
 *    z-index สูงกว่า 150 เสมอ (จัดชั้นเดียวกับ .zego-command ของ zego ที่ z:160) และ PhoneInput
 *    portal ออกไปที่ document.body จริง (ข้าม stacking context ของ Modal) — ถ้าเปิด PhoneInput
 *    จากฟอร์มที่อยู่ใน Modal ต้องมี z-index สูงกว่าตัว Modal เองด้วย ไม่งั้น dropdown ประเทศจะโผล่
 *    "หลัง" Modal ที่ครอบอยู่ ส่วน Toast ต้องสูงสุดเสมอ (แจ้งเตือนต้องเห็นแม้มี Modal เปิดอยู่)
 */
/**
 * ค่า z-index ของ chrome ที่ zego-design-system.css กำหนดไว้เอง (ไฟล์ vendor ไม่แก้ตรง ๆ) —
 * อ้างอิงไว้ที่นี่เพื่อให้โค้ด/เทสต์อื่นเทียบเลขกับค่าจริงได้จุดเดียว ไม่ใช่ตัวเลขที่แอปนี้ตั้งเอง
 */
export const ZEGO_TOPBAR = 70;
export const ZEGO_SIDEBAR = 80;
export const ZEGO_BACKDROP = 150;
export const ZEGO_COMMAND = 160;
export const ZEGO_TOAST_STACK = 190;

export const Z_DROPDOWN = 20;
export const Z_MONTH_PICKER = 30;
export const Z_POPOVER = 40;

/** เท่ากับ .zego-command ของ zego เอง (160) — Modal ใช้ .zego-backdrop (150) ของ zego เป็นฉากหลัง */
export const Z_MODAL = 160;
/** ต้องสูงกว่า Z_MODAL เสมอ — กัน dropdown ประเทศถูก Modal ที่ครอบอยู่บังตอนเปิดจากฟอร์มใน Modal */
export const Z_PHONE_PORTAL = 165;
/** เท่ากับ .zego-toast-stack ของ zego เองพอดี (190) — สูงสุดเสมอ */
export const Z_TOAST = 190;
