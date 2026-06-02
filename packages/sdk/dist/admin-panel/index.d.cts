import * as react_jsx_runtime from 'react/jsx-runtime';
import { P as ProctorShieldClient } from '../ProctorShieldClient-DAMa3Xag.cjs';

declare function AdminDashboard(): react_jsx_runtime.JSX.Element;

declare function LiveMonitoring(props: {
    client: ProctorShieldClient;
}): react_jsx_runtime.JSX.Element;

interface ProctorLiveViewProps {
    client: ProctorShieldClient;
    /** Tenant admin JWT (used to authenticate WS as a proctor) */
    bearerToken: string;
    sessionId: string;
    /** Base API URL (used to build wss:// URL); defaults to client.options.baseUrl */
    baseUrl?: string;
    brandPrimary?: string;
    /** Optional: latest known snapshot URL or thumbnail */
    snapshotUrl?: string;
}
/**
 * Live proctor side panel: chat with the candidate, see their latest face-check
 * results, last snapshot, and trigger pause / extend / terminate from one place.
 */
declare function ProctorLiveView(props: ProctorLiveViewProps): react_jsx_runtime.JSX.Element;

export { AdminDashboard, LiveMonitoring, ProctorLiveView, type ProctorLiveViewProps };
