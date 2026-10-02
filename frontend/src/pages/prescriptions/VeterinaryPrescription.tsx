import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import API from "../../services/api";

function fmtDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const COLUMNS = [
  { key: "date_of_prescription", label: "Date" },
  { key: "drug_trade_name",      label: "Drug" },
  { key: "animal_species",       label: "Species" },
  { key: "drug_category",        label: "Category" },
  { key: "prescription_target",  label: "Target" },
  { key: "name_of_the_buyer",    label: "Buyer" },
  { key: "quantity_purchased",   label: "Qty" },
  { key: "expiry_date",          label: "Expiry" },
] as const;

type Mode = "add" | "edit" | "view";

interface RxForm {
  date_of_prescription: string;
  drug_category: string;
  prescription_target: string;
  animal_species: string;
  breed: string;
  age: string;
  drug_trade_name: string;
  manufacturer: string;
  batch_no: string;
  quantity_purchased: string;
  drug_volume: string;
  dosage: string;
  clinical_use: string;
  duration_of_treatment: string;
  withdrawal_period: string;
  storage_condition: string;
  side_effect: string;
  expiry_date: string;
  name_of_the_buyer: string;
  buyer_kvb_no: string;
  buyer_licence_no: string;
  buyer_contact: string;
  vet_pharmacist_comment: string;
  signature_and_stamp: string;
}

const emptyForm: RxForm = {
  date_of_prescription: new Date().toISOString().slice(0, 10),
  drug_category: "I",
  prescription_target: "vet_surgeon",
  animal_species: "",
  breed: "",
  age: "",
  drug_trade_name: "",
  manufacturer: "",
  batch_no: "",
  quantity_purchased: "",
  drug_volume: "",
  dosage: "",
  clinical_use: "",
  duration_of_treatment: "",
  withdrawal_period: "",
  storage_condition: "",
  side_effect: "",
  expiry_date: "",
  name_of_the_buyer: "",
  buyer_kvb_no: "",
  buyer_licence_no: "",
  buyer_contact: "",
  vet_pharmacist_comment: "",
  signature_and_stamp: "",
};

const DRUG_CATEGORIES = [
  { value: "I",  label: "I" },
  { value: "II", label: "II" },
];

const PRESCRIPTION_TARGETS = [
  { value: "vet_surgeon",      label: "Vet Surgeon" },
  { value: "para_professional", label: "Para-Professional" },
];

