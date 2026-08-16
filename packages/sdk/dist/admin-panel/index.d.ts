import * as react_jsx_runtime from 'react/jsx-runtime';
import { P as ProctorShieldClient } from '../ProctorShieldClient-B8list-d.js';

declare function AdminDashboard(): react_jsx_runtime.JSX.Element;

declare function LiveMonitoring(props: {
    client: ProctorShieldClient;
}): react_jsx_runtime.JSX.Element;

interface ProctorLiveViewProps {
    client: ProctorShieldClient;
    bearerToken: string;
    sessionId: string;
    baseUrl?: string;
    brandPrimary?: string;
}
declare function ProctorLiveView(props: ProctorLiveViewProps): react_jsx_runtime.JSX.Element;

export { AdminDashboard, LiveMonitoring, ProctorLiveView, type ProctorLiveViewProps };
