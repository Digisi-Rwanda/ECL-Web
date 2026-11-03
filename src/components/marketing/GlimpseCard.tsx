export function GlimpseCard() {
  const matrix = [
    { label: "Stage 1", values: ["94.2%", "5.1%", "0.7%"] },
    { label: "Stage 2", values: ["12.4%", "82.3%", "5.3%"] },
    { label: "Stage 3", values: ["3.1%", "8.6%", "88.3%"] },
  ];

  const cellBg = (val: string) => {
    const n = parseFloat(val);
    if (n >= 80) return "rgba(43,182,201,0.18)";
    if (n >= 20) return "rgba(43,182,201,0.08)";
    return "transparent";
  };

  return (
    <div
      className="rounded-xl p-[18px] shadow-[0_30px_60px_rgba(0,0,0,0.45)]"
      style={{ background: "#14162A", border: "1px solid #262A45" }}
    >
      {/* Status bar */}
      <div
        className="flex items-center justify-between pb-3.5 mb-3.5"
        style={{ borderBottom: "1px solid #262A45" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="size-2 rounded-full"
            style={{ background: "#43C281" }}
          />
          <span
            className="text-xs"
            style={{ color: "#9A9DBA", fontFamily: "var(--font-mono)" }}
          >
            Run c81a…77fe
          </span>
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded"
          style={{
            background: "rgba(43,182,201,0.12)",
            color: "#4FD4E6",
            fontFamily: "var(--font-mono)",
          }}
        >
          engine v1.3.0
        </span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-2.5 mb-3.5">
        {[
          { k: "Total ECL", v: "48.2M", cur: "KES" },
          { k: "Coverage ratio", v: "3.4", cur: "%" },
        ].map((kpi) => (
          <div
            key={kpi.k}
            className="rounded-md p-3"
            style={{ background: "#0E0F22", border: "1px solid #262A45" }}
          >
            <p className="text-[11px] mb-1" style={{ color: "#9A9DBA" }}>
              {kpi.k}
            </p>
            <p
              className="text-[1.2rem] font-medium"
              style={{ color: "#fff", fontFamily: "var(--font-mono)" }}
            >
              <span className="text-[0.65rem] mr-1" style={{ color: "#686C8E" }}>
                {kpi.cur}
              </span>
              {kpi.v}
            </p>
          </div>
        ))}
      </div>

      {/* Transition matrix */}
      <table className="w-full border-collapse" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
        <thead>
          <tr>
            <th className="p-1.5 text-left" style={{ color: "#686C8E", fontWeight: 500, border: "1px solid #262A45" }}>
              From ↓ To →
            </th>
            {["S1", "S2", "S3"].map((h) => (
              <th
                key={h}
                className="p-1.5 text-center"
                style={{ color: "#686C8E", fontWeight: 500, border: "1px solid #262A45" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row) => (
            <tr key={row.label}>
              <td
                className="p-1.5 text-left"
                style={{ color: "#9A9DBA", border: "1px solid #262A45" }}
              >
                {row.label}
              </td>
              {row.values.map((val, ci) => (
                <td
                  key={ci}
                  className="p-1.5 text-center"
                  style={{
                    color: "#C9CBE0",
                    border: "1px solid #262A45",
                    background: cellBg(val),
                  }}
                >
                  {val}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
