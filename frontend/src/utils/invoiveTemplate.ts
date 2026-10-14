import logo from "../assets/img/Logo.svg";

const BUSINESS = {
  name: "SUPER  AGRO SOLUTIONS",
  lines: ["P.o Box 173, Mpeketoni", "Tel: 0700496690"],
  logo,
};
const ACCENT = "#E41F07";

export const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";

const esc = (v: any) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const amt = (n: any) =>
  Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const INVOICE_CSS = `
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.45;
         color: #1f2937; background: #fff;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
          padding-bottom: 14px; border-bottom: 3px solid ${ACCENT}; }
  .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .brand img { display: block; max-width: 100px; max-height: 50px; width: auto; height: auto; object-fit: contain; flex-shrink: 0; }
  .brand h1 { margin: 0 0 3px; font-size: 17px; letter-spacing: .3px; }
  .brand p { margin: 1px 0; color: #6b7280; font-size: 11px; }
  .title { text-align: right; flex-shrink: 0; }
  .title h2 { margin: 0; font-size: 28px; letter-spacing: 2px; color: ${ACCENT}; }
  .title div { color: #6b7280; font-size: 11px; margin-top: 4px; }
  .meta { display: flex; justify-content: space-between; gap: 30px; margin: 22px 0; }
  .bill { flex: 1; }
  .lbl { color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: .8px; margin-bottom: 4px; }
  .bill .nm { font-size: 14px; font-weight: 700; margin-bottom: 3px; }
  .bill p { margin: 2px 0; color: #4b5563; }
  .doc { width: 240px; }
  .doc div { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #e5e7eb; }
  .doc span:first-child { color: #6b7280; }
  .doc span:last-child { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  thead th { background: ${ACCENT} !important; color: #fff !important; text-align: left; font-size: 10px;
             text-transform: uppercase; letter-spacing: .6px; padding: 9px 10px; }
  th.r, td.r { text-align: right; }
  tbody td { padding: 9px 10px; vertical-align: top; border-bottom: 1px solid #e5e7eb; overflow-wrap: anywhere; }
  tbody tr:nth-child(even) { background: #f9fafb; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .nm2 { font-weight: 600; }
  .cat { color: #9ca3af; font-size: 10px; margin-top: 2px; }
  .note { margin-top: 10px; color: #9ca3af; font-size: 10px; }
  .totals { margin: 16px 0 0 auto; width: 270px; max-width: 100%; break-inside: avoid; page-break-inside: avoid; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 0; }
  .totals .grand { border-top: 2px solid #111; margin-top: 4px; padding-top: 8px; font-size: 14px; font-weight: 700; }
  .totals .due { background: ${ACCENT} !important; color: #fff !important; font-weight: 700; font-size: 13px;
                 padding: 9px 10px; margin-top: 8px; border-radius: 4px; }
  .extra { margin-top: 22px; font-size: 11px; color: #4b5563; white-space: pre-wrap; break-inside: avoid; }
  .sign { display: flex; gap: 40px; margin-top: 50px; break-inside: avoid; page-break-inside: avoid; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center; font-size: 11px; color: #4b5563; }
  .foot { margin-top: 30px; text-align: center; color: #9ca3af; font-size: 10px; border-top: 1px solid #e5e7eb; padding-top: 10px; }
`;

