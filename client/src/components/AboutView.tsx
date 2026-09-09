export function AboutView() {
  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-title">Invoice Information</div>
        <div className="notes-grid">
          <div>
            <strong>Invoice format</strong>
            <span>{`{PREFIX}-{YYMM}-{NNNN}`}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
