'use client';

/**
 * Error Boundary — ครอบพื้นที่เนื้อหา (เช่น เนื้อหาในแต่ละแท็บ) เพื่อไม่ให้เกิด "หน้าว่าง"
 * เมื่อ Component ภายในเรนเดอร์ล้มเหลว (ข้อมูลรูปแบบไม่คาดคิด, ChunkLoadError ฯลฯ)
 *
 * แสดง Error State พร้อมปุ่ม "ลองใหม่" แทนพื้นที่ว่าง · Header และแถบ Tab ที่อยู่นอก Boundary ไม่หาย
 * • เปลี่ยนค่า `resetKey` (เช่น key ของแท็บที่เปิดอยู่) → รีเซ็ตสถานะ error อัตโนมัติเมื่อสลับแท็บ
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Card } from './Primitives';
import { Icon } from './Icon';

interface Props {
  children: ReactNode;
  /** เปลี่ยนค่านี้เพื่อรีเซ็ต error (เช่น key ของแท็บปัจจุบัน) */
  resetKey?: string | number;
  /** ข้อความหัวข้อของ Error State */
  title?: string;
  /** เรียกเมื่อกด "ลองใหม่" (นอกเหนือจากการรีเซ็ต state ภายใน) */
  onRetry?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    // สลับแท็บ (resetKey เปลี่ยน) แล้วมี error ค้างอยู่ → ล้างเพื่อให้เนื้อหาใหม่เรนเดอร์ได้
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // บันทึกไว้ช่วย debug — ไม่ปิดบัง error
    console.error('[ErrorBoundary] เนื้อหาส่วนนี้เรนเดอร์ล้มเหลว:', error, info.componentStack);
  }

  private retry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isChunkError = /ChunkLoadError|Loading chunk|Failed to fetch dynamically/i.test(
      `${error.name} ${error.message}`,
    );

    return (
      <Card>
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
          <span className="zego-icon-well--danger flex h-12 w-12 items-center justify-center rounded-full">
            <Icon name="warning" className="h-6 w-6" />
          </span>
          <div className="space-y-1">
            <p className="zego-text text-sm font-semibold">
              {this.props.title ?? 'ไม่สามารถแสดงเนื้อหาส่วนนี้ได้'}
            </p>
            <p className="zego-text-secondary max-w-md text-xs">
              {isChunkError
                ? 'โหลดไฟล์ของหน้านี้ไม่สำเร็จ (อาจมีการอัปเดตเวอร์ชันใหม่) — กด “ลองใหม่” หรือรีเฟรชหน้า'
                : 'เกิดข้อผิดพลาดขณะแสดงข้อมูล — Header และแถบแท็บยังใช้งานได้ กด “ลองใหม่” เพื่อโหลดส่วนนี้อีกครั้ง'}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" size="sm" onClick={this.retry}>
              ลองใหม่
            </Button>
            {isChunkError && (
              <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
                รีเฟรชหน้า
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  }
}
