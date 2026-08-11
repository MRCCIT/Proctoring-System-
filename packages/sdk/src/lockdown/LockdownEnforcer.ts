import { KeyboardInterceptor } from './KeyboardInterceptor';
import { VisibilityMonitor } from './VisibilityMonitor';
import { ScreenCaptureBlocker } from './ScreenCaptureBlocker';
import { WindowFocusMonitor } from './WindowFocusMonitor';

export type ViolationReason =
  | 'blocked_shortcut'
  | 'tab_hidden'
  | 'tab_visible'
  | 'context_menu'
  | 'copy_attempt'
  | 'paste_attempt'
  | 'cut_attempt'
  | 'window_blur'
  | 'window_focus'
  | 'fullscreen_exit'
  | 'multiple_displays_detected'
  | 'single_display_detected';

export interface LockdownOptions {
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
export class LockdownEnforcer {
  private keyboard = new KeyboardInterceptor();
  private visibility = new VisibilityMonitor();
  private windowFocus = new WindowFocusMonitor();
  private capture = new ScreenCaptureBlocker();
  private releaseCapture: (() => void) | null = null;
  private displayCheckTimer: ReturnType<typeof setInterval> | null = null;
  private lastMultiDisplay: boolean | null = null;
  private listeners: Array<() => void> = [];
  private onViolation: ((r: ViolationReason) => void) | null = null;

  start(onViolation?: (r: ViolationReason) => void, opts: LockdownOptions = {}) {
    const merged: Required<LockdownOptions> = {
      blockContextMenu: opts.blockContextMenu ?? true,
      blockCopyPaste: opts.blockCopyPaste ?? true,
      blockSelection: opts.blockSelection ?? false,
      blockScreenCapture: opts.blockScreenCapture ?? true,
      forceFullscreen: opts.forceFullscreen ?? false,
    };
    this.onViolation = onViolation ?? null;

    this.keyboard.start(() => this.fire('blocked_shortcut'));
    this.visibility.start((hidden) => this.fire(hidden ? 'tab_hidden' : 'tab_visible'));
    this.windowFocus.start((focused) => this.fire(focused ? 'window_focus' : 'window_blur'));

    // `screen.isExtended` is currently the browser signal available for this
    // purpose. Check it throughout the exam so reconnecting a display is seen.
    const checkDisplays = () => {
      let multipleDisplays = false;
      try {
        multipleDisplays = Boolean(
          (window.screen as Screen & { isExtended?: boolean }).isExtended,
        );
      } catch {
        // The property is unsupported in some browsers; leave the result false.
      }

      if (multipleDisplays !== this.lastMultiDisplay) {
        this.lastMultiDisplay = multipleDisplays;
        this.fire(multipleDisplays ? 'multiple_displays_detected' : 'single_display_detected');
      }
    };
    checkDisplays();
    this.displayCheckTimer = setInterval(checkDisplays, 30_000);

    if (merged.blockContextMenu) {
      const h = (e: MouseEvent) => {
        e.preventDefault();
        this.fire('context_menu');
      };
      window.addEventListener('contextmenu', h, true);
      this.listeners.push(() => window.removeEventListener('contextmenu', h, true));
    }

    if (merged.blockCopyPaste) {
      const blocked = (kind: ViolationReason) => (e: ClipboardEvent) => {
        e.preventDefault();
        this.fire(kind);
      };
      const copy = blocked('copy_attempt');
      const paste = blocked('paste_attempt');
      const cut = blocked('cut_attempt');
      document.addEventListener('copy', copy, true);
      document.addEventListener('paste', paste, true);
      document.addEventListener('cut', cut, true);
      this.listeners.push(() => {
        document.removeEventListener('copy', copy, true);
        document.removeEventListener('paste', paste, true);
        document.removeEventListener('cut', cut, true);
      });
    }

    if (merged.blockSelection) {
      const original = document.body.style.userSelect;
      document.body.style.userSelect = 'none';
      this.listeners.push(() => {
        document.body.style.userSelect = original;
      });
    }

    const fsChange = () => {
      if (!document.fullscreenElement) this.fire('fullscreen_exit');
    };
    document.addEventListener('fullscreenchange', fsChange);
    this.listeners.push(() => document.removeEventListener('fullscreenchange', fsChange));

    if (merged.blockScreenCapture) {
      this.releaseCapture = this.capture.attach();
    }

    if (merged.forceFullscreen) {
      try {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } catch {
        /* ignore */
      }
    }
  }

  private fire(r: ViolationReason) {
    this.onViolation?.(r);
  }

  stop() {
    this.keyboard.stop();
    this.visibility.stop();
    this.windowFocus.stop();
    this.releaseCapture?.();
    this.releaseCapture = null;
    if (this.displayCheckTimer) clearInterval(this.displayCheckTimer);
    this.displayCheckTimer = null;
    this.lastMultiDisplay = null;
    while (this.listeners.length) this.listeners.pop()?.();
    this.onViolation = null;
  }
}
