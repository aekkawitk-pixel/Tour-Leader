import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * ภาพรวมหัวหน้าทัวร์ย้ายจากใต้เมนู "หัวหน้าทัวร์" มาเป็นเมนู "ภาพรวม" (/) แล้ว
   * คงลิงก์เดิมให้ใช้ได้ — ลิงก์ที่เคยส่ง/บุ๊กมาร์กไว้จะได้ไม่พัง
   * permanent: false (307) เผื่อโครงเมนูเปลี่ยนอีก เบราว์เซอร์จะได้ไม่จำถาวร
   */
  async redirects() {
    return [{ source: '/leaders/overview', destination: '/', permanent: false }];
  },
};

export default nextConfig;
