import React from "react";

export type Mode = "add" | "edit" | "view";

export interface CategoryForm {
  name: string;
  description: string;
  is_active: boolean;
}

interface CategoryOffcanvasProps {
  mode: Mode;
  selectedCategory: any | null;
  form: CategoryForm;
  setForm: React.Dispatch<React.SetStateAction<CategoryForm>>;
  saving: boolean;
  error: string;
  onSave: (e: React.FormEvent) => void;
  fmtDate: (iso: string) => string;
}

export default function CategoryOffcanvas({
  mode,
  selectedCategory,
  form,
  setForm,
  saving,
  error,
  onSave,
  fmtDate,
}: CategoryOffcanvasProps) {
  return (
    <div
      className="offcanvas offcanvas-end"
      tabIndex={-1}
      id="category-offcanvas"
      aria-labelledby="categoryOffcanvasLabel"
      style={{ width: "380px" }}
    >
      {/* HEADER */}
      <div className="offcanvas-header bg-primary text-white py-3">
        <h5 className="offcanvas-title text-white fs-15 fw-semibold" id="categoryOffcanvasLabel">
          {mode === "add" && "Add New Category"}
          {mode === "edit" && "Edit Category"}
          {mode === "view" && "Category Details"}
        </h5>
        <button
          type="button"
          className="btn-close btn-close-white"
          data-bs-dismiss="offcanvas"
          aria-label="Close"
        />
      </div>

      {/* BODY */}
      <div className="offcanvas-body">
        {error && <div className="alert alert-danger fs-13 py-2">{error}</div>}

        {mode === "view" && selectedCategory ? (
          /* VIEW MODE */
          <div className="d-flex flex-column gap-3 fs-13">
            <div>
              <label className="text-muted fs-12 fw-medium d-block mb-1">NAME</label>
              <span className="fw-semibold text-dark fs-14">{selectedCategory.name}</span>
            </div>
            <div>
              <label className="text-muted fs-12 fw-medium d-block mb-1">DESCRIPTION</label>
              <span>{selectedCategory.description || <em className="text-muted">No description provided</em>}</span>
            </div>
            <div>
              <label className="text-muted fs-12 fw-medium d-block mb-1">TOTAL PRODUCTS</label>
              <span className="badge bg-info-transparent text-info">
                {selectedCategory.product_count ?? 0} Products
              </span>
            </div>
            <div>
              <label className="text-muted fs-12 fw-medium d-block mb-1">STATUS</label>
              {selectedCategory.is_active ? (
                <span className="badge bg-success-transparent text-success">Active</span>
              ) : (
                <span className="badge bg-secondary-transparent text-secondary">Inactive</span>
              )}
            </div>
            <div>
              <label className="text-muted fs-12 fw-medium d-block mb-1">CREATED AT</label>
              <span>{fmtDate(selectedCategory.created_at)}</span>
            </div>
          </div>
        ) : (
          /* ADD / EDIT MODE */
          <form id="category-form" onSubmit={onSave} className="d-flex flex-column gap-3">
            {/* Category Name Input */}
            <div>
              <label htmlFor="cat-name" className="form-label fs-13 fw-medium mb-1">
                Category Name <span className="text-danger">*</span>
              </label>
              <input
                id="cat-name"
                type="text"
                className="form-control fs-13"
                placeholder="Enter category name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {/* Category Description Input */}
            <div>
              <label htmlFor="cat-desc" className="form-label fs-13 fw-medium mb-1">
                Description
              </label>
              <textarea
                id="cat-desc"
                className="form-control fs-13"
                rows={3}
                placeholder="Enter category description..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            {/* Active Status Switch */}
            <div className="form-check form-switch pt-1">
              <input
                className="form-check-input"
                type="checkbox"
                role="switch"
                id="is_active_switch"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <label className="form-check-label fs-13 ms-1" htmlFor="is_active_switch">
                Active Status
              </label>
            </div>
          </form>
        )}
      </div>

      {/* FOOTER */}
      <div className="offcanvas-footer border-top p-3 d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-sm btn-light border" data-bs-dismiss="offcanvas">
          {mode === "view" ? "Close" : "Cancel"}
        </button>
        {mode !== "view" && (
          <button type="submit" form="category-form" className="btn btn-sm btn-primary px-3" disabled={saving}>
            {saving && <span className="spinner-border spinner-border-sm me-1" role="status" />}
            {mode === "edit" ? "Update Category" : "Save Category"}
          </button>
        )}
      </div>
    </div>
  );
}