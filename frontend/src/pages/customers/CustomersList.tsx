
import { useState, useEffect, useCallback } from "react";

import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import API from "../../services/api";
import CustomerFormOffcanvas from "./customerModal";
import { openStatement, buildStatementHtml } from "../../../src/utils/invoiveTemplate";
function fmtDate(iso: string) {
  if (!iso) return "";

  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value: any) {
  const amount = Number(value || 0);

  return amount.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getSaleType(sale: any) {
  return String(sale?.sale_type || "").toLowerCase().trim();
}

function getCustomerSales(customer: any) {
  return Array.isArray(customer?.sales) ? customer.sales : [];
}

/*
|--------------------------------------------------------------------------
| Customer transaction rows
|--------------------------------------------------------------------------
|
| Each sale becomes its own row.
|
| Credit:
|   total_amount is counted under Credit.
|
| Debit:
|   total_amount is counted under Debit.
|
*/

function buildCustomerRows(customers: any[]) {
  const rows: any[] = [];

  customers.forEach((customer) => {
    const sales = getCustomerSales(customer);

    // Customer has no sales
    if (sales.length === 0) {
      rows.push({
        customer,
        sale: null,
        rowType: "customer",
      });

      return;
    }

    // Every sale gets its own row
    sales.forEach((sale: any) => {
      rows.push({
        customer,
        sale,
        rowType: "sale",
      });
    });
  });

  return rows;
}

function calculateCustomerTotals(customers: any[]) {
  let creditTotal = 0;
  let debitTotal = 0;

  customers.forEach((customer) => {
    const sales = getCustomerSales(customer);

    sales.forEach((sale: any) => {
      const amount = Number(sale.total_amount || 0);
      const saleType = getSaleType(sale);

      if (saleType === "credit") {
        creditTotal += amount;
      }

      if (saleType === "debit") {
        debitTotal += amount;
      }
    });
  });

  return {
    creditTotal,
    debitTotal,
    grandTotal: creditTotal + debitTotal,
  };
}

function exportCSV(customers: any[]) {
  const rows: any[] = [];

  customers.forEach((customer) => {
    const sales = getCustomerSales(customer);

    if (sales.length === 0) {
      rows.push({
        business_name: customer.business_name || "",
        phone: customer.phone || "",
        alt_phone: customer.alt_phone || "",
        email: customer.email || "",
        order_number: "",
        sale_type: "",
        total_amount: "",
        amount_paid: "",
        balance_due: "",
        date: "",
      });

      return;
    }

    sales.forEach((sale: any) => {
      rows.push({
        customer: customer.name,
        phone: customer.phone || "",
        email: customer.email || "",
        order_number: sale.order_number || "",
        sale_type: sale.sale_type || "",
        total_amount: sale.total_amount || 0,
        amount_paid: sale.amount_paid || 0,
        balance_due: sale.balance_due || 0,
        date: sale.created_at ? fmtDate(sale.created_at) : "",
      });
    });
  });

  const headers = [
    "Customer",
    "Business Name",
    "Phone",
    "Alternative Phone",
    "Email",
    "Order Number",
    "Sale Type",
    "Total Amount",
    "Amount Paid",
    "Balance",
    "Date",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.customer,
        row.business_name,
        row.phone,
        row.alt_phone,
        row.email,
        row.order_number,
        row.sale_type,
        row.total_amount,
        row.amount_paid,
        row.balance_due,
        row.date,
      ]
        .map((value) =>
          `"${String(value ?? "").replace(/"/g, '""')}"`
        )
        .join(",")
    ),
  ];

  const blob = new Blob([lines.join("\n")], {
    type: "text/csv",
  });

  const a = document.createElement("a");

  a.href = URL.createObjectURL(blob);

  a.download = `customers_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  a.click();

  URL.revokeObjectURL(a.href);
}

function exportExcel(customers: any[]) {
  const rows: any[] = [];

  customers.forEach((customer) => {
    const sales = getCustomerSales(customer);

    if (sales.length === 0) {
      rows.push({
        Customer: customer.name,
               "Business Name": customer.business_name || "",
        Phone: customer.phone || "",
        "Alternative Phone": customer.alt_phone || "",
        Email: customer.email || "",
        "Order Number": "",
        "Sale Type": "",
        "Total Amount": "",
        "Amount Paid": "",
        Balance: "",
        Date: "",
      });

      return;
    }

    sales.forEach((sale: any) => {
      rows.push({
        Customer: customer.name,
        Phone: customer.phone || "",
        Email: customer.email || "",
        "Order Number": sale.order_number || "",
        "Sale Type": sale.sale_type || "",
        "Total Amount": Number(sale.total_amount || 0),
        "Amount Paid": Number(sale.amount_paid || 0),
        Balance: Number(sale.balance_due || 0),
        Date: sale.created_at ? fmtDate(sale.created_at) : "",
      });
    });
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, "Customers");

  XLSX.writeFile(
    wb,
    `customers_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