export function buildInvoiceHtml(inv: any) {
  const isPurchase = inv.invoice_type === "purchase";
  const party = {
    name: inv.billed_to_name || inv.customer_name || inv.supplier_name || "",
    lines: [inv.billed_to_address, inv.billed_to_phone, inv.billed_to_email].filter(Boolean),
  };
  const docNo = isPurchase
    ? (inv.extra_data?.supplier_invoice_no || inv.extra_data?.supplier_ref || inv.invoice_number)
    : inv.invoice_number;

  const items: any[] = inv.items?.length
    ? inv.items
    : [{ description: "Invoice amount", category: "", quantity: 1, unit_price: inv.subtotal, tax_amount: inv.tax_amount,
         line_total: Number(inv.subtotal || 0) + Number(inv.tax_amount || 0) }];

  const rows = items.map(i => `
    <tr>
      <td><div class="nm2">${esc(i.description)}</div>${i.category ? `<div class="cat">${esc(i.category)}</div>` : ""}</td>
      <td class="r">${esc(Number(i.quantity).toLocaleString("en-KE", { maximumFractionDigits: 2 }))}</td>
      <td class="r">${amt(i.unit_price)}</td>
      <td class="r">${amt(i.tax_amount)}</td>
      <td class="r">${amt(i.line_total)}</td>
    </tr>`).join("");

  const logoSrc = BUSINESS.logo.startsWith("data:") ? BUSINESS.logo : window.location.origin + BUSINESS.logo;
  const prevBal = isPurchase ? Number(inv.previous_balance || 0) : 0;

  const html = `
<html><head><title>Invoice ${esc(docNo)}</title><style>${INVOICE_CSS}</style></head>
<body>
  <div class="head">
    <div class="brand">
      ${BUSINESS.logo ? `<img src="${logoSrc}" alt="Company Logo" />` : ""}
      <div><h1>${esc(BUSINESS.name)}</h1>${BUSINESS.lines.map(l => `<p>${esc(l)}</p>`).join("")}</div>
    </div>
    <div class="title"><h2>${inv.invoice_type === "credit" ? "CREDIT INVOICE" : "INVOICE"}</h2><div>No. ${esc(docNo)}</div></div>
  </div>

  <div class="meta">
    <div class="bill">
      <div class="lbl">${isPurchase ? "Supplier" : "Bill To"}</div>
      <div class="nm">${esc(party.name || "—")}</div>
      ${party.lines.map(l => `<p>${esc(l)}</p>`).join("")}
    </div>
    <div class="doc">
      <div><span>Invoice no.</span><span>${esc(docNo)}</span></div>
      <div><span>Issue date</span><span>${esc(fmtDate(inv.issue_date))}</span></div>
      <div><span>Due date</span><span>${inv.due_date ? esc(fmtDate(inv.due_date)) : "&mdash;"}</span></div>
      <div><span>Currency</span><span>KES</span></div>
    </div>
  </div>

  <table>
    <thead><tr><th>Item / Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Tax</th><th class="r">Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="note">All amounts in KES. Tax shown separately for reference.</div>

  <div class="totals">
    <div><span>Subtotal</span><span>${amt(inv.subtotal)}</span></div>
    ${Number(inv.discount_amount) > 0 ? `<div><span>Discount</span><span>-${amt(inv.discount_amount)}</span></div>` : ""}
    <div><span>Tax</span><span>${amt(inv.tax_amount)}</span></div>
    <div class="grand"><span>Total</span><span>${amt(inv.total_amount)}</span></div>
    <div><span>Paid</span><span>${amt(inv.amount_paid)}</span></div>
    <div class="due"><span>Balance due</span><span>${amt(inv.balance_due)}</span></div>
    ${prevBal > 0 ? `
    <div><span>Previous balance (unpaid)</span><span>${amt(prevBal)}</span></div>
    <div class="grand"><span>Total outstanding</span><span>${amt(Number(inv.balance_due || 0) + prevBal)}</span></div>` : ""}
  </div>

  ${inv.notes ? `<div class="extra"><strong>Notes</strong>\n${esc(inv.notes)}</div>` : ""}
  ${inv.terms ? `<div class="extra"><strong>Terms</strong>\n${esc(inv.terms)}</div>` : ""}

  <div class="sign"><div>Received by</div></div>
  <div class="foot">Thank you for your business.</div>
</body></html>`;
  return { html, docNo };
}

export function printInvoice(inv: any) {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) { alert("Allow popups to print the invoice."); return; }
  win.document.write(buildInvoiceHtml(inv).html);
  win.document.close();
  setTimeout(() => {
    try { win.focus(); win.print(); }
    catch (err) { console.error("Print failed:", err); }
    finally { setTimeout(() => win.close(), 500); }
  }, 300);
}