/**
 * Optional secure-browser / Electron kiosk bridge.
 * Stub only — real SEB Browser Exam Key validation happens server-side.
 */

export interface KioskDisplayInfo {
  screenCount: number;
  isPrimaryFullscreen: boolean;
}

export interface KioskAttestation {
  kind: 'seb' | 'electron' | 'unknown';
  configKeyHash?: string;
  browserExamKeyHash?: string;
  appVersion?: string;
}

export interface KioskBridge {
  getAttestation(): Promise<KioskAttestation | null>;
  getDisplayInfo(): Promise<KioskDisplayInfo | null>;
  requestAlwaysOnTop?(enabled: boolean): Promise<void>;
}

declare global {
  interface Window {
    __PROCTORSHIELD_KIOSK__?: KioskBridge;
    SafeExamBrowser?: { security?: { configKey?: string } };
  }
}

export function getKioskBridge(): KioskBridge | null {
  if (typeof window === 'undefined') return null;
  return window.__PROCTORSHIELD_KIOSK__ || null;
}

export function looksLikeSafeExamBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /SEB|SafeExamBrowser/i.test(ua) || Boolean(typeof window !== 'undefined' && window.SafeExamBrowser);
}
