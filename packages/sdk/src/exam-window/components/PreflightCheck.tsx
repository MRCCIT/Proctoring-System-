'use client';

export function PreflightCheck(props: { onReady: () => void | Promise<void> }) {
  return (
    <section>
      <h2>System check</h2>
      <ul>
        <li>Webcam & microphone</li>
        <li>Network stability</li>
        <li>Browser compatibility</li>
      </ul>
      <button type="button" onClick={() => void props.onReady()}>
        Continue
      </button>
    </section>
  );
}
