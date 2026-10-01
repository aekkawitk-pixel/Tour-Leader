import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // สำเนาโปรเจกต์ซ้อนที่หลงเหลือ (มี package.json/tsconfig ของตัวเอง) — ไม่ใช่ส่วนของแอปจริง
    "tour-leader-system-main/**",
    // ไฟล์เอนจินที่ vendor มาไว้เสิร์ฟตรง ๆ (tesseract.js worker/core, pdf.js worker) — เป็น bundle ที่ build มาแล้ว
    "public/tesseract/**",
    "public/pdfjs/**",
  ]),
]);

export default eslintConfig;
