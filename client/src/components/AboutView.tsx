export function AboutView() {
  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-title">System Notes</div>
        <div className="notes-grid">
          <div>
            <strong>Invoice format</strong>
            <span>{`{PREFIX}-{YYMM}-{NNNN}`}</span>
          </div>
          <div>
            <strong>Storage</strong>
            <span>
              MongoDB collections for invoices, settings, and counters.
            </span>
          </div>
          <div>
            <strong>PDF</strong>
            <span>Generated in-browser from saved invoice data.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
