import * as react_jsx_runtime from 'react/jsx-runtime';
import { a as PermissionManager } from '../PermissionManager--3wybVk2.js';
import { P as ProctorShieldClient, S as SdkSessionInitResponse } from '../ProctorShieldClient-DAMa3Xag.js';
import { P as ProctorChatClient } from '../ProctorChatClient-BaqzF393.js';

interface ExamWindowBranding {
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
    organization_name?: string;
    logo_url?: string;
    candidate_welcome_message?: string;
}
interface ExamWindowProps {
    apiKey: string;
    baseUrl: string;
    /** URL of the exam content to embed in an iframe. Optional — pass children instead. */
    examUrl?: string;
    /** Optional UUID of an exam already created in the tenant admin */
    examId?: string;
    /** Optional UUID of the candidate row */
    candidateId?: string;
    /** External reference; surfaced in event payloads & reports */
    externalRef?: string;
    /** Override branding if you fetch it elsewhere. Otherwise it's loaded from /v1/sdk/branding */
    branding?: ExamWindowBranding;
    /** Skip screen capture permission (e.g. coding exams) */
    disableScreenRecording?: boolean;
    /** ms between face checks; default 10000 */
    faceCheckIntervalMs?: number;
    /** Called when session ends */
    onSessionEnd?: (sessionId: string) => void;
    /** Optional children rendered inside the exam area instead of the iframe */
    children?: React.ReactNode;
}
declare function ExamWindow(props: ExamWindowProps): react_jsx_runtime.JSX.Element;

interface PermissionGateProps {
    manager: PermissionManager;
    /** Set to false if you don't need screen capture (e.g. coding exams) */
    requireScreen?: boolean;
    brandPrimary?: string;
    onAllReady: (s: {
        camMicStream: MediaStream;
        screenStream: MediaStream | null;
    }) => void;
}
declare function PermissionGate(props: PermissionGateProps): react_jsx_runtime.JSX.Element;

interface SystemCheckResult {
    webcam: boolean;
    microphone: boolean;
    screen_resolution_ok: boolean;
    browser_compatible: boolean;
    network_ok: boolean;
    rtt_ms: number | null;
    user_agent: string;
    screen: {
        width: number;
        height: number;
    };
    external_monitor_warning: boolean;
}
interface SystemCheckRunnerProps {
    camMicStream: MediaStream | null;
    /** URL to probe latency against; pass your API base */
    probeUrl?: string;
    brandPrimary?: string;
    onComplete: (r: SystemCheckResult) => void;
}
declare function SystemCheckRunner(props: SystemCheckRunnerProps): react_jsx_runtime.JSX.Element;

interface IdentityVerificationProps {
    client: ProctorShieldClient;
    sessionId: string;
    /** Camera stream from the permission gate */
    cameraStream: MediaStream | null;
    brandPrimary?: string;
    onDone: (info: {
        image_base64: string;
    }) => void;
}
declare function IdentityVerification(props: IdentityVerificationProps): react_jsx_runtime.JSX.Element;

interface FloatingCameraWindowProps {
    stream: MediaStream | null;
    /** Hide camera while keeping it active */
    collapsed?: boolean;
    onCollapseChange?: (collapsed: boolean) => void;
    /** Indicator label shown next to REC dot */
    statusLabel?: string;
    /** Show a red REC dot */
    recording?: boolean;
    /** Optional override for initial position */
    initial?: {
        x: number;
        y: number;
    };
    /** Optional override for default size */
    size?: {
        width: number;
        height: number;
    };
    /** Branding color, used as accent for the chrome */
    accentColor?: string;
}
/**
 * Draggable, always-on-top camera PiP. Stays visible while the candidate
 * navigates the exam content. Uses position: fixed so it floats above iframes.
 */
declare function FloatingCameraWindow(props: FloatingCameraWindowProps): react_jsx_runtime.JSX.Element;

interface ProctoringIndicatorProps {
    recording: boolean;
    sessionId?: string | null;
    violations: number;
    online: boolean;
    brandPrimary?: string;
    paused?: boolean;
}
declare function ProctoringIndicator(props: ProctoringIndicatorProps): react_jsx_runtime.JSX.Element;

interface ProctorChatPanelProps {
    client: ProctorShieldClient;
    sessionId: string;
    chatWs: ProctorChatClient | null;
    brandPrimary?: string;
    collapsed?: boolean;
    onCollapseChange?: (c: boolean) => void;
    /** 'candidate' (default, uses /v1/sdk/...) or 'proctor' (uses /v1/sessions/.../chat) */
    role?: 'candidate' | 'proctor';
}
declare function ProctorChatPanel(props: ProctorChatPanelProps): react_jsx_runtime.JSX.Element;

declare function ViolationAlert(props: {
    violations: string[];
}): react_jsx_runtime.JSX.Element | null;

declare function ProctoringTimer(props: {
    startedAt: number;
}): react_jsx_runtime.JSX.Element;

declare function useProctoringSession(apiKey: string, baseUrl: string): {
    sessionId: string | null;
    error: string | null;
    client: ProctorShieldClient;
    init: (body?: Record<string, unknown>) => Promise<SdkSessionInitResponse>;
};

declare function useSystemCheck(client: ProctorShieldClient, sessionId: string | null): {
    result: unknown;
    submit: (checks: Record<string, unknown>) => Promise<unknown>;
};

export { ExamWindow, type ExamWindowBranding, type ExamWindowProps, FloatingCameraWindow, type FloatingCameraWindowProps, IdentityVerification, PermissionGate, ProctorChatPanel, ProctoringIndicator, ProctoringTimer, type SystemCheckResult, SystemCheckRunner, ViolationAlert, useProctoringSession, useSystemCheck };
