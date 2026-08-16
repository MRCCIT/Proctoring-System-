type ViolationReason = 'blocked_shortcut' | 'tab_hidden' | 'tab_visible' | 'context_menu' | 'copy_attempt' | 'paste_attempt' | 'cut_attempt' | 'window_blur' | 'window_focus' | 'fullscreen_exit' | 'multiple_displays_detected' | 'single_display_detected';
interface LockdownOptions {
    blockContextMenu?: boolean;
    blockCopyPaste?: boolean;
    blockSelection?: boolean;
    blockScreenCapture?: boolean;
    /** Try to enter fullscreen; default false (browsers require gesture) */
    forceFullscreen?: boolean;
}
/**
 * One-stop secure environment for exams:
 * - keyboard shortcut blocking (cmd/ctrl + c/v/a/p/s, F12, etc.)
 * - tab visibility + window blur monitoring
 * - context menu + copy/paste/cut suppression
 * - text selection suppression
 * - screen capture API suppression
 * - fullscreen exit detection
 */
declare class LockdownEnforcer {
    private keyboard;
    private visibility;
    private windowFocus;
    private capture;
    private releaseCapture;
    private displayCheckTimer;
    private lastMultiDisplay;
    private listeners;
    private onViolation;
    start(onViolation?: (r: ViolationReason) => void, opts?: LockdownOptions): void;
    private fire;
    stop(): void;
}

declare class KeyboardInterceptor {
    private handler;
    start(onBlocked: () => void): void;
    stop(): void;
}

declare class VisibilityMonitor {
    private handler;
    start(onChange: (hidden: boolean) => void): void;
    stop(): void;
}

declare class WindowFocusMonitor {
    private blurHandler;
    private focusHandler;
    start(onChange: (focused: boolean) => void): void;
    stop(): void;
}

/** Best-effort: discourage screen capture APIs in supported browsers */
declare class ScreenCaptureBlocker {
    attach(): () => void;
}

/** Placeholder — real detection requires native agent or extension */
declare class ExternalAppDetector {
    scan(): Promise<{
        suspicious: boolean;
        details: string[];
    }>;
}

interface NetworkSnapshot {
    online: boolean;
    rtt_ms: number | null;
    downlink_mbps: number | null;
    effective_type: string | null;
    ts: number;
}
/**
 * Periodically measures connectivity. Reports offline transitions and bad
 * connections. Uses Network Information API where supported and a
 * lightweight HEAD fetch fallback so latency can be sampled in Safari/Firefox.
 */
declare class NetworkMonitor {
    private timer;
    private listeners;
    private lastOnline;
    start(intervalMs?: number, probeUrl?: string): void;
    on(fn: (s: NetworkSnapshot) => void): () => boolean;
    private emit;
    private probe;
    stop(): void;
}

interface KeystrokeAnomaly {
    reason: 'paste_burst' | 'high_velocity' | 'long_pause' | 'auto_input';
    details?: Record<string, unknown>;
}
/**
 * Watches keyboard cadence on the exam page. Doesn't capture content
 * (privacy-friendly) — only timing patterns. Reports anomalies via callback.
 */
declare class KeystrokeAnalyzer {
    private times;
    private onAnomaly;
    private kdHandler;
    private pasteHandler;
    private lastReport;
    start(onAnomaly: (a: KeystrokeAnomaly) => void): void;
    private onKey;
    private onPaste;
    stop(): void;
}

export { ExternalAppDetector, KeyboardInterceptor, KeystrokeAnalyzer, type KeystrokeAnomaly, LockdownEnforcer, type LockdownOptions, NetworkMonitor, type NetworkSnapshot, ScreenCaptureBlocker, type ViolationReason, VisibilityMonitor, WindowFocusMonitor };