const norm = (v: any) => String(v || "").toLowerCase().trim();

/* Every sale belonging to customers with the same name AND business name */
function buildStatement(customer: any, allCustomers: any[]) {
  const matches = allCustomers.filter(
    (c) => norm(c.name) === norm(customer.name) && norm(c.business_name) === norm(customer.business_name)
  );
 const sales = matches
  .flatMap((c) => getCustomerSales(c))
  .map((x: any) => ({ ...x, balance_due: saleBalance(x) }))
  .sort((a: any, b: any) =>
    new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  const sum = (k: string) => sales.reduce((s: number, x: any) => s + Number(x[k] || 0), 0);
  return {
    name: customer.name || "",
    business: customer.business_name || "",
    phone: customer.phone || "",
    email: customer.email || "",
    sales,
    totalAmount: sum("total_amount"),
    totalPaid: sum("amount_paid"),
    totalBalance: sum("balance_due"),
  };
}
const saleBalance = (sale: any) =>
  Number(sale?.total_amount || 0) - Number(sale?.amount_paid || 0);
function previewStatement(customer: any, allCustomers: any[]) {
  openStatement(buildStatement(customer, allCustomers), "preview");
}

function printStatement(customer: any, allCustomers: any[]) {
  openStatement(buildStatement(customer, allCustomers), "print");
}
async function downloadStatement(customer: any, allCustomers: any[]) {
  const s = buildStatement(customer, allCustomers);

  // Render the same HTML the preview/print uses, in a hidden A4-width frame
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;background:#fff;";
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      iframe.srcdoc = buildStatementHtml(s, false);
    });
    const body = iframe.contentDocument!.body;

    const canvas = await html2canvas(body, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: 794,
      windowHeight: body.scrollHeight,
    });

    // Cut the tall canvas into A4 pages
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const margin = 10;
    const imgW = 210 - margin * 2;
    const pxPerMm = canvas.width / imgW;
    const pageH = (297 - margin * 2) * pxPerMm;

    let y = 0;
    let first = true;
    while (y < canvas.height) {
      const sliceH = Math.min(pageH, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      slice.getContext("2d")!.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

      if (!first) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.95), "JPEG", margin, margin, imgW, sliceH / pxPerMm);
      y += sliceH;
      first = false;
    }
    const total = pdf.getNumberOfPages();
