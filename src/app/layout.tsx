import type { Metadata } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import '@/styles/zego-design-system.css';
import '@/styles/zego-overrides.css';
import { DemoProvider } from '@/store/DemoStore';
import { ThemeProvider } from '@/store/ThemeStore';
import { AppShell } from '@/components/layout/AppShell';
import { UI_PREFS_STORAGE_KEY } from '@/services/ui-prefs-storage';

/**
 * กัน flash ของธีม/ความหนาแน่นผิดตอนโหลดหน้า — RootLayout เป็น Server Component อ่าน
 * localStorage ไม่ได้ จึงต้องใช้สคริปต์ beforeInteractive ตั้ง data-zego-theme/data-zego-density
 * ที่ <html> ให้เสร็จก่อน paint แรก (ThemeProvider ฝั่ง client จะอ่านค่าเดิมนี้มาเก็บ state ต่อ)
 * ต้องคง logic (key, ชนิดข้อมูลที่ยอมรับ, fallback) ให้ตรงกับ loadUiPrefs ใน ui-prefs-storage.ts เสมอ
 */
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var raw = window.localStorage.getItem(${JSON.stringify(UI_PREFS_STORAGE_KEY)});
    var prefs = raw ? JSON.parse(raw) : null;
    var theme = prefs && (prefs.theme === 'light' || prefs.theme === 'dark')
      ? prefs.theme
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var density = prefs && (prefs.density === 'comfortable' || prefs.density === 'compact' || prefs.density === 'dense')
      ? prefs.density
      : 'comfortable';
    document.documentElement.setAttribute('data-zego-theme', theme);
    document.documentElement.setAttribute('data-zego-density', density);
  } catch (e) {
    document.documentElement.setAttribute('data-zego-theme', 'light');
    document.documentElement.setAttribute('data-zego-density', 'comfortable');
  }
})();
`;

const notoSansThai = Noto_Sans_Thai({
  variable: '--font-thai',
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ระบบจัดการหัวหน้าทัวร์ (Demo)',
  description:
    'ระบบต้นแบบสำหรับจัดการหัวหน้าทัวร์ งานทัวร์ ปฏิทินงาน การเบิกจ่าย และการเคลียร์งาน — ข้อมูลทั้งหมดเป็นข้อมูลจำลอง',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${notoSansThai.variable} h-full`}
      // สคริปต์ beforeInteractive ด้านบนเติม data-zego-theme/data-zego-density ให้ <html>
      // นอก React (ก่อน hydrate) ตามที่ตั้งใจ — ต้องกัน React เตือน hydration mismatch เพราะ
      // attribute พวกนี้ "ควร" ต่างจาก server เสมอ (server ไม่รู้ค่าที่ผู้ใช้ตั้งไว้ใน localStorage)
      suppressHydrationWarning
    >
      <body className="min-h-full antialiased">
        <Script id="zego-theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <ThemeProvider>
          <DemoProvider>
            <AppShell>{children}</AppShell>
          </DemoProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