function exportCSV(rows: any[]) {
  const headers = COLUMNS.map(c => c.label);
  const lines = [
    headers.join(","),
    ...rows.map(r => COLUMNS.map(c => `"${String(r[c.key] ?? "").replace(/"/g, '""')}"`).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `veterinary_eprescriptions_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function exportExcel(rows: any[]) {
  const headers = COLUMNS.map(c => c.label);
  const data = [headers, ...rows.map(r => COLUMNS.map(c => String(r[c.key] ?? "")))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "VetPrescriptions");
  XLSX.writeFile(wb, `veterinary_eprescriptions_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function VeterinaryEPrescriptionsList() {
  const [items, setItems]       = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  const [search, setSearch]                 = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [targetFilter, setTargetFilter]     = useState("all");

  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [mode, setMode]         = useState<Mode>("add");
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm]         = useState<RxForm>(emptyForm);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("veterinary-eprescriptions/");
      const raw: any[] = res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      setItems(raw);
    } catch (err: any) {
      if (err.response?.status === 401) window.location.href = "/login";
      else console.error("Error loading veterinary prescriptions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, categoryFilter, targetFilter]);

  useEffect(() => {
    let list = items;
    if (categoryFilter !== "all") list = list.filter(r => r.drug_category === categoryFilter);
    if (targetFilter !== "all")   list = list.filter(r => r.prescription_target === targetFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.drug_trade_name || "").toLowerCase().includes(q) ||
        (r.animal_species || "").toLowerCase().includes(q) ||
        (r.name_of_the_buyer || "").toLowerCase().includes(q) ||
        (r.manufacturer || "").toLowerCase().includes(q) ||
        (r.batch_no || "").toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }, [search, categoryFilter, targetFilter, items]);

  const openOffcanvas = () => {
    const el = document.getElementById("vet-rx-offcanvas");
    if (el) {
      const bs = (window as any).bootstrap;
      bs?.Offcanvas?.getOrCreateInstance(el)?.show();
    }
  };
  const closeOffcanvas = () => {
    const el = document.getElementById("vet-rx-offcanvas");
    if (el) {
      const bs = (window as any).bootstrap;
      bs?.Offcanvas?.getInstance(el)?.hide();
    }
  };

  const handleOpenAdd = () => {
    setMode("add");
    setSelected(null);
    setForm(emptyForm);
    setError("");
    openOffcanvas();
  };

  const handleOpenEdit = (item: any) => {
    setMode("edit");
    setSelected(item);
    setForm({
      date_of_prescription: item.date_of_prescription || "",
      drug_category: item.drug_category || "I",
      prescription_target: item.prescription_target || "vet_surgeon",
      animal_species: item.animal_species || "",
      breed: item.breed || "",
      age: item.age || "",
      drug_trade_name: item.drug_trade_name || "",
      manufacturer: item.manufacturer || "",
      batch_no: item.batch_no || "",
      quantity_purchased: item.quantity_purchased || "",
      drug_volume: item.drug_volume || "",
      dosage: item.dosage || "",
      clinical_use: item.clinical_use || "",
      duration_of_treatment: item.duration_of_treatment || "",
      withdrawal_period: item.withdrawal_period || "",
      storage_condition: item.storage_condition || "",
      side_effect: item.side_effect || "",
      expiry_date: item.expiry_date || "",
      name_of_the_buyer: item.name_of_the_buyer || "",
      buyer_kvb_no: item.buyer_kvb_no || "",
      buyer_licence_no: item.buyer_licence_no || "",
      buyer_contact: item.buyer_contact || "",
      vet_pharmacist_comment: item.vet_pharmacist_comment || "",
      signature_and_stamp: item.signature_and_stamp || "",
    });
    setError("");
    openOffcanvas();
  };

  const handleOpenView = (item: any) => {
    setMode("view");
    setSelected(item);
    openOffcanvas();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.drug_trade_name.trim())   { setError("Drug trade name is required."); return; }
    if (!form.animal_species.trim())    { setError("Animal species is required."); return; }
    if (!form.name_of_the_buyer.trim()) { setError("Buyer name is required."); return; }

    setSaving(true);
    setError("");

    const payload: any = { ...form };
    if (payload.expiry_date === "") payload.expiry_date = null;

    try {
      if (mode === "edit" && selected) {
        await API.patch(`veterinary-eprescriptions/${selected.id}/`, payload);
      } else {
        await API.post("veterinary-eprescriptions/", payload);
      }
      closeOffcanvas();
      load();
    } catch (err: any) {
      console.error("Failed to save prescription:", err);
      const data = err.response?.data;
      const msg =
        typeof data === "string" ? data
        : data?.message
        || (data && Object.values(data).flat().join(" "))
        || "Failed to save prescription.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this prescription?")) return;
    try {
      await API.delete(`veterinary-eprescriptions/${id}/`);
      load();
    } catch (err) {
      console.error("Failed to delete prescription:", err);
    }
  };

  const activeFilterCount = [categoryFilter !== "all", targetFilter !== "all"].filter(Boolean).length;

  return (
    <div className="page-wrapper">
      <div className="content">

        {/* Action Bar */}
        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <div>
            <h4 className="fw-semibold mb-1">Veterinary e-Prescriptions</h4>
            <p className="text-muted fs-13 mb-0">Record and manage veterinary prescriptions issued to buyers.</p>
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
              <i className="ti ti-plus me-1" />Add Prescription
            </button>
          </div>
        </div>

        {/* Tiles */}
        {!loading && items.length > 0 && (() => {
          const tiles = [
            { label: "Total Prescriptions", value: items.length,                                      icon: "ti-prescription",   bg: "bg-primary-gradient-100", color: "text-primary" },
            { label: "Category I",          value: items.filter(r => r.drug_category === "I").length,  icon: "ti-alert-triangle", bg: "bg-warning-gradient-100", color: "text-warning" },
            { label: "Category II",         value: items.filter(r => r.drug_category === "II").length, icon: "ti-shield-check",   bg: "bg-info-gradient-100",    color: "text-info" },
            { label: "Buyers",              value: new Set(items.map(r => r.name_of_the_buyer)).size,  icon: "ti-users",          bg: "bg-success-gradient-100", color: "text-success" },
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
                placeholder="Search drug, species, buyer…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="btn btn-sm btn-link text-muted px-2" onClick={() => setSearch("")}><i className="ti ti-x" /></button>}
            </div>
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <select className="form-select form-select-sm fs-13" style={{ width: 150 }}
                value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                <option value="all">All categories</option>
                {DRUG_CATEGORIES.map(c => <option key={c.value} value={c.value}>Category {c.label}</option>)}
              </select>
              <select className="form-select form-select-sm fs-13" style={{ width: 180 }}
                value={targetFilter} onChange={e => setTargetFilter(e.target.value)}>
                <option value="all">All targets</option>
                {PRESCRIPTION_TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {activeFilterCount > 0 && (
                <button className="btn btn-sm btn-outline-danger"
                  onClick={() => { setCategoryFilter("all"); setTargetFilter("all"); }}>
                  <i className="ti ti-x me-1" />Clear
                </button>
              )}
            </div>
          </div>

          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-5 text-muted">
                <span className="spinner-border spinner-border-sm me-2" />Loading prescriptions…
              </div>
            ) : filtered.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                <i className="ti ti-prescription fs-1 mb-2" />
                <p className="fs-14 mb-0">
                  {items.length === 0 ? "No prescriptions found." : "No results match your filters."}
                </p>
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
                        <td className="text-nowrap text-muted">{fmtDate(r.date_of_prescription)}</td>
                        <td className="fw-semibold text-dark">{r.drug_trade_name}</td>
                        <td>
                          {r.animal_species}
                          {r.breed ? <span className="text-muted"> · {r.breed}</span> : null}
                        </td>
                        <td>
                          <span className={`badge ${r.drug_category === "I"
                            ? "bg-warning-transparent text-warning"
                            : "bg-info-transparent text-info"}`}>
                            {r.drug_category}
                          </span>
                        </td>
                        <td>
                          <span className="badge bg-primary-transparent text-primary">
                            {r.prescription_target_display || r.prescription_target}
                          </span>
                        </td>
                        <td className="text-truncate" style={{ maxWidth: 180 }}>{r.name_of_the_buyer}</td>
                        <td>{r.quantity_purchased || <span className="text-muted">—</span>}</td>
                        <td className="text-nowrap text-muted">
                          {r.expiry_date ? fmtDate(r.expiry_date) : "—"}
                        </td>
                        <td className="text-end">
                          <div className="d-inline-flex gap-1">
                            <button className="btn btn-sm btn-icon btn-light" title="View" onClick={() => handleOpenView(r)}>
                              <i className="ti ti-eye text-muted" />
                            </button>
                            <button className="btn btn-sm btn-icon btn-light" title="Edit" onClick={() => handleOpenEdit(r)}>
                              <i className="ti ti-edit text-primary" />
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
                <span>Showing <strong>{start}–{end}</strong> of <strong>{filtered.length}</strong> prescriptions</span>
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
      <div className="offcanvas offcanvas-end" tabIndex={-1} id="vet-rx-offcanvas" style={{ width: "520px" }}>
        <div className="offcanvas-header bg-primary text-white py-3">
          <h5 className="offcanvas-title text-white fs-16 fw-semibold">
            {mode === "add" && "Add Veterinary Prescription"}
            {mode === "edit" && "Edit Veterinary Prescription"}
            {mode === "view" && "Prescription Details"}
          </h5>
          <button type="button" className="btn-close btn-close-white" data-bs-dismiss="offcanvas" />
        </div>

        <div className="offcanvas-body">
          {error && <div className="alert alert-danger fs-13 py-2">{error}</div>}

          {mode === "view" && selected ? (
            <ViewDetails item={selected} fmtDate={fmtDate} />
          ) : (
            <form id="vet-rx-form" onSubmit={handleSave} className="d-flex flex-column gap-3">
              <SectionTitle icon="ti-clipboard-list" title="Prescription Information" />
              <div className="row g-2">
                <Field className="col-md-6" label="Date of Prescription *">
                  <input type="date" className="form-control fs-13" required
                    value={form.date_of_prescription}
                    onChange={e => setForm({ ...form, date_of_prescription: e.target.value })} />
                </Field>
                <Field className="col-md-6" label="Drug Category *">
                  <select className="form-select fs-13" required
                    value={form.drug_category}
                    onChange={e => setForm({ ...form, drug_category: e.target.value })}>
                    {DRUG_CATEGORIES.map(c => <option key={c.value} value={c.value}>Category {c.label}</option>)}
                  </select>
                </Field>
                <Field className="col-md-6" label="Prescription Target *">
                  <select className="form-select fs-13" required
                    value={form.prescription_target}
                    onChange={e => setForm({ ...form, prescription_target: e.target.value })}>
                    {PRESCRIPTION_TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
              </div>

              <SectionTitle icon="ti-paw" title="Animal Details" />
              <div className="row g-2">
                <Field className="col-md-6" label="Animal Species *">
                  <input type="text" className="form-control fs-13" placeholder="e.g. Cattle, Goat, Sheep" required
                    value={form.animal_species}
                    onChange={e => setForm({ ...form, animal_species: e.target.value })} />
                </Field>
                <Field className="col-md-3" label="Breed">
                  <input type="text" className="form-control fs-13"
                    value={form.breed}
                    onChange={e => setForm({ ...form, breed: e.target.value })} />
                </Field>
                <Field className="col-md-3" label="Age">
                  <input type="text" className="form-control fs-13"
                    value={form.age}
                    onChange={e => setForm({ ...form, age: e.target.value })} />
                </Field>
              </div>

              <SectionTitle icon="ti-vaccine" title="Medication Details" />
              <div className="row g-2">
                <Field className="col-md-6" label="Drug Trade Name *">
                  <input type="text" className="form-control fs-13" required
                    value={form.drug_trade_name}
                    onChange={e => setForm({ ...form, drug_trade_name: e.target.value })} />
                </Field>
                <Field className="col-md-6" label="Manufacturer">
                  <input type="text" className="form-control fs-13"
                    value={form.manufacturer}
                    onChange={e => setForm({ ...form, manufacturer: e.target.value })} />
                </Field>
                <Field className="col-md-4" label="Batch No.">
                  <input type="text" className="form-control fs-13"
                    value={form.batch_no}
                    onChange={e => setForm({ ...form, batch_no: e.target.value })} />
                </Field>
                <Field className="col-md-4" label="Quantity Purchased">
                  <input type="text" className="form-control fs-13"
                    value={form.quantity_purchased}
                    onChange={e => setForm({ ...form, quantity_purchased: e.target.value })} />
                </Field>
                <Field className="col-md-4" label="Drug Volume">
                  <input type="text" className="form-control fs-13"
                    value={form.drug_volume}
                    onChange={e => setForm({ ...form, drug_volume: e.target.value })} />
                </Field>
                <Field className="col-12" label="Dosage">
                  <input type="text" className="form-control fs-13"
                    value={form.dosage}
                    onChange={e => setForm({ ...form, dosage: e.target.value })} />
                </Field>
              </div>

              <SectionTitle icon="ti-heart-rate-monitor" title="Treatment Metrics" />
              <div className="row g-2">
                <Field className="col-12" label="Clinical Use">
                  <input type="text" className="form-control fs-13"
                    value={form.clinical_use}
                    onChange={e => setForm({ ...form, clinical_use: e.target.value })} />
                </Field>
                <Field className="col-md-6" label="Duration of Treatment">
                  <input type="text" className="form-control fs-13"
                    value={form.duration_of_treatment}
                    onChange={e => setForm({ ...form, duration_of_treatment: e.target.value })} />
                </Field>
                <Field className="col-md-6" label="Withdrawal Period">
                  <input type="text" className="form-control fs-13"
                    value={form.withdrawal_period}
                    onChange={e => setForm({ ...form, withdrawal_period: e.target.value })} />
                </Field>
                <Field className="col-md-6" label="Storage Condition">
                  <input type="text" className="form-control fs-13"
                    value={form.storage_condition}
                    onChange={e => setForm({ ...form, storage_condition: e.target.value })} />
                </Field>
                <Field className="col-md-6" label="Expiry Date">
                  <input type="date" className="form-control fs-13"
                    value={form.expiry_date}
                    onChange={e => setForm({ ...form, expiry_date: e.target.value })} />
                </Field>
                <Field className="col-12" label="Side Effect">
                  <textarea rows={2} className="form-control fs-13"
                    value={form.side_effect}
                    onChange={e => setForm({ ...form, side_effect: e.target.value })} />
                </Field>
              </div>

              <SectionTitle icon="ti-user" title="Buyer Credentials" />
              <div className="row g-2">
                <Field className="col-md-6" label="Buyer Name *">
                  <input type="text" className="form-control fs-13" required
                    value={form.name_of_the_buyer}
                    onChange={e => setForm({ ...form, name_of_the_buyer: e.target.value })} />
                </Field>
                <Field className="col-md-6" label="K.V.B No.">
                  <input type="text" className="form-control fs-13"
                    value={form.buyer_kvb_no}
                    onChange={e => setForm({ ...form, buyer_kvb_no: e.target.value })} />
                </Field>
                <Field className="col-md-6" label="Licence No.">
                  <input type="text" className="form-control fs-13"
                    value={form.buyer_licence_no}
                    onChange={e => setForm({ ...form, buyer_licence_no: e.target.value })} />
                </Field>
                <Field className="col-md-6" label="Contact">
                  <input type="text" className="form-control fs-13"
                    value={form.buyer_contact}
                    onChange={e => setForm({ ...form, buyer_contact: e.target.value })} />
                </Field>
              </div>

              <SectionTitle icon="ti-message-2" title="Comments & Verification" />
              <Field label="Vet / Pharmacist Comment">
                <textarea rows={2} className="form-control fs-13"
                  value={form.vet_pharmacist_comment}
                  onChange={e => setForm({ ...form, vet_pharmacist_comment: e.target.value })} />
              </Field>
              <Field label="Signature & Stamp">
                <input type="text" className="form-control fs-13"
                  placeholder="Verification string or signature link"
                  value={form.signature_and_stamp}
                  onChange={e => setForm({ ...form, signature_and_stamp: e.target.value })} />
              </Field>
            </form>
          )}
        </div>

        <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-sm btn-light border" data-bs-dismiss="offcanvas">
            {mode === "view" ? "Close" : "Cancel"}
          </button>
          {mode !== "view" && (
            <button type="submit" form="vet-rx-form" className="btn btn-sm btn-primary px-3" disabled={saving}>
              {saving ? <span className="spinner-border spinner-border-sm me-1" /> : null}
              {mode === "edit" ? "Update Prescription" : "Save Prescription"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Small helpers ---------- */
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

function ViewDetails({ item, fmtDate }: { item: any; fmtDate: (s?: string) => string }) {
  return (
    <div className="d-flex flex-column gap-3 fs-13">
      <SectionTitle icon="ti-clipboard-list" title="Prescription Information" />
      <div className="row g-3">
        <div className="col-6"><ViewRow label="DATE" value={fmtDate(item.date_of_prescription)} /></div>
        <div className="col-6"><ViewRow label="DRUG CATEGORY" value={`Category ${item.drug_category}`} /></div>
        <div className="col-6"><ViewRow label="TARGET" value={item.prescription_target_display || item.prescription_target} /></div>
        <div className="col-6"><ViewRow label="RECORDED BY" value={item.user_name} /></div>
      </div>

      <SectionTitle icon="ti-paw" title="Animal Details" />
      <div className="row g-3">
        <div className="col-6"><ViewRow label="SPECIES" value={item.animal_species} /></div>
        <div className="col-6"><ViewRow label="BREED" value={item.breed} /></div>
        <div className="col-6"><ViewRow label="AGE" value={item.age} /></div>
      </div>

      <SectionTitle icon="ti-vaccine" title="Medication Details" />
      <div className="row g-3">
        <div className="col-6"><ViewRow label="TRADE NAME" value={item.drug_trade_name} /></div>
        <div className="col-6"><ViewRow label="MANUFACTURER" value={item.manufacturer} /></div>
        <div className="col-4"><ViewRow label="BATCH NO." value={item.batch_no} /></div>
        <div className="col-4"><ViewRow label="QTY" value={item.quantity_purchased} /></div>
        <div className="col-4"><ViewRow label="VOLUME" value={item.drug_volume} /></div>
        <div className="col-12"><ViewRow label="DOSAGE" value={item.dosage} /></div>
      </div>

      <SectionTitle icon="ti-heart-rate-monitor" title="Treatment Metrics" />
      <div className="row g-3">
        <div className="col-12"><ViewRow label="CLINICAL USE" value={item.clinical_use} /></div>
        <div className="col-6"><ViewRow label="DURATION" value={item.duration_of_treatment} /></div>
        <div className="col-6"><ViewRow label="WITHDRAWAL PERIOD" value={item.withdrawal_period} /></div>
        <div className="col-6"><ViewRow label="STORAGE" value={item.storage_condition} /></div>
        <div className="col-6"><ViewRow label="EXPIRY" value={item.expiry_date ? fmtDate(item.expiry_date) : ""} /></div>
        <div className="col-12"><ViewRow label="SIDE EFFECT" value={item.side_effect} /></div>
      </div>

      <SectionTitle icon="ti-user" title="Buyer Credentials" />
      <div className="row g-3">
        <div className="col-6"><ViewRow label="BUYER NAME" value={item.name_of_the_buyer} /></div>
        <div className="col-6"><ViewRow label="K.V.B NO." value={item.buyer_kvb_no} /></div>
        <div className="col-6"><ViewRow label="LICENCE NO." value={item.buyer_licence_no} /></div>
        <div className="col-6"><ViewRow label="CONTACT" value={item.buyer_contact} /></div>
      </div>

      <SectionTitle icon="ti-message-2" title="Comments & Verification" />
      <ViewRow label="VET / PHARMACIST COMMENT" value={item.vet_pharmacist_comment} />
      <ViewRow label="SIGNATURE & STAMP" value={item.signature_and_stamp} />
    </div>
  );
}