for (let i = 1; i <= total; i++) {
  pdf.setPage(i);
  pdf.setFontSize(9);
  pdf.setTextColor(120);
  pdf.text(`Page ${i} of ${total}`, 105, 292, { align: "center" });
}
    const safe = (s.name || "customer").replace(/[^a-z0-9]+/gi, "_");
    pdf.save(`statement_${safe}_${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (err) {
    console.error("Could not create the statement PDF:", err);
    alert("Could not create the PDF. Please try again.");
  } finally {
    iframe.remove();
  }
}
export default function CustomersList() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [loyaltyFilter, setLoyaltyFilter] = useState("all");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const res = await API.get("customers/");

      const raw: any[] =
        res.data?.results ||
        res.data?.data ||
        (Array.isArray(res.data) ? res.data : []);

      setCustomers(raw);
    } catch (err: any) {
      if (err.response?.status === 401) {
        window.location.href = "/login";
      } else {
        console.error("Error loading customers:", err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, loyaltyFilter]);

  useEffect(() => {
    let list = customers;

    if (loyaltyFilter === "has") {
      list = list.filter(
        (c) => (c.loyalty_points || 0) > 0
      );
    }

    if (loyaltyFilter === "none") {
      list = list.filter(
        (c) => !(c.loyalty_points > 0)
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();

      list = list.filter((c) => {
               const customerMatch =
          (c.name || "").toLowerCase().includes(q) ||
          (c.business_name || "").toLowerCase().includes(q) ||
          (c.phone || "").includes(q) ||
          (c.alt_phone || "").includes(q) ||
          (c.email || "").toLowerCase().includes(q);
        const sales = getCustomerSales(c);

        const saleMatch = sales.some((sale: any) => {
          return (
            String(sale.order_number || "")
              .toLowerCase()
              .includes(q) ||
            String(sale.sale_type || "")
              .toLowerCase()
              .includes(q)
          );
        });

        return customerMatch || saleMatch;
      });
    }

    setFiltered(list);
  }, [search, loyaltyFilter, customers]);

  const activeFilterCount = [
    loyaltyFilter !== "all",
  ].filter(Boolean).length;

  /*
  |--------------------------------------------------------------------------
  | Customer totals
  |--------------------------------------------------------------------------
  */

  const totals = calculateCustomerTotals(filtered);

  /*
  |--------------------------------------------------------------------------
  | Build rows
  |--------------------------------------------------------------------------
  */

  const transactionRows = buildCustomerRows(filtered);

  /*
  |--------------------------------------------------------------------------
  | Pagination
  |--------------------------------------------------------------------------
  */

  const totalPages = Math.ceil(
    transactionRows.length / pageSize
  );

  const paginatedRows = transactionRows.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  return (
    <div className="page-wrapper">
      <div className="content">

        {/* -------------------------------------------------------------
            HEADER
        ------------------------------------------------------------- */}

        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">

          <div>
            <h4 className="fw-semibold mb-1">
              Customers
            </h4>

            <p className="text-muted fs-13 mb-0">
              Customers and their sales transactions.
            </p>
          </div>

          <div className="d-flex gap-2 flex-wrap">

            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={load}
              disabled={loading}
            >
              <i
                className={`ti ti-refresh me-1 ${
                  loading ? "fa-spin" : ""
                }`}
              />

              Refresh
            </button>

            <button
              className="btn btn-outline-success btn-sm"
              onClick={() => exportCSV(filtered)}
              disabled={!filtered.length}
            >
              <i className="ti ti-file-text me-1" />

              CSV
            </button>

            <button
              className="btn btn-outline-success btn-sm"
              onClick={() => exportExcel(filtered)}
              disabled={!filtered.length}
            >
              <i className="ti ti-table me-1" />

              Excel
            </button>

            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setSelected(null);
                setShowForm(true);
              }}
            >
              <i className="ti ti-plus me-1" />

              Add Customer
            </button>

          </div>
        </div>


        {/* -------------------------------------------------------------
            SUMMARY TILES
        ------------------------------------------------------------- */}

        {!loading && customers.length > 0 && (
          <div className="row g-3 mb-4">

            <div className="col-6 col-md-3">
              <div className="card mb-0 shadow-none border">
                <div className="card-body p-3">

                  <p className="fw-medium mb-1 fs-13">
                    Total Credit
                  </p>

                  <h4 className="mb-0 text-danger">
                    KSh {formatMoney(totals.creditTotal)}
                  </h4>

                  <div className="avatar avatar-rounded avatar-sm bg-danger-transparent position-absolute top-0 end-0 m-2 d-flex align-items-center justify-content-center">
                    <i className="ti ti-credit-card fs-5 text-danger" />
                  </div>

                </div>
              </div>
            </div>


            <div className="col-6 col-md-3">
              <div className="card mb-0 shadow-none border">
                <div className="card-body p-3">

                  <p className="fw-medium mb-1 fs-13">
                    Total Debit
                  </p>

                  <h4 className="mb-0 text-success">
                    KSh {formatMoney(totals.debitTotal)}
                  </h4>

                  <div className="avatar avatar-rounded avatar-sm bg-success-transparent position-absolute top-0 end-0 m-2 d-flex align-items-center justify-content-center">
                    <i className="ti ti-cash fs-5 text-success" />
                  </div>

                </div>
              </div>
            </div>


            <div className="col-6 col-md-3">
              <div className="card mb-0 shadow-none border">
                <div className="card-body p-3">

                  <p className="fw-medium mb-1 fs-13">
                    Total Sales
                  </p>

                  <h4 className="mb-0 text-primary">
                    KSh {formatMoney(totals.grandTotal)}
                  </h4>

                  <div className="avatar avatar-rounded avatar-sm bg-primary-transparent position-absolute top-0 end-0 m-2 d-flex align-items-center justify-content-center">
                    <i className="ti ti-shopping-cart fs-5 text-primary" />
                  </div>

                </div>
              </div>
            </div>


            <div className="col-6 col-md-3">
              <div className="card mb-0 shadow-none border">
                <div className="card-body p-3">

                  <p className="fw-medium mb-1 fs-13">
                    Customers
                  </p>

                  <h4 className="mb-0 text-info">
                    {customers.length}
                  </h4>

                  <div className="avatar avatar-rounded avatar-sm bg-info-transparent position-absolute top-0 end-0 m-2 d-flex align-items-center justify-content-center">
                    <i className="ti ti-users fs-5 text-info" />
                  </div>

                </div>
              </div>
            </div>

          </div>
        )}


        {/* -------------------------------------------------------------
            TABLE CARD
        ------------------------------------------------------------- */}

        <div className="card shadow-none border">

          {/* SEARCH / FILTER */}

          <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">

            <div
              className="input-group input-group-flat"
              style={{ maxWidth: 300 }}
            >
              <span className="input-group-text bg-transparent border-end-0">
                <i className="ti ti-search text-muted" />
              </span>

              <input
                type="text"
                className="form-control border-start-0 ps-1 fs-13"
                placeholder="Search customer, invoice, sale type…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {search && (
                <button
                  className="btn btn-sm btn-link text-muted px-2"
                  onClick={() => setSearch("")}
                >
                  <i className="ti ti-x" />
                </button>
              )}

            </div>


            <div className="d-flex gap-2 align-items-center flex-wrap">

              <select
                className="form-select form-select-sm fs-13"
                style={{ width: 170 }}
                value={loyaltyFilter}
                onChange={(e) =>
                  setLoyaltyFilter(e.target.value)
                }
              >
                <option value="all">
                  All customers
                </option>

                <option value="has">
                  Has loyalty points
                </option>

                <option value="none">
                  No loyalty points
                </option>
              </select>


              {activeFilterCount > 0 && (
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => setLoyaltyFilter("all")}
                >
                  <i className="ti ti-x me-1" />

                  Clear
                </button>
              )}

            </div>

          </div>


          {/* -------------------------------------------------------------
              TABLE
          ------------------------------------------------------------- */}

          <div className="card-body p-0">

            {loading ? (

              <div className="d-flex align-items-center justify-content-center py-5 text-muted">

                <span className="spinner-border spinner-border-sm me-2" />

                Loading customers…

              </div>

            ) : paginatedRows.length === 0 ? (

              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">

                <i className="ti ti-users fs-1 mb-2" />

                <p className="fs-14 mb-0">
                  {customers.length === 0
                    ? "No customers found."
                    : "No results match your filters."}
                </p>

              </div>

            ) : (

              <div className="table-responsive">

                <table className="table table-hover mb-0 fs-13">

                  <thead className="table-light">

                    <tr>

                                           <th>Customer</th>

                      <th>Business</th>

                      <th>Phone</th>
                      <th>Invoice</th>

                      <th>Sale Type</th>

                      <th className="text-end">
                        Total Amount
                      </th>

                      <th className="text-end">
                        Amount Paid
                      </th>

                      <th className="text-end">
                        Balance
                      </th>

                      <th>Date</th>

                      <th />

                    </tr>

                  </thead>


                  <tbody>

                    {paginatedRows.map((row, index) => {

                      const customer = row.customer;
                      const sale = row.sale;

                      const saleType =
                        getSaleType(sale);

                      const isCredit =
                        saleType === "credit";

                      const isDebit =
                        saleType === "debit";

                      return (
                        <tr
                          key={
                            sale
                              ? `${customer.id}-${sale.id || sale.order_number}`
                              : `customer-${customer.id}-${index}`
                          }
                        >

                          {/* CUSTOMER */}

                          <td className="fw-semibold text-primary">

                            <button
    className="btn btn-link p-0 fw-semibold fs-13 text-start"
    onClick={() => {
      setSelected({
        ...row.customer,
        selectedSale: row.sale,
      });
      setShowForm(true);
    }}
  >
    {customer.name}
  </button>

                          </td>


                          {/* PHONE */}
                          <td className="text-nowrap">
                            {customer.business_name || (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                                                               <td className="text-nowrap">
                            {customer.phone || <span className="text-muted">—</span>}
                            {customer.alt_phone && (
                              <div className="text-muted fs-11">{customer.alt_phone}</div>
                            )}
                          </td>
                            

                          {/* INVOICE */}

                          <td className="text-nowrap">

                            {sale?.order_number || (
                              <span className="text-muted">
                                No sales
                              </span>
                            )}

                          </td>


                          {/* SALE TYPE */}

                          <td>

                            {sale ? (
                              <span
                                className={`badge ${
                                  isCredit
                                    ? "bg-danger-transparent text-danger"
                                    : isDebit
                                      ? "bg-success-transparent text-success"
                                      : "bg-primary-transparent text-primary"
                                }`}
                              >
                                <i
                                  className={`ti ${
                                    isCredit
                                      ? "ti-arrow-down"
                                      : isDebit
                                        ? "ti-arrow-up"
                                        : "ti-receipt"
                                  } me-1`}
                                />

                                {sale.sale_type || "Sale"}
                              </span>
                            ) : (
                              <span className="text-muted">
                                —
                              </span>
                            )}

                          </td>


                          {/* TOTAL AMOUNT */}

                          <td className="text-end fw-semibold">

                            {sale ? (
                              <>
                                KSh{" "}
                                {formatMoney(
                                  sale.total_amount
                                )}
                              </>
                            ) : (
                              "—"
                            )}

                          </td>


                          {/* AMOUNT PAID */}

                          <td className="text-end text-success">

                            {sale ? (
                              <>
                                KSh{" "}
                                {formatMoney(
                                  sale.amount_paid
                                )}
                              </>
                            ) : (
                              "—"
                            )}

                          </td>


                          {/* BALANCE */}

                          {/* BALANCE */}
<td className="text-end">
  {sale ? (
    (() => {
      const bal = saleBalance(sale);
      return (
        <span className={bal > 0 ? "text-danger fw-semibold" : bal < 0 ? "text-primary fw-semibold" : "text-success"}>
          KSh {formatMoney(bal)}
        </span>
      );
    })()
  ) : (
    "—"
  )}
</td>


                          {/* DATE */}

                          <td className="text-muted text-nowrap">

                            {sale?.created_at
                              ? fmtDate(
                                  sale.created_at
                                )
                              : customer.created_at
                                ? fmtDate(
                                    customer.created_at
                                  )
                                : ""}

                          </td>


                          {/* VIEW */}
                        <td className="text-nowrap">
  <button
    className="btn btn-sm btn-outline-primary py-1 px-2 fs-11 me-1"
    onClick={() => {
      setSelected({ ...row.customer, selectedSale: row.sale });
      setShowForm(true);
    }}
  >
    <i className="ti ti-eye me-1" />View
  </button>
  <button
    className="btn btn-sm btn-outline-info py-1 px-2 fs-11 me-1"
    title="Preview statement"
    onClick={() => previewStatement(row.customer, customers)}
  >
    <i className="ti ti-file-search" />
  </button>
   <button
    className="btn btn-sm btn-outline-success py-1 px-2 fs-11 me-1"
    title="Download statement (PDF)"
    onClick={() => downloadStatement(row.customer, customers)}
  >
    <i className="ti ti-file-type-pdf" />
  </button>
  <button
    className="btn btn-sm btn-outline-secondary py-1 px-2 fs-11"
    title="Print statement"
    onClick={() => printStatement(row.customer, customers)}
  >
    <i className="ti ti-printer" />
  </button>
</td>
                        

                        </tr>
                      );
                    })}

                  </tbody>

                </table>

              </div>
            )}

          </div>


          {/* -------------------------------------------------------------
              PAGINATION
          ------------------------------------------------------------- */}

          {!loading &&
            transactionRows.length > 0 && (

              <div className="card-footer border-top py-2 px-3 d-flex align-items-center justify-content-between flex-wrap gap-2 fs-12 text-muted">

                <span>
                  Showing{" "}
                  <strong>
                    {(page - 1) * pageSize + 1}
                    –
                    {Math.min(
                      page * pageSize,
                      transactionRows.length
                    )}
                  </strong>{" "}
                  of{" "}
                  <strong>
                    {transactionRows.length}
                  </strong>{" "}
                  transaction
                  {transactionRows.length !== 1
                    ? "s"
                    : ""}
                </span>


                <div className="d-flex align-items-center gap-1">

                  <select
                    className="form-select form-select-sm fs-12 w-auto"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(
                        Number(e.target.value)
                      );

                      setPage(1);
                    }}
                  >
                    {[10, 25, 50, 100].map(
                      (n) => (
                        <option
                          key={n}
                          value={n}
                        >
                          {n} / page
                        </option>
                      )
                    )}
                  </select>


                  {totalPages > 1 && (

                    <nav className="ms-2">

                      <ul className="pagination pagination-sm mb-0">

                        <li
                          className={`page-item ${
                            page === 1
                              ? "disabled"
                              : ""
                          }`}
                        >

                          <button
                            className="page-link"
                            onClick={() =>
                              setPage(
                                (p) =>
                                  Math.max(
                                    1,
                                    p - 1
                                  )
                              )
                            }
                          >
                            <i className="ti ti-chevron-left" />
                          </button>

                        </li>


                        <li className="page-item disabled">

                          <span className="page-link">
                            {page} / {totalPages}
                          </span>

                        </li>


                        <li
                          className={`page-item ${
                            page === totalPages
                              ? "disabled"
                              : ""
                          }`}
                        >

                          <button
                            className="page-link"
                            onClick={() =>
                              setPage(
                                (p) =>
                                  Math.min(
                                    totalPages,
                                    p + 1
                                  )
                              )
                            }
                          >
                            <i className="ti ti-chevron-right" />
                          </button>

                        </li>

                      </ul>

                    </nav>

                  )}

                </div>

              </div>

            )}

        </div>

      </div>


      {/* CUSTOMER FORM */}

      <CustomerFormOffcanvas
        open={showForm}
        customer={selected}
        onClose={() => setShowForm(false)}
        onSaved={load}
      />

    </div>
  );
}
