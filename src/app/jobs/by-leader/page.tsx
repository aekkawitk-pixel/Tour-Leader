'use client';

/** เดิม "ดูตามหัวหน้าทัวร์" — ถูกแทนที่ด้วย Flow เลือกหัวหน้าทัวร์ก่อนที่ /jobs → redirect */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function JobsByLeaderRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/jobs');
  }, [router]);
  return null;
}
