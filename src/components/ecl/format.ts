const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtMoney = (v: number | null | undefined) => (v == null ? "—" : money.format(v));
export const fmtPct = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;
export const fmtNum = (v: number | null | undefined, digits = 6) => (v == null ? "—" : v.toFixed(digits));
export const fmtInt = (v: number) => v.toLocaleString("en-US");
