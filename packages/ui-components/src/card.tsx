export function Card(props: { title?: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 8,
        padding: 20,
        marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      {props.title && <h2 style={{ marginTop: 0, fontSize: 18 }}>{props.title}</h2>}
      {props.children}
    </section>
  );
}
