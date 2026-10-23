import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import API from "../../services/api";
import logo from "../../assets/img/Logo.svg";
import { printHtml } from "../../utils/printHtml";
import { useNavigate } from "react-router";
import SaleDetailOffcanvas from "../sales/SalesDetail";   

function fmtDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(v: any) {
  const n = Number(v ?? 0);
  return n.toLocaleString("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 2 });
}
const STATUSES = [
  { value: "draft",     label: "Draft" },
  { value: "issued",    label: "Issued" },
  { value: "partial",   label: "Partially Paid" },
  { value: "paid",      label: "Paid" },
  { value: "overdue",   label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];
const INVOICE_TYPES = [
 
  { value: "credit",   label: "Sales Invoice" },
];

type ExtraField = { key: string; label: string; type?: "text" | "date" | "number" | "textarea"; required?: boolean };
type TypeConfig = {
  saleField: "hidden" | "optional" | "required";
  partyTitle: string;
  detailsTitle: string;
  extra: ExtraField[];
};

const TYPE_CONFIG: Record<string, TypeConfig> = {
  supply: {
    saleField: "optional", partyTitle: "Billed To", detailsTitle: "Supply Details",
    extra: [
      { key: "delivery_note_no",  label: "Delivery Note #" },
      { key: "delivery_date",     label: "Delivery Date", type: "date" },
      { key: "delivery_location", label: "Delivery Location" },
    ],
  },
  credit: {
    saleField: "required", partyTitle: "Billed To", detailsTitle: "Credit Details",
    extra: [{ key: "credit_period_days", label: "Credit Period (days)", type: "number" }],
  },
  purchase: {
    saleField: "hidden", partyTitle: "Supplier", detailsTitle: "Purchase Details",
    extra: [
      { key: "supplier_invoice_no", label: "Supplier Invoice #", required: true },
      { key: "po_number",           label: "PO Number" },
    ],
  },
};
const TERMS_DAYS: Record<string, number> = { cash: 0, net_7: 7, net_14: 14, net_30: 30, net_60: 60 };
const addDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const COLUMNS = [
  { key: "invoice_number", label: "Invoice #" },
  { key: "invoice_type_display", label: "Type" },
  { key: "issue_date",     label: "Issued" },
  { key: "due_date",       label: "Due" },
  { key: "billed_to_name", label: "Billed To" },
  { key: "total_amount",   label: "Total" },
  { key: "balance_due",    label: "Balance" },
  { key: "status",         label: "Status" },
] as const;

type Mode = "add" | "edit" | "view";
type InvItem = { product: string; description: string; category: string; quantity: string; unit_price: string; tax_rate: string };

interface InvForm {
  invoice_type: string;
  sale: string;
  supplier: string;   // purchase invoices: id from the Supplier model
  supply: string;     // purchase invoices: id of the Supply whose items are billed
  issue_date: string;
  due_date: string;
  billed_to_name: string;
  billed_to_phone: string;
  billed_to_email: string;
  billed_to_address: string;
  subtotal: string;
  discount_amount: string;
  tax_amount: string;
  amount_paid: string;
  notes: string;
  terms: string;
  extra: Record<string, string>;
  items: InvItem[];
}

const emptyForm: InvForm = {
  invoice_type: "credit",
  sale: "",
  supplier: "",
  supply: "",
  issue_date: new Date().toISOString().slice(0, 10),
  due_date: "",
  billed_to_name: "",
  billed_to_phone: "",
  billed_to_email: "",
  billed_to_address: "",
  subtotal: "0",
  discount_amount: "0",
  tax_amount: "0",
  amount_paid: "0",
  notes: "",
  terms: "",
  extra: {},
  items: [],
};

function exportCSV(rows: any[]) {
  const headers = COLUMNS.map(c => c.label);
  const lines = [
    headers.join(","),
    
    ...rows.map(r => COLUMNS.map(c => `"${String(
  (c.key === "invoice_type_display" ? typeLabel(r) : r[c.key]) ?? ""
).replace(/"/g, '""')}"`).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sales_invoices_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function exportExcel(rows: any[]) {
  const headers = COLUMNS.map(c => c.label);
 const data = [headers, ...rows.map(r => COLUMNS.map(c =>
  String((c.key === "invoice_type_display" ? typeLabel(r) : r[c.key]) ?? "")))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SalesInvoices");
  XLSX.writeFile(wb, `sales_invoices_${new Date().toISOString().slice(0, 10)}.xlsx`);

}
const typeLabel = (r: any) =>
  r.invoice_type === "purchase" ? "Purchase Invoice" : "Sales Invoice";
const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    draft:     "bg-secondary-transparent text-secondary",
    issued:    "bg-info-transparent text-info",
    partial:   "bg-warning-transparent text-warning",
    paid:      "bg-success-transparent text-success",
    overdue:   "bg-danger-transparent text-danger",
    cancelled: "bg-dark-transparent text-dark",
  };
  return map[s] || "bg-secondary-transparent text-secondary";
};
const BUSINESS = {
  name: "SUPER  AGRO SOLUTIONS",
  lines: ["P.o Box 173, Mpeketoni", "Tel: 0700496690"],
  logo
};
const TAGLINE =
  "Dealers in All Types Of Agro-chemicals and Veterinary Products, Farm Tools, Fertilizers and Poultry Products";
const PAYMENT = "Paybill 247247 &nbsp;&nbsp; Account 232009";

function esc(v: any) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const amt = (n: any) => Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- Invoice styling (shared by Print and PDF download) ---------- */
// Drop-in replacement for the INVOICE_CSS block in SalesInvoicesList.tsx (styling only).

const ACCENT = "#E41F07";

const INVOICE_CSS = `
   @page {
    size: A4 portrait;
    margin: 12mm 12mm 16mm;
    @bottom-right {
      content: "Page " counter(page) " of " counter(pages);
      font: 10px Arial, Helvetica, sans-serif;
      color: #6b7280;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.45;
         color: #1f2937; background: #fff;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 16px;
          padding-bottom: 14px; border-bottom: 3px solid ${ACCENT}; }
  .brand { display: flex; flex: 1 1 0; align-items: center; justify-content: center; gap: 12px; min-width: 0; }
  .tagline { flex-basis: 100%; width: 100%; margin-top: -6px; font-size: 13px; font-weight: 700;
             color: #374151; text-align: center; }
  .brand > div { text-align: center; }
  .brand img { display: block; max-width: 100px; max-height: 50px; width: auto; height: auto;
               object-fit: contain; flex-shrink: 0; }
  .brand h1 { margin: 0 0 3px; font-size: 22px; font-weight: 700; letter-spacing: .5px; text-align: center; }
  .brand p { margin: 1px 0; color: #6b7280; font-size: 12px; text-align: left; }
  .title { text-align: right; flex-shrink: 0; }
  .title h2 { margin: 0; font-size: 28px; letter-spacing: 2px; color: ${ACCENT}; }
  .title div { color: #6b7280; font-size: 12px; margin-top: 4px; }

  .meta { display: flex; justify-content: space-between; gap: 30px; margin: 22px 0; }
  .bill { flex: 1; }
  .lbl { color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: .6px; margin-bottom: 4px; }
  .bill .nm { font-size: 14px; font-weight: 700; margin-bottom: 3px; }
  .bill p { margin: 2px 0; color: #4b5563; }
  .doc { width: 240px; }
  .doc div { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #e5e7eb; }
  .doc span:first-child { color: #6b7280; }
  .doc span:last-child { font-weight: 700; }

  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  thead th { background: ${ACCENT} !important; color: #fff !important; text-align: left; font-size: 12px;
             text-transform: uppercase; letter-spacing: .4px; padding: 9px 10px; }
  th.r, td.r { text-align: right; }
  tbody td, tfoot td { padding: 9px 10px; vertical-align: top; border-bottom: 1px solid #e5e7eb; overflow-wrap: anywhere; font-size: 12px; }
  tbody tr:nth-child(even) { background: #f9fafb; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .nm2 { font-weight: 600; }
  .cat { color: #9ca3af; font-size: 10px; margin-top: 2px; }
  .note { margin-top: 10px; color: #9ca3af; font-size: 12px; }

  .totals { margin: 12px 0 0 auto; width: 270px; max-width: 100%; break-inside: avoid; page-break-inside: avoid; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 0; }
  .totals .grand { border-top: 2px solid #111; margin-top: 4px; padding-top: 8px; font-size: 12px; font-weight: 700; }
  .totals .due { background: ${ACCENT} !important; color: #fff !important; font-weight: 700; font-size: 12px;
                 padding: 9px 10px; margin-top: 8px; border-radius: 4px; }

  .extra { margin-top: 22px; font-size: 12px; color: #4b5563; white-space: pre-wrap; break-inside: avoid; }
  .sign { display: flex; gap: 40px; margin-top: 50px; break-inside: avoid; page-break-inside: avoid; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center; font-size: 12px; color: #4b5563; }
  .pay { font-size: 16px; font-weight: 700; color: #111; margin-bottom: 8px; text-align: center; }
  .foot { margin-top: 30px; text-align: center; color: #9ca3af; font-size: 12px;
          border-top: 1px solid #e5e7eb; padding-top: 10px; }
  .unpaid { margin-top: 22px; break-inside: avoid; page-break-inside: avoid; }
  .unpaid h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .6px; color: #6b7280; }
  .unpaid table th { background: #f3f4f6 !important; color: #374151 !important; }
  .unpaid tr.cur td { font-weight: 700; background: #fef2f2; }
  .unpaid .allbal { display: flex; justify-content: space-between; margin-top: 8px; padding: 9px 12px;
                    background: ${ACCENT} !important; color: #fff !important; font-weight: 700;
                    font-size: 13px; border-radius: 4px; }
                    .unpaid h3,
.unpaid table th,
.unpaid table td,
.unpaid .allbal { font-size: 12px; }

`;

function buildInvoiceHtml(inv: any, preparedBy = "") {
  const isPurchase = inv.invoice_type === "purchase";
  const party = {
    name: inv.billed_to_name || inv.customer_name || inv.supplier_name || "",
    lines: [inv.billed_to_address, inv.billed_to_phone, inv.billed_to_email].filter(Boolean),
  };
  const docNo = isPurchase
    ? (inv.extra_data?.supplier_invoice_no || inv.extra_data?.supplier_ref || inv.invoice_number)
    : inv.invoice_number;

  const items: any[] = (inv.items && inv.items.length)
    ? inv.items
    : [{ description: "Invoice amount", category: "", quantity: 1, unit_price: inv.subtotal, tax_amount: inv.tax_amount, line_total: Number(inv.subtotal || 0) + Number(inv.tax_amount || 0) }];

  const rows = items.map(i => `
    <tr>
      <td><div class="nm2">${esc(i.description)}</div>${i.category ? `<div class="cat">${esc(i.category)}</div>` : ""}</td>
      <td class="r">${esc(Number(i.quantity).toLocaleString("en-KE", { maximumFractionDigits: 2 }))}</td>
      <td class="r">${amt(i.unit_price)}</td>
      <td class="r">${amt(i.tax_amount)}</td>
      <td class="r">${amt(i.line_total)}</td>
    </tr>`).join("");
  const logoSrc = BUSINESS.logo.startsWith("data:") ? BUSINESS.logo : window.location.origin + BUSINESS.logo;
  const partyLabel = isPurchase ? "Supplier" : "Bill To";
const title = isPurchase ? "PURCHASE INVOICE" : "SALES INVOICE";  // Unpaid balance from this supplier's earlier bills (purchase invoices only)
 const prevBal = 0; 
const prevInvs: any[] = inv.previous_invoices || [];
  const prevInvTotal = prevInvs.reduce((s, x) => s + Number(x.total_amount || 0), 0);
  const prevInvBal = prevInvs.reduce((s, x) => s + Number(x.balance_due || 0), 0);
  const allTotal = prevInvTotal + Number(inv.total_amount || 0);
  const allBalance = prevInvBal + Number(inv.balance_due || 0);

  const unpaidHtml = prevInvs.length ? `
  <div class="unpaid">
    <h3>Unpaid invoices</h3>
    <table>
      <thead><tr><th>Invoice #</th><th class="r">Total</th><th class="r">Balance</th></tr></thead>
      <tbody>
        ${prevInvs.map(x => `<tr><td>${esc(x.invoice_number)}</td><td class="r">${amt(x.total_amount)}</td><td class="r">${amt(x.balance_due)}</td></tr>`).join("")}
        <tr class="cur"><td>${esc(docNo)} (this invoice)</td><td class="r">${amt(inv.total_amount)}</td><td class="r">${amt(inv.balance_due)}</td></tr>
      </tbody>
      <tfoot><tr><td><strong>Totals</strong></td><td class="r"><strong>${amt(allTotal)}</strong></td><td class="r"><strong>${amt(allBalance)}</strong></td></tr></tfoot>
    </table>
    <div class="allbal"><span>Total balance of all invoices</span><span>${amt(allBalance)}</span></div>
  </div>` : "";

  const html = `
<html><head><title>Invoice ${esc(docNo)}</title>
<style>${INVOICE_CSS}</style></head>
<body>

  <div class="head">
    <div class="brand">
      ${BUSINESS.logo ? `<img src="${logoSrc}" alt="Company Logo" />` : ""}
      <div>
        <h1>${esc(BUSINESS.name)}</h1>
        ${BUSINESS.lines.map(l => `<p>${esc(l)}</p>`).join("")}
      </div>
    </div>
    <div class="title">
        <h2 style="${isPurchase ? "font-size:22px;" : ""}">${title}</h2>
  <div>No. ${esc(docNo)}</div>
    </div>
    <div class="tagline">${TAGLINE}</div>
  </div>

  <div class="meta">
    <div class="bill">
      <div class="lbl">${partyLabel}</div>
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
  ${unpaidHtml}

  ${inv.notes ? `<div class="extra"><strong>Notes</strong>\n${esc(inv.notes)}</div>` : ""}
  ${inv.terms ? `<div class="extra"><strong>Terms</strong>\n${esc(inv.terms)}</div>` : ""}

  <div class="sign"><div>Prepared by: ${esc(preparedBy) || "&nbsp;"}</div></div>
 <div class="foot">${isPurchase ? "" : `<div class="pay">Payment details: ${PAYMENT}</div>`}Thank you for your business.</div>
</body></html>`;
  return { html, docNo };
}

function printInvoice(inv: any, preparedBy = "") {
  printHtml(buildInvoiceHtml(inv, preparedBy).html);
}
async function downloadInvoice(inv: any, preparedBy = "") {
  const { html, docNo } = buildInvoiceHtml(inv, preparedBy);
  // A4 = 210 x 297 mm; 12mm margins -> 186 x 273 mm content box.
  // 704px is the content width at 96dpi (794px page minus margins).
  const CONTENT_PX = 704;
  const PAGE_W = 210, PAGE_H = 297, MARGIN = 12;
  const CONTENT_W = PAGE_W - MARGIN * 2;   // 186mm
  const CONTENT_H = PAGE_H - MARGIN * 2;   // 273mm

  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${CONTENT_PX}px;height:1200px;border:0;`;
  document.body.appendChild(iframe);

  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    doc.body.style.width = `${CONTENT_PX}px`;

    // Wait for images (logo) and fonts so nothing is captured half-loaded
    await Promise.all(
      Array.from(doc.images).map(img =>
        img.complete ? Promise.resolve() : new Promise(res => { img.onload = img.onerror = () => res(null); })
      )
    );
    await (doc as any).fonts?.ready;

    const canvas = await html2canvas(doc.body, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      width: CONTENT_PX,
      windowWidth: CONTENT_PX,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    // Slice the tall canvas into page-height strips
    const pxPerMm = canvas.width / CONTENT_W;
    const pageHpx = Math.floor(CONTENT_H * pxPerMm);
    let y = 0, pageNo = 0;

    while (y < canvas.height) {
      const sliceH = Math.min(pageHpx, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

      if (pageNo > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.95), "JPEG", MARGIN, MARGIN, CONTENT_W, sliceH / pxPerMm);

      y += sliceH;
      pageNo++;
    }
      const total = pdf.getNumberOfPages();
for (let i = 1; i <= total; i++) {
  pdf.setPage(i);
  pdf.setFontSize(9);
  pdf.setTextColor(120);
  pdf.text(`Page ${i} of ${total}`, 105, 292, { align: "center" });
}
    pdf.save(`Invoice-${String(docNo).replace(/[^\w.-]+/g, "_")}.pdf`);
  } catch (err) {
    console.error("Download failed:", err);
    alert("Could not download the invoice.");
  } finally {
    iframe.remove();
  }
}

export default function SalesInvoicesList() {
  const [items, setItems]       = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [sales, setSales]       = useState<any[]>([]);

  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplies, setSupplies] = useState<any[]>([]);

  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [mode, setMode]         = useState<Mode>("add");
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm]         = useState<InvForm>(emptyForm);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const navigate = useNavigate();
const [paySaleId, setPaySaleId] = useState<number | null>(null);
const [preparedBy, setPreparedBy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("sales-invoices/");
      const raw: any[] = res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      setItems(raw);
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else console.error("Error loading invoices:", err);
    } finally { setLoading(false); }
  }, []);
useEffect(() => {
  API.get("users/me/")
    .then(res => {
      const u = res.data;
      const name = `${u?.firstname || ""} ${u?.lastname || ""}`.trim() || u?.username || "";
      setPreparedBy(name);
    })
    .catch(() => setPreparedBy(""));
}, []);
  const loadSales = useCallback(async () => {
    try {
      const res = await API.get("sales/");
      const raw: any[] = res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      setSales(raw);
    } catch (err) {
      console.error("Error loading sales for picker:", err);
    }
  }, []);

  useEffect(() => {
    load(); loadSales();
    API.get("products/", { params: { page_size: 1000 } })
      .then(r => setProducts(r.data?.results || (Array.isArray(r.data) ? r.data : [])))
      .catch(err => console.error("Error loading products:", err));
    API.get("suppliers/", { params: { page_size: 1000 } })
      .then(r => setSuppliers(r.data?.results || (Array.isArray(r.data) ? r.data : [])))
      .catch(err => console.error("Error loading suppliers:", err));
    API.get("supplies/", { params: { page_size: 1000 } })
      .then(r => setSupplies(r.data?.results || (Array.isArray(r.data) ? r.data : [])))
      .catch(err => console.error("Error loading supplies:", err));
  }, [load, loadSales]);
  useEffect(() => { setPage(1); }, [search, statusFilter, typeFilter, supplierFilter]);

  useEffect(() => {
    let list = items;
    if (statusFilter !== "all") list = list.filter(r => r.status === statusFilter);
    if (typeFilter !== "all") {
  list = list.filter(r =>
    typeFilter === "credit" ? r.invoice_type !== "purchase" : r.invoice_type === typeFilter);
}
    if (supplierFilter !== "all") list = list.filter(r => String(r.supplier ?? "") === supplierFilter);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.invoice_number || "").toLowerCase().includes(q) ||
        (r.billed_to_name || "").toLowerCase().includes(q) ||
        (r.billed_to_phone || "").toLowerCase().includes(q) ||
        (r.sale_order_number || "").toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }, [search, statusFilter, typeFilter, supplierFilter, items]);

  const openOffcanvas = () => {
    const el = document.getElementById("invoice-offcanvas");
    if (el) (window as any).bootstrap?.Offcanvas?.getOrCreateInstance(el)?.show();
  };
  const closeOffcanvas = () => {
    const el = document.getElementById("invoice-offcanvas");
    if (el) (window as any).bootstrap?.Offcanvas?.getInstance(el)?.hide();
  };
const goToPayment = (inv: any) => {
  if (inv.invoice_type === "purchase") {
    // `supplies` is already loaded above; each supply carries its purchase_invoice id
    const sp = supplies.find((s: any) => s.purchase_invoice === inv.id);
    if (!sp) {
      alert("No supply is linked to this purchase invoice. Record the payment from the Business Payments page instead.");
      return;
    }
    closeOffcanvas();
    navigate("/supplies", { state: { openSupplyId: sp.id, openPayment: true } }); // use your all_routes entry if you have one
  } else {
    if (!inv.sale) {
      alert("This invoice isn't linked to a sale, so a payment can't be recorded from here.");
      return;
    }
    closeOffcanvas();
    // wait for Bootstrap's offcanvas to finish closing so the body scroll lock isn't left on
    setTimeout(() => setPaySaleId(Number(inv.sale)), 350);
  }
};
  const handleOpenAdd = () => {
    setMode("add");
    setSelected(null);
    setForm({ ...emptyForm, issue_date: new Date().toISOString().slice(0, 10) });
    setError("");
    openOffcanvas();
  };

  const handleOpenEdit = (item: any) => {
    setMode("edit");
    setSelected(item);
    setForm({
      invoice_type: item.invoice_type || "credit",
      sale: String(item.sale ?? ""),
      supplier: String(item.supplier ?? ""),
      supply: "",
      issue_date: item.issue_date || "",
      due_date: item.due_date || "",
      billed_to_name: item.billed_to_name || "",
      billed_to_phone: item.billed_to_phone || "",
      billed_to_email: item.billed_to_email || "",
      billed_to_address: item.billed_to_address || "",
      notes: item.notes || "",
      terms: item.terms || "",
      subtotal: String(item.subtotal ?? "0"),
      discount_amount: String(item.discount_amount ?? "0"),
      tax_amount: String(item.tax_amount ?? "0"),
      amount_paid: String(item.amount_paid ?? "0"),
      extra: item.extra_data || {},
      items: item.sale ? [] : (item.items || []).map((i: any) => ({
        product: String(i.product ?? ""), description: i.description || "", category: i.category || "",
        quantity: String(i.quantity ?? "1"), unit_price: String(i.unit_price ?? "0"), tax_rate: String(i.tax_rate ?? "0"),
      })),
    });
    setError("");
    openOffcanvas();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.issue_date) { setError("Issue date is required."); return; }
    if (form.due_date && form.due_date < form.issue_date) {
      setError("Due date cannot be before the issue date."); return;
    }

    const cfgNow = TYPE_CONFIG[form.invoice_type] ?? TYPE_CONFIG.supply;
    if (cfgNow.saleField === "required" && !form.sale) { setError("Please select a sale."); return; }
    const missing = cfgNow.extra.find(f => f.required && !form.extra[f.key]?.trim());
    if (missing) { setError(`${missing.label} is required.`); return; }
    if (form.invoice_type === "purchase" && !form.supplier) { setError("Please select the supplier."); return; }

    const lineItems = form.items.filter(i => i.description.trim());
    if (!form.sale && lineItems.length === 0 && !Number(form.subtotal)) {
      setError("Add at least one item or enter a subtotal."); return;
    }

    setSaving(true);
    setError("");

    const { extra, ...rest } = form;
    const payload: any = { ...rest };
    if (payload.due_date === "") payload.due_date = null;
    payload.sale = payload.sale ? Number(payload.sale) : null;
    payload.supplier = payload.supplier ? Number(payload.supplier) : null;
    payload.supply = payload.supply ? Number(payload.supply) : null;
    if (!payload.supply) delete payload.supply;
    payload.extra_data = Object.fromEntries(cfgNow.extra.map(f => [f.key, extra[f.key] ?? ""]));

    if (payload.sale) {
      delete payload.subtotal;
      delete payload.discount_amount;
      delete payload.tax_amount;
      delete payload.amount_paid;
      delete payload.items;
    } else {
      payload.items = lineItems;
      if (lineItems.length) {          // totals come from the items
        delete payload.subtotal;
        delete payload.tax_amount;
      }
    }

    try {
      if (mode === "edit" && selected) {
        const { sale, ...editable } = payload;
        delete editable.supply;   // a supply can only be linked when the invoice is created
        await API.patch(`sales-invoices/${selected.id}/`, editable);
      } else {
        await API.post("sales-invoices/", payload);
      }
      closeOffcanvas();
      load();
    } catch (err: any) {
      const data = err.response?.data;
      const msg =
        typeof data === "string" ? data
        : data?.message
        || (data && Object.values(data).flat().join(" "))
        || "Failed to save invoice.";
      setError(msg);
    } finally { setSaving(false); }
  };

  const handleDownload = async (inv: any) => {
    if (downloadingId) return;            // ignore double-clicks
    setDownloadingId(inv.id);
    try {
      await downloadInvoice(inv, preparedBy);
    } finally {
      setDownloadingId(null);
    }
  };
  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this invoice?")) return;
    try { await API.delete(`sales-invoices/${id}/`); load(); }
    catch (err) { console.error("Delete failed:", err); }
  };

  const handleMarkIssued = async (id: number) => {
    try { await API.post(`sales-invoices/${id}/mark_issued/`, {}); load(); }
    catch (err: any) { alert(err.response?.data?.error || "Failed to mark issued."); }
  };

  const handleMarkPaid = async (id: number) => {
    if (!window.confirm("Mark this invoice as fully paid?")) return;
    try { await API.post(`sales-invoices/${id}/mark_paid/`, {}); load(); }
    catch (err: any) { alert(err.response?.data?.error || "Failed to mark paid."); }
  };

  const activeFilterCount = [statusFilter !== "all", typeFilter !== "all", supplierFilter !== "all"].filter(Boolean).length;
  const cfg = TYPE_CONFIG[form.invoice_type] ?? TYPE_CONFIG.supply;
  const hasItems = form.items.length > 0;
  const itemsSub = form.items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
  const itemsTax = form.items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0) * (Number(i.tax_rate) || 0) / 100, 0);
  const subtotalShown = hasItems ? itemsSub : Number(form.subtotal || 0);
  const taxShown = hasItems ? itemsTax : Number(form.tax_amount || 0);
  const totalShown = subtotalShown - Number(form.discount_amount || 0) + taxShown;

  // Supplier chosen from the Supplier model: fill the billed-to details, reset any supply/items
  const pickSupplier = (id: string) => {
    const sup = suppliers.find((x: any) => String(x.id) === id);
    setForm(f => ({
      ...f, supplier: id, supply: "", items: [],
      billed_to_name: sup?.name || "", billed_to_phone: sup?.phone || "",
      billed_to_email: sup?.email || "", billed_to_address: sup?.address || "",
    }));
  };

  // Supply chosen from the Supply model: items, unit costs, dates and reference come from it
  const pickSupply = (id: string) => {
    const sp = supplies.find((x: any) => String(x.id) === id);
    if (!sp) { setForm(f => ({ ...f, supply: "", items: [] })); return; }
    const sup = suppliers.find((x: any) => x.id === sp.supplier);
    const days = TERMS_DAYS[sup?.payment_terms ?? "cash"] ?? 0;
    setForm(f => ({
      ...f,
      supplier: String(sp.supplier),
      billed_to_name: sup?.name || sp.supplier_name || "",
      billed_to_phone: sup?.phone || "",
      billed_to_email: sup?.email || "",
      billed_to_address: sup?.address || "",
      supply: id,
      issue_date: sp.supply_date,
      due_date: days ? addDays(sp.supply_date, days) : "",
      notes: f.notes || `Supply ${sp.reference}`,
      extra: { ...f.extra, supplier_invoice_no: f.extra.supplier_invoice_no || sp.supplier_ref || "" },
      items: (sp.items || []).map((i: any) => {
        const p = products.find((x: any) => x.id === i.product);
        return {
          product: String(i.product), description: i.product_name, category: p?.category_name || "",
          quantity: String(i.quantity), unit_price: String(i.unit_cost), tax_rate: "0",
        };
      }),
    }));
  };
  const availableSupplies = supplies.filter((x: any) =>
    (!form.supplier || String(x.supplier) === form.supplier) && x.status === "received" && !x.has_invoice);

// Flatten the items of every received, un-invoiced supply (filtered by chosen supplier)
const supplyItemOptions = availableSupplies
  .flatMap((s: any) =>
    (s.items || []).map((i: any) => ({ ...i, key: `${s.id}-${i.id}`, supplyRef: s.reference }))
  )
  // hide ones already on the invoice
  .filter((o: any) => !form.items.some(l => l.product === String(o.product)));

const addSupplyItem = (key: string) => {
  const o = supplyItemOptions.find((x: any) => x.key === key);
  if (!o) return;
  const p = products.find((x: any) => x.id === o.product);
  setForm(f => ({
    ...f,
    items: [...f.items, {
      product: String(o.product),
      description: o.product_name,
      category: p?.category_name || "",
      quantity: String(o.quantity),
      unit_price: String(o.unit_cost),
      tax_rate: "0",
    }],
  }));
};

  const addLine = (productId?: string) => {
    const p = products.find((x: any) => String(x.id) === productId);
    const price = p ? (form.invoice_type === "purchase" ? p.cost_price : p.retail_price) : "";
    setForm(f => ({ ...f, items: [...f.items, {
      product: p ? String(p.id) : "", description: p?.name || "", category: p?.category_name || "",
      quantity: "1", unit_price: price !== "" ? String(price) : "", tax_rate: p ? String(p.tax_rate ?? "0") : "0",
    }] }));
  };
  const setLine = (idx: number, patch: Partial<InvItem>) =>
    setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  const removeLine = (idx: number) =>
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Action Bar */}
        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Invoices</h4>
            <p className="text-muted fs-13 mb-0">Issue, track and settle invoices for your sales</p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading}>
              <i className={`ti ti-refresh me-1 ${loading ? "fa-spin" : ""}`} />Refresh
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={() => exportCSV(filtered)} disabled={!filtered.length}>
              <i className="ti ti-file-text me-1" />CSV
            </button>
            <button className="btn btn-outline-success btn-sm" onClick={() => exportExcel(filtered)} disabled={!filtered.length}>
              <i className="ti ti-table me-1" />Excel
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleOpenAdd}>
              <i className="ti ti-plus me-1" />New Invoice
            </button>
          </div>
        </div>

        {/* Tiles */}
        {!loading && items.length > 0 && (() => {
          const totalOutstanding = items
            .filter(r => r.invoice_type !== "purchase" && r.status !== "cancelled")
            .reduce((s, r) => s + Number(r.balance_due || 0), 0);
          const tiles = [
            { label: "Total Invoices", value: items.length,                                       icon: "ti-file-invoice",   bg: "bg-primary-gradient-100", color: "text-primary" },
            { label: "Paid",           value: items.filter(r => r.status === "paid").length,       icon: "ti-circle-check",   bg: "bg-success-gradient-100", color: "text-success" },
            { label: "Overdue",        value: items.filter(r => r.status === "overdue").length,    icon: "ti-alert-circle",   bg: "bg-danger-gradient-100",  color: "text-danger" },
            { label: "Receivable",     value: fmtMoney(totalOutstanding),                          icon: "ti-cash",           bg: "bg-warning-gradient-100", color: "text-warning" },
          ];
          return (
            <div className="row g-3 mb-4">
              {tiles.map(s => (
                <div key={s.label} className="col-6 col-sm-3">
                  <div className="card mb-0 shadow-none border">
                    <div className="card-body p-3 position-relative">
                      <p className="fw-medium mb-1 fs-13">{s.label}</p>
                      <h4 className={`mb-0 ${s.color}`}>{s.value}</h4>
                      <div className={`avatar avatar-rounded avatar-sm ${s.bg} position-absolute top-0 end-0 m-2 d-flex align-items-center justify-content-center`}>
                        <i className={`ti ${s.icon} fs-5 ${s.color}`} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Table */}
        <div className="card shadow-none border">
          <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="input-group input-group-flat" style={{ maxWidth: 300 }}>
              <span className="input-group-text bg-transparent border-end-0"><i className="ti ti-search text-muted" /></span>
              <input type="text" className="form-control border-start-0 ps-1 fs-13"
                placeholder="Search invoice #, buyer, order #…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}><i className="ti ti-x" /></button>}
            </div>
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <select className="form-select form-select-sm fs-13" style={{ width: 170 }}
                value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>

              <select className="form-select form-select-sm fs-13" style={{ width: 160 }}
                value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="all">All types</option>
                {INVOICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>

              <select className="form-select form-select-sm fs-13" style={{ width: 180 }}
                value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
                <option value="all">All suppliers</option>
                {suppliers.map((s: any) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>

              {activeFilterCount > 0 && (
                <button className="btn btn-sm btn-outline-danger"
                  onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setSupplierFilter("all"); }}>
                  <i className="ti ti-x me-1" />Clear
                </button>
              )}
            </div>
          </div>

          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading invoices…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-file-invoice fs-1 mb-2" />
                <p className="fs-14 mb-0">{items.length === 0 ? "No invoices found." : "No results match your filters."}</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 fs-13">
                  <thead className="table-light">
                    <tr>
                      {COLUMNS.map(c => <th key={c.key} className="text-nowrap">{c.label}</th>)}
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice((page - 1) * pageSize, page * pageSize).map(r => (
                      <tr key={r.id}>
                        <td className="fw-semibold text-dark text-nowrap">{r.invoice_number}</td>
                        <td>
                          <span className={
                            r.invoice_type === "credit"   ? "badge bg-danger-transparent text-danger" :
                            r.invoice_type === "purchase" ? "badge bg-info-transparent text-info" :
                                                            "badge bg-primary-transparent text-primary"
                          }>
                            {typeLabel(r)}
                          </span>
                        </td>
                        <td className="text-muted text-nowrap">{fmtDate(r.issue_date)}</td>
                        <td className="text-muted text-nowrap">{r.due_date ? fmtDate(r.due_date) : "—"}</td>
                        <td>{r.billed_to_name || r.customer_name || <span className="text-muted">—</span>}</td>
                        <td className="fw-semibold">{fmtMoney(r.total_amount)}</td>
                        <td className={Number(r.balance_due) > 0 ? "text-danger fw-semibold" : "text-muted"}>
                          {fmtMoney(r.balance_due)}
                        </td>
                        <td>
                          <span className={`badge ${statusBadge(r.status)}`}>
                            {r.status_display || r.status}
                          </span>
                        </td>
                        <td className="text-end">
                          <div className="d-inline-flex gap-1">
                            {r.status === "draft" && (
                              <button className="btn btn-sm btn-icon btn-light" title="Issue" onClick={() => handleMarkIssued(r.id)}>
                                <i className="ti ti-send text-info" />
                              </button>
                            )}
                            <button className="btn btn-sm btn-icon btn-light" title="View"
  onClick={() => { setMode("view"); setSelected(r); setError(""); openOffcanvas(); }}>
  <i className="ti ti-eye text-info" />
</button>

{Number(r.balance_due) > 0 && r.status !== "paid" && r.status !== "cancelled" && (
  <button className="btn btn-sm btn-icon btn-light" title="Record payment" onClick={() => goToPayment(r)}>
    <i className="ti ti-cash text-primary" />
  </button>
)}
                            {r.status !== "paid" && r.status !== "cancelled" && (
                              <button className="btn btn-sm btn-icon btn-light" title="Mark Paid" onClick={() => handleMarkPaid(r.id)}>
                                <i className="ti ti-circle-check text-success" />
                              </button>
                            )}
                            <button className="btn btn-sm btn-icon btn-light" title="Print" onClick={() => printInvoice(r,preparedBy)}>
                              <i className="ti ti-printer text-success" />
                            </button>
                            <button className="btn btn-sm btn-icon btn-light" title="Edit" onClick={() => handleOpenEdit(r)}>
                              <i className="ti ti-edit text-primary" />
                            </button>
                            <button className="btn btn-sm btn-icon btn-light" title="Download PDF"
                              disabled={downloadingId === r.id}
                              onClick={() => handleDownload(r)}>
                              {downloadingId === r.id
                                ? <span className="spinner-border spinner-border-sm text-secondary" role="status" />
                                : <i className="ti ti-download text-secondary" />}
                            </button>
                            <button className="btn btn-sm btn-icon btn-light" title="Delete" onClick={() => handleDelete(r.id)}>
                              <i className="ti ti-trash text-danger" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!loading && filtered.length > 0 && (() => {
            const totalPages = Math.ceil(filtered.length / pageSize);
            const start = (page - 1) * pageSize + 1;
            const end   = Math.min(page * pageSize, filtered.length);
            return (
              <div className="card-footer border-top py-2 px-3 d-flex align-items-center justify-content-between flex-wrap gap-2 fs-12 text-muted">
                <span>Showing <strong>{start}–{end}</strong> of <strong>{filtered.length}</strong> invoices</span>
                <div className="d-flex align-items-center gap-1">
                  <select className="form-select form-select-sm fs-12 w-auto" value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                    {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                  {totalPages > 1 && (
                    <nav className="ms-2">
                      <ul className="pagination pagination-sm mb-0">
                        <li className={`page-item ${page === 1 ? "disabled" : ""}`}>
                          <button className="page-link" onClick={() => setPage(p => p - 1)}><i className="ti ti-chevron-left" /></button>
                        </li>
                        <li className="page-item disabled"><span className="page-link">{page} / {totalPages}</span></li>
                        <li className={`page-item ${page === totalPages ? "disabled" : ""}`}>
                          <button className="page-link" onClick={() => setPage(p => p + 1)}><i className="ti ti-chevron-right" /></button>
                        </li>
                      </ul>
                    </nav>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Offcanvas */}
      <div className="offcanvas offcanvas-end" tabIndex={-1} id="invoice-offcanvas" style={{ width: "500px" }}>
        <div className="offcanvas-header bg-primary text-white py-3">
          <h5 className="offcanvas-title text-white fs-16 fw-semibold">
            {mode === "add" && "New Sales Invoice"}
            {mode === "edit" && "Edit Invoice"}
            {mode === "view" && "Invoice Details"}
          </h5>
          <button type="button" className="btn-close btn-close-white" data-bs-dismiss="offcanvas" />
        </div>

        <div className="offcanvas-body">
          {error && <div className="alert alert-danger fs-13 py-2">{error}</div>}

          {mode === "view" && selected ? (
          <InvoiceView item={selected} fmtDate={fmtDate} fmtMoney={fmtMoney} statusBadge={statusBadge}
  onPay={() => goToPayment(selected)} />
          ) : (
            <form id="invoice-form" onSubmit={handleSave} className="d-flex flex-column gap-3">
              <SectionTitle icon="ti-file-invoice" title="Invoice Information" />
              <div className="row g-2">

                <Field className="col-md-12" label="Invoice Type *">
                  <select className="form-select fs-13" required
                    value={form.invoice_type}
                    onChange={e => {
                      const t = e.target.value;
                      setForm({
                        ...form,
                        invoice_type: t,
                        extra: {},
                        sale: TYPE_CONFIG[t].saleField === "hidden" ? "" : form.sale,
                        supplier: t === "purchase" ? form.supplier : "",
                        supply: "",
                        items: form.supply ? [] : form.items,
                      });
                    }}>
                    {INVOICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                {form.invoice_type === "purchase" && (
                  <>
                    <Field className="col-md-12" label="Supplier *">
                      <select className="form-select fs-13" disabled={mode === "edit"}
                        value={form.supplier} onChange={e => pickSupplier(e.target.value)}>
                        <option value="">— Select a supplier —</option>
                        {suppliers
                          .filter((x: any) => x.is_active || String(x.id) === form.supplier)
                          .map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </Field>
                  </>
                )}
                {cfg.saleField !== "hidden" && (
                  <Field className="col-md-12" label={`Sale${cfg.saleField === "required" ? " *" : " (optional)"}`}>
                    <select className="form-select fs-13" disabled={mode === "edit"}
                      value={form.sale}
                      onChange={e => {
                        const s = sales.find((x: any) => String(x.id) === e.target.value);
                        setForm(f => ({ ...f, sale: e.target.value, billed_to_name: f.billed_to_name || s?.customer_name || "" }));
                      }}>
                      <option value="">— Select a sale —</option>
                      {sales.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.order_number} · {s.customer_name || "Walk-in"} · {fmtMoney(s.total_amount)}
                        </option>
                      ))}
                    </select>
                    {mode === "edit" && (
                      <small className="text-muted fs-12">Sale cannot be changed after the invoice is created.</small>
                    )}
                  </Field>
                )}

                <Field className="col-md-6" label="Issue Date *">
                  <input type="date" className="form-control fs-13" required
                    value={form.issue_date}
                    onChange={e => setForm({ ...form, issue_date: e.target.value })} />
                </Field>
                <Field className="col-md-6" label="Due Date">
                  <input type="date" className="form-control fs-13"
                    value={form.due_date}
                    onChange={e => setForm({ ...form, due_date: e.target.value })} />
                </Field>
              </div>

              <SectionTitle icon="ti-user" title={cfg.partyTitle} />
              <div className="row g-2">
                <Field className="col-md-6" label="Name">
                  <input type="text" className="form-control fs-13"
                    value={form.billed_to_name}
                    onChange={e => setForm({ ...form, billed_to_name: e.target.value })} />
                </Field>
                <Field className="col-md-6" label="Phone">
                  <input type="text" className="form-control fs-13"
                    value={form.billed_to_phone}
                    onChange={e => setForm({ ...form, billed_to_phone: e.target.value })} />
                </Field>
                <Field className="col-md-6" label="Email">
                  <input type="email" className="form-control fs-13"
                    value={form.billed_to_email}
                    onChange={e => setForm({ ...form, billed_to_email: e.target.value })} />
                </Field>
                <Field className="col-md-6" label="Address">
                  <input type="text" className="form-control fs-13"
                    value={form.billed_to_address}
                    onChange={e => setForm({ ...form, billed_to_address: e.target.value })} />
                </Field>

                {cfg.extra.length > 0 && (
                  <>
                    <SectionTitle icon="ti-list-details" title={cfg.detailsTitle} />
                    <div className="row g-2">
                      {cfg.extra.map(f => (
                        <Field key={f.key}
                          className={f.type === "textarea" ? "col-md-12" : "col-md-6"}
                          label={f.label + (f.required ? " *" : "")}>
                          {f.type === "textarea" ? (
                            <textarea rows={2} className="form-control fs-13"
                              value={form.extra[f.key] ?? ""}
                              onChange={e => setForm({ ...form, extra: { ...form.extra, [f.key]: e.target.value } })} />
                          ) : (
                            <input type={f.type || "text"} className="form-control fs-13"
                              value={form.extra[f.key] ?? ""}
                              onChange={e => setForm({ ...form, extra: { ...form.extra, [f.key]: e.target.value } })} />
                          )}
                        </Field>
                      ))}
                    </div>
                  </>
                )}
                {(cfg.saleField === "hidden" || !form.sale) ? (
                  <>
                    <SectionTitle icon="ti-list" title="Items" />
                    {form.invoice_type === "purchase" && mode === "add" && (
                      <div>
                        <label className="form-label fs-12 fw-medium text-muted mb-1">Load items from a supply</label>
                        <select className="form-select form-select-sm fs-13"
                          value={form.supply} onChange={e => pickSupply(e.target.value)}>
                          <option value="">— Select a supply —</option>
                          {availableSupplies.map((x: any) => (
                            <option key={x.id} value={x.id}>
                              {x.reference} · {x.supplier_name} · {fmtMoney(x.total_cost)}
                            </option>
                          ))}
                        </select>
                        <small className="text-muted fs-12">
                          {availableSupplies.length === 0
                            ? "No un-invoiced supplies found."
                            : "Shows received supplies that have no invoice yet. Selecting one fills the supplier, items and unit costs."}
                        </small>
                      </div>
                    )}
                    <div className="d-flex gap-2">
  {form.invoice_type === "purchase" ? (
    <select className="form-select form-select-sm fs-13" value=""
      onChange={e => { if (e.target.value) addSupplyItem(e.target.value); }}>
      <option value="">
        {supplyItemOptions.length ? "+ Add a supply item…" : "No supply items available"}
      </option>
      {supplyItemOptions.map((o: any) => (
        <option key={o.key} value={o.key}>
          {o.product_name}{o.item_number ? ` (${o.item_number})` : ""} · {o.quantity} × {fmtMoney(o.unit_cost)} · {o.supplyRef}
        </option>
      ))}
    </select>
  ) : (
    <select className="form-select form-select-sm fs-13" value=""
      onChange={e => { if (e.target.value) addLine(e.target.value); }}>
      <option value="">+ Add a product…</option>
      {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}{p.item_number ? ` (${p.item_number})` : ""}</option>)}
    </select>
  )}
  <button type="button" className="btn btn-sm btn-outline-secondary text-nowrap" onClick={() => addLine()}>
    + Custom line
  </button>
</div>

                    {form.items.map((it, idx) => (
                      <div key={idx} className="border rounded p-2">
                        <div className="d-flex gap-2 mb-2">
                          <input className="form-control form-control-sm fs-13" placeholder="Item / description"
                            value={it.description} onChange={e => setLine(idx, { description: e.target.value })} />
                          <input className="form-control form-control-sm fs-13" style={{ width: 120 }} placeholder="Category"
                            value={it.category} onChange={e => setLine(idx, { category: e.target.value })} />
                          <button type="button" className="btn btn-sm btn-link text-danger px-1" onClick={() => removeLine(idx)}>
                            <i className="ti ti-trash" />
                          </button>
                        </div>
                        <div className="row g-2">
                          <div className="col-3">
                            <label className="form-label fs-11 text-muted mb-0">Qty</label>
                            <input type="number" min={0} step="any" className="form-control form-control-sm fs-13"
                              value={it.quantity} onChange={e => setLine(idx, { quantity: e.target.value })} />
                          </div>
                          <div className="col-3">
                            <label className="form-label fs-11 text-muted mb-0">Rate</label>
                            <input type="number" min={0} step="0.01" className="form-control form-control-sm fs-13"
                              value={it.unit_price} onChange={e => setLine(idx, { unit_price: e.target.value })} />
                          </div>
                          <div className="col-3">
                            <label className="form-label fs-11 text-muted mb-0">Tax %</label>
                            <input type="number" min={0} step="0.01" className="form-control form-control-sm fs-13"
                              value={it.tax_rate} onChange={e => setLine(idx, { tax_rate: e.target.value })} />
                          </div>
                          <div className="col-3 text-end">
                            <label className="form-label fs-11 text-muted mb-0">Total</label>
                            <div className="fw-semibold fs-13 pt-1">
                              {fmtMoney((Number(it.quantity) || 0) * (Number(it.unit_price) || 0) * (1 + (Number(it.tax_rate) || 0) / 100))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    <SectionTitle icon="ti-cash" title="Amounts" />
                    <div className="row g-2">
                      <Field className="col-md-6" label="Subtotal">
                        {hasItems
                          ? <input className="form-control fs-13" disabled value={subtotalShown.toFixed(2)} />
                          : <input type="number" min={0} step="0.01" className="form-control fs-13"
                              value={form.subtotal} onChange={e => setForm({ ...form, subtotal: e.target.value })} />}
                      </Field>
                      <Field className="col-md-6" label="Discount">
                        <input type="number" min={0} step="0.01" className="form-control fs-13"
                          value={form.discount_amount} onChange={e => setForm({ ...form, discount_amount: e.target.value })} />
                      </Field>
                      <Field className="col-md-6" label="Tax">
                        {hasItems
                          ? <input className="form-control fs-13" disabled value={taxShown.toFixed(2)} />
                          : <input type="number" min={0} step="0.01" className="form-control fs-13"
                              value={form.tax_amount} onChange={e => setForm({ ...form, tax_amount: e.target.value })} />}
                      </Field>
                      <Field className="col-md-6" label="Amount paid">
                        <input type="number" min={0} step="0.01" className="form-control fs-13"
                          value={form.amount_paid} onChange={e => setForm({ ...form, amount_paid: e.target.value })} />
                      </Field>
                    </div>
                    <div className="text-muted fs-12">
                      Total <strong>{fmtMoney(totalShown)}</strong> · Balance <strong>{fmtMoney(totalShown - Number(form.amount_paid || 0))}</strong>
                    </div>
                  </>
                ) : (
                  <div className="alert alert-info fs-12 py-2 mb-0">
                    Items and amounts come from the selected sale.
                  </div>
                )}

              </div>
    
              <SectionTitle icon="ti-notes" title="Notes & Terms" />
              <Field label="Notes">
                <textarea rows={2} className="form-control fs-13"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })} />
              </Field>
              <Field label="Terms">
                <textarea rows={2} className="form-control fs-13"
                  placeholder="Payment terms, bank details, etc."
                  value={form.terms}
                  onChange={e => setForm({ ...form, terms: e.target.value })} />
              </Field>
            </form>
          )}
        </div>

        <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
          {mode === "view" && selected && (
            <>
            {Number(selected.balance_due) > 0 && !["paid", "cancelled"].includes(selected.status) && (
  <button type="button" className="btn btn-sm btn-primary" onClick={() => goToPayment(selected)}>
    <i className="ti ti-cash me-1" />Record payment
  </button>
)}
              <button type="button" className="btn btn-sm btn-outline-secondary"
                disabled={downloadingId === selected.id}
                onClick={() => handleDownload(selected)}>
                {downloadingId === selected.id
                  ? <><span className="spinner-border spinner-border-sm me-1" role="status" />Preparing…</>
                  : <><i className="ti ti-download me-1" />Download</>}
              </button>
              <button type="button" className="btn btn-sm btn-outline-success" onClick={() => printInvoice(selected, preparedBy)}>
                <i className="ti ti-printer me-1" />Print
              </button>
            </>
          )}
          <button type="button" className="btn btn-sm btn-light border" data-bs-dismiss="offcanvas">
            {mode === "view" ? "Close" : "Cancel"}
          </button>
          {mode !== "view" && (
            <button type="submit" form="invoice-form" className="btn btn-sm btn-primary px-3" disabled={saving}>
              {saving ? <span className="spinner-border spinner-border-sm me-1" /> : null}
              {mode === "edit" ? "Update Invoice" : "Create Invoice"}
            </button>
          )}
        </div>
      </div>
      <SaleDetailOffcanvas
        saleId={paySaleId}
        openPayment
        onClose={() => setPaySaleId(null)}
        onChanged={load}
      />
    </div>
  );
}

/* ---------- Helpers ---------- */
function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="d-flex align-items-center gap-2 mt-1 pb-1 border-bottom">
      <i className={`ti ${icon} text-primary fs-15`} />
      <span className="fw-semibold fs-13 text-dark">{title}</span>
    </div>
  );
}
function Field({ className, label, children }: { className?: string; label: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="form-label fs-12 fw-medium text-muted mb-1">{label}</label>
      {children}
    </div>
  );
}
function ViewRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <label className="text-muted fs-12 fw-medium d-block">{label}</label>
      <span className="text-dark fs-13">{value || <span className="text-muted">—</span>}</span>
    </div>
  );
}
function Panel({ icon, title, right, children }: { icon: string; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card shadow-none border mb-0">
      <div className="card-header py-2 border-bottom d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-2">
          <i className={`ti ${icon} text-primary`} />
          <h6 className="mb-0 fw-semibold fs-14">{title}</h6>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Info({ label, value, className = "col-6" }: { label: string; value?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-muted fs-12 mb-1">{label}</p>
      <p className="fw-medium fs-13 mb-0" style={{ wordBreak: "break-word" }}>
        {value || <span className="text-muted">—</span>}
      </p>
    </div>
  );
}

function InvoiceView({
  item, fmtDate, fmtMoney, statusBadge, onPay,
}: {
  item: any; fmtDate: (s?: string) => string; fmtMoney: (v: any) => string;
  statusBadge: (s: string) => string; onPay?: () => void;
}) {
  const tcfg = TYPE_CONFIG[item.invoice_type];
  const isPurchase = item.invoice_type === "purchase";
  const balance = Number(item.balance_due || 0);
  const canPay = balance > 0 && !["paid", "cancelled"].includes(item.status);
  const prev: any[] = item.previous_invoices || [];
  const lines: any[] = item.items || [];
  const num = (v: any) => Number(v ?? 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const tiles = [
    { label: "Total", value: fmtMoney(item.total_amount), cls: "" },
    { label: "Paid", value: fmtMoney(item.amount_paid), cls: "text-success" },
    { label: balance < 0 ? "Credit" : "Balance", value: fmtMoney(balance),
      cls: balance > 0 ? "text-danger" : balance < 0 ? "text-primary" : "text-success" },
  ];

  return (
    <div className="d-flex flex-column gap-3 fs-13">

      {/* Header */}
      <div className="d-flex align-items-start justify-content-between flex-wrap gap-2">
        <div>
          <div className="text-muted fs-12">{typeLabel(item)}</div>
          <h5 className="fw-semibold mb-1">{item.invoice_number}</h5>
          <div className="text-muted fs-12">
            Issued {fmtDate(item.issue_date)}
            {item.due_date && <> · Due {fmtDate(item.due_date)}</>}
          </div>
        </div>
        <span className={`badge ${statusBadge(item.status)}`}>{item.status_display || item.status}</span>
      </div>

      {/* Amount tiles */}
      <div className="row g-2">
        {tiles.map(t => (
          <div key={t.label} className="col-4">
            <div className="border rounded p-2">
              <p className="text-muted fs-12 mb-1">{t.label}</p>
              <h6 className={`mb-0 fw-semibold ${t.cls}`}>{t.value}</h6>
            </div>
          </div>
        ))}
      </div>

      {/* Pay banner */}
      {canPay && onPay && (
        <div className="alert alert-warning d-flex align-items-center justify-content-between gap-2 py-2 mb-0">
          <span className="fs-13">
            <i className="ti ti-alert-circle me-1" />
            {fmtMoney(balance)} is still unpaid.
          </span>
          <button type="button" className="btn btn-sm btn-primary text-nowrap" onClick={onPay}>
            <i className="ti ti-cash me-1" />{isPurchase ? "Pay in Supplies" : "Pay on Sale"}
          </button>
        </div>
      )}

      {/* Details */}
      <Panel icon="ti-file-invoice" title="Details">
        <div className="card-body py-3">
          <div className="row g-3">
            <Info label="Sale order #" value={item.sale_order_number} />
            <Info label="Branch" value={item.branch_name} />
            {item.supplier_name && <Info label="Supplier" value={item.supplier_name} />}
            {tcfg?.extra?.map(f => (
              <Info key={f.key} label={f.label}
                value={f.type === "date" ? fmtDate(item.extra_data?.[f.key]) : item.extra_data?.[f.key]} />
            ))}
          </div>
        </div>
      </Panel>

      {/* Billed to / supplier */}
      <Panel icon="ti-user" title={tcfg?.partyTitle || "Billed To"}>
        <div className="card-body py-3">
          <div className="row g-3">
            <Info label="Name" value={item.billed_to_name} />
            <Info label="Phone" value={item.billed_to_phone} />
            <Info label="Email" value={item.billed_to_email} />
            <Info label="Address" value={item.billed_to_address} />
          </div>
        </div>
      </Panel>

      {/* Items */}
      <Panel icon="ti-list" title="Items"
        right={<span className="badge bg-primary-transparent text-primary fs-11">{lines.length}</span>}>
        <div className="card-body p-0">
          {lines.length === 0 ? (
            <div className="text-center text-muted py-4">No items recorded.</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm mb-0 fs-12 align-middle">
                <thead className="table-light">
                  <tr>
                    <th className="ps-3">Item</th>
                    <th className="text-end">Qty</th>
                    <th className="text-end">Rate</th>
                    <th className="text-end">Tax</th>
                    <th className="text-end pe-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((i: any, n: number) => (
                    <tr key={i.id ?? n}>
                      <td className="ps-3">
                        <div className="fw-medium">{i.description}</div>
                        {i.category && <div className="text-muted fs-11">{i.category}</div>}
                      </td>
                      <td className="text-end">{Number(i.quantity)}</td>
                      <td className="text-end">{num(i.unit_price)}</td>
                      <td className="text-end text-muted">{num(i.tax_amount)}</td>
                      <td className="text-end fw-semibold pe-3">{num(i.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>

      {/* Totals */}
      <Panel icon="ti-receipt" title="Totals">
        <div className="card-body py-3">
          <div className="d-flex justify-content-between mb-2"><span className="text-muted">Subtotal</span><span>{fmtMoney(item.subtotal)}</span></div>
          {Number(item.discount_amount) > 0 && (
            <div className="d-flex justify-content-between mb-2"><span className="text-muted">Discount</span><span className="text-danger">-{fmtMoney(item.discount_amount)}</span></div>
          )}
          <div className="d-flex justify-content-between mb-2"><span className="text-muted">Tax</span><span>{fmtMoney(item.tax_amount)}</span></div>
          <hr className="my-2" />
          <div className="d-flex justify-content-between fs-14 fw-semibold mb-2"><span>Total</span><span>{fmtMoney(item.total_amount)}</span></div>
          <div className="d-flex justify-content-between mb-2"><span className="text-muted">Paid</span><span className="text-success">{fmtMoney(item.amount_paid)}</span></div>
          <div className="d-flex justify-content-between fw-semibold">
            <span className="text-muted">{balance < 0 ? "Credit" : "Balance due"}</span>
            <span className={balance > 0 ? "text-danger" : balance < 0 ? "text-primary" : "text-success"}>{fmtMoney(balance)}</span>
          </div>
          {isPurchase && Number(item.previous_balance) > 0 && (
            <>
              <hr className="my-2" />
              <div className="d-flex justify-content-between mb-2"><span className="text-muted">Previous balance</span><span className="text-danger">{fmtMoney(item.previous_balance)}</span></div>
              <div className="d-flex justify-content-between fw-semibold"><span>Total outstanding</span><span className="text-danger">{fmtMoney(balance + Number(item.previous_balance || 0))}</span></div>
            </>
          )}
        </div>
      </Panel>

      {/* Earlier unpaid invoices */}
      {prev.length > 0 && (
        <Panel icon="ti-alert-triangle" title="Earlier unpaid invoices"
          right={<span className="badge bg-danger-transparent text-danger fs-11">{prev.length}</span>}>
          <div className="card-body p-0">
            <table className="table table-sm mb-0 fs-12">
              <thead className="table-light">
                <tr><th className="ps-3">Invoice #</th><th className="text-end">Total</th><th className="text-end pe-3">Balance</th></tr>
              </thead>
              <tbody>
                {prev.map((x: any) => (
                  <tr key={x.invoice_number}>
                    <td className="ps-3">{x.invoice_number}</td>
                    <td className="text-end">{fmtMoney(x.total_amount)}</td>
                    <td className="text-end pe-3 text-danger">{fmtMoney(x.balance_due)}</td>
                  </tr>
                ))}
                <tr className="table-light fw-semibold">
                  <td className="ps-3">{item.invoice_number} (this)</td>
                  <td className="text-end">{fmtMoney(item.total_amount)}</td>
                  <td className="text-end pe-3 text-danger">{fmtMoney(item.balance_due)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Notes & terms */}
      {(item.notes || item.terms) && (
        <Panel icon="ti-notes" title="Notes & Terms">
          <div className="card-body py-3">
            <div className="row g-3">
              {item.notes && <Info className="col-12" label="Notes" value={<span style={{ whiteSpace: "pre-wrap" }}>{item.notes}</span>} />}
              {item.terms && <Info className="col-12" label="Terms" value={<span style={{ whiteSpace: "pre-wrap" }}>{item.terms}</span>} />}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}