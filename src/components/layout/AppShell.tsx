'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { GuideShell } from './GuideShell';
import { StaffShell } from './StaffShell';
import { ToastContainer } from '@/components/ui/Toast';
import { useDemo } from '@/store/DemoStore';
import { Button, cx, EmptyState, PageLoading } from '@/components/ui/Primitives';
import { canViewPath, landingPathForRole, ROLE_SCOPE } from '@/lib/permissions';
import { ROLE } from '@/lib/labels';

/**
 * ความกว้างของพื้นที่เนื้อหา — ปกติจำกัดด้วย --zego-max (1660px) กึ่งกลาง
 * บางมุมมอง (เช่นปฏิทินวันลา) ต้องใช้พื้นที่เต็มที่เหลือจาก Sidebar → 'wide'
 */
type ContentWidth = 'default' | 'wide';
const ContentWidthContext = createContext<(w: ContentWidth) => void>(() => {});

/** เรียกในคอมโพเนนต์ที่ต้องการให้พื้นที่เนื้อหากว้างเต็มจอ (คืนค่าเป็น default เมื่อ unmount) */
export function useWideContent() {
  const setContentWidth = useContext(ContentWidthContext);
  useEffect(() => {
    setContentWidth('wide');
    return () => setContentWidth('default');
  }, [setContentWidth]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [contentWidth, setContentWidth] = useState<ContentWidth>('default');
  const { ready, currentUser, userSwitchSeq } = useDemo();
  const pathname = usePathname();
  const router = useRouter();
  /** พอร์ทัลหัวหน้าทัวร์ (มือถือ) — ใช้ chrome ของตัวเอง ไม่ใช่ Sidebar/Header ฝั่งผู้จัด */
  const isGuidePortal = pathname === '/guide' || pathname.startsWith('/guide/');
  /** พอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป (มือถือ) — รับซองเงินจากการเงินแล้วส่งต่อหัวหน้าทัวร์ */
  const isStaffPortal = pathname === '/staff' || pathname.startsWith('/staff/');

  /*
    กั้นการเข้าถึงหน้าตามบทบาท — ใช้ชุดสิทธิ์เดียวกับเมนู

    ซ่อนเมนูอย่างเดียวไม่พอ เพราะเข้าถึงได้อีกสองทาง
      • พิมพ์ URL ตรง
      • สลับบทบาทขณะเปิดหน้านั้นค้างอยู่ (หน้าไม่เปลี่ยนตาม ทั้งที่สิทธิ์เปลี่ยนแล้ว)
    กั้นที่นี่จุดเดียวจึงครอบคลุมทุกหน้าโดยไม่ต้องไปใส่การ์ดทีละหน้า
  */
  const allowed = canViewPath(currentUser.role, pathname);

  /*
    สลับบทบาท → กลับไปเมนูแรกของบทบาทใหม่เสมอ

    เปลี่ยนบทบาทคือเปลี่ยนบริบทการทำงานทั้งชุด เริ่มที่หน้าแรกของบทบาทนั้นจึงตรงกับที่ผู้ใช้คาด
    (ถ้าปล่อยค้างที่ URL เดิม เมนูที่หายไปจากรายการจะทำให้ไม่มีเมนูไหนถูกไฮไลต์
     ดูเหมือนเมนู "ค้างอยู่ที่เดิม" และต้องเดาเองว่าต้องกดอะไรต่อ)

    ทำเฉพาะตอน "ผู้ใช้กดสลับ แล้วบทบาทเปลี่ยน" เท่านั้น — พิมพ์ URL ตรงเข้าหน้าที่ไม่มีสิทธิ์ยังคงเห็นคำอธิบาย
    เพราะเด้งออกเงียบ ๆ จะงงกว่าว่าทำไมพาไปหน้าอื่น
    การคืนผู้ใช้ที่จำไว้ตอนรีเฟรช (userSwitchSeq ไม่เปลี่ยน) ไม่นับ — รีเฟรชแล้วต้องอยู่หน้าเดิม ไม่เด้งกลับหน้าแรก
  */
  const lastRole = useRef(currentUser.role);
  const lastSwitch = useRef(userSwitchSeq);
  useEffect(() => {
    if (lastRole.current === currentUser.role) return;
    lastRole.current = currentUser.role;
    const switched = lastSwitch.current !== userSwitchSeq;
    lastSwitch.current = userSwitchSeq;
    if (!switched) return; // คืนผู้ใช้ที่จำไว้ตอนรีเฟรช — อยู่หน้าเดิม
    router.replace(landingPathForRole(currentUser.role));
  }, [currentUser.role, userSwitchSeq, router]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  if (isStaffPortal) {
    return (
      <>
        <StaffShell>{!ready ? <PageLoading /> : children}</StaffShell>
        <ToastContainer />
      </>
    );
  }

  if (isGuidePortal) {
    return (
      <>
        <GuideShell>{!ready ? <PageLoading /> : children}</GuideShell>
        <ToastContainer />
      </>
    );
  }

  return (
    <ContentWidthContext.Provider value={setContentWidth}>
      <div className="zego-app">
        <div className="zego-aurora" aria-hidden="true">
          <div className="zego-aurora__orb zego-aurora__orb--emerald" />
          <div className="zego-aurora__orb zego-aurora__orb--gold" />
          <div className="zego-aurora__orb zego-aurora__orb--bronze" />
          <div className="zego-aurora__orb zego-aurora__orb--pearl" />
        </div>

        <Sidebar mobileOpen={menuOpen} onCloseMobile={() => setMenuOpen(false)} />

        <div className="zego-workspace">
          <Header onOpenMenu={() => setMenuOpen(true)} />


          <main className={cx('zego-main', contentWidth === 'wide' && 'app-main--wide')}>
            {!ready ? <PageLoading /> : allowed ? children : <AccessDenied />}
          </main>

          <footer className="zego-divider-top zego-text-tertiary px-4 py-3 text-center text-xs sm:px-6">
            ระบบจัดการหัวหน้าทัวร์ — เวอร์ชันต้นแบบ (Demo) · ไม่มีการเชื่อมต่อฐานข้อมูล ระบบบัญชี หรือการจ่ายเงินจริง
          </footer>
        </div>
      </div>

      <ToastContainer />
    </ContentWidthContext.Provider>
  );
}

/**
 * หน้าที่บทบาทปัจจุบันไม่มีสิทธิ์เข้าถึง
 * บอกให้ชัดว่าทำไมถึงเข้าไม่ได้ และพาไปหน้าที่เปิดได้ แทนการเด้งออกเงียบ ๆ จนงงว่ากดอะไรผิด
 */
function AccessDenied() {
  const router = useRouter();
  const { currentUser } = useDemo();
  const home = landingPathForRole(currentUser.role);

  return (
    <div className="zego-card-surface zego-card-pad">
      <EmptyState
        icon="warning"
        title="หน้านี้ไม่เปิดให้บทบาทของคุณ"
        description={`บทบาท "${ROLE[currentUser.role].label}" ${ROLE_SCOPE[currentUser.role]}`}
        action={<Button variant="primary" size="sm" onClick={() => router.push(home)}>ไปหน้าที่เข้าถึงได้</Button>}
      />
    </div>
  );
}
