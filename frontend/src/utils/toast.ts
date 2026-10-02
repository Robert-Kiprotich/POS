/**
 * toast.ts — Branded SweetAlert2 helpers
 *
 * Replaces all browser alert() / confirm() calls with styled popups
 * matching the red-orange premium theme.
 *
 * Usage:
 *   import { toast, confirm, alertSuccess, alertError } from '@/utils/toast';
 *
 *   toast.success('Saved!');
 *   toast.error('Something went wrong.');
 *   const ok = await confirm('Delete this item?');
 *   if (ok) { ... }
 */

import Swal from 'sweetalert2';

// ── Brand colours ─────────────────────────────────────────────────────────────
const PRIMARY   = '#E41F07';   // red
const SECONDARY = '#FFA201';   // orange
const SUCCESS   = '#10B981';
const DARK      = '#1e1e2d';

// ── Base Swal instance with shared styles ─────────────────────────────────────
const BaseSwal = Swal.mixin({
  customClass: {
    popup:          'holla-popup',
    confirmButton:  'holla-btn-confirm',
    cancelButton:   'holla-btn-cancel',
    denyButton:     'holla-btn-deny',
    title:          'holla-title',
    htmlContainer:  'holla-body',
  },
  buttonsStyling: false,   // we style via CSS classes
  showClass:  { popup: 'animate__animated animate__fadeInDown animate__faster' },
  hideClass:  { popup: 'animate__animated animate__fadeOutUp animate__faster' },
});

// Inject styles once
if (typeof document !== 'undefined') {
  const id = '__holla_swal_styles__';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      /* Popup container */
      .holla-popup {
        border-radius: 14px !important;
        padding: 28px 24px 24px !important;
        font-family: inherit !important;
        box-shadow: 0 20px 60px rgba(0,0,0,0.18) !important;
        border-top: 4px solid ${PRIMARY} !important;
        max-width: 440px !important;
      }
      /* Title */
      .holla-title {
        font-size: 1.1rem !important;
        font-weight: 700 !important;
        color: ${DARK} !important;
        margin-bottom: 4px !important;
      }
      /* Body text */
      .holla-body {
        font-size: 0.875rem !important;
        color: #555 !important;
      }
      /* Buttons */
      .holla-btn-confirm, .holla-btn-cancel, .holla-btn-deny {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 9px 22px !important;
        border-radius: 8px !important;
        font-size: 0.875rem !important;
        font-weight: 600 !important;
        border: none !important;
        cursor: pointer;
        transition: opacity .15s, transform .1s;
      }
      .holla-btn-confirm:hover, .holla-btn-cancel:hover, .holla-btn-deny:hover {
        opacity: 0.88;
        transform: translateY(-1px);
      }
      .holla-btn-confirm  { background: ${PRIMARY}   !important; color: #fff !important; }
      .holla-btn-cancel   { background: #f3f4f6      !important; color: #374151 !important; }
      .holla-btn-deny     { background: ${SECONDARY} !important; color: #fff !important; }

      /* Toast (small non-blocking notification) */
      .holla-toast {
        border-radius: 10px !important;
        padding: 12px 16px !important;
        font-size: 0.875rem !important;
        font-weight: 500 !important;
        box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
      }
      .holla-toast .swal2-title {
        font-size: 0.875rem !important;
        font-weight: 600 !important;
        color: ${DARK} !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      /* SweetAlert2 icon tweaks */
      .holla-popup .swal2-icon {
        margin-top: 0 !important;
        margin-bottom: 12px !important;
        transform: scale(0.85);
      }
      /* Actions row */
      .holla-popup .swal2-actions {
        margin-top: 20px !important;
        gap: 10px !important;
      }
    `;
    document.head.appendChild(style);
  }
}

// ── Toast (small, auto-dismissing, top-right) ─────────────────────────────────
const Toast = BaseSwal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
  customClass: {
    popup: 'holla-toast',
  },
});

export const toast = {
  success: (msg: string) => Toast.fire({ icon: 'success', title: msg }),
  error:   (msg: string) => Toast.fire({ icon: 'error',   title: msg }),
  info:    (msg: string) => Toast.fire({ icon: 'info',    title: msg }),
  warning: (msg: string) => Toast.fire({ icon: 'warning', title: msg }),
};

// ── Confirm dialog ────────────────────────────────────────────────────────────
export async function confirm(
  message: string,
  options?: {
    title?: string;
    confirmText?: string;
    cancelText?: string;
    icon?: 'warning' | 'question' | 'info';
    danger?: boolean;   // true → confirm button uses danger red
  }
): Promise<boolean> {
  const result = await BaseSwal.fire({
    icon:              options?.icon ?? 'question',
    title:             options?.title ?? 'Are you sure?',
    html:              `<span>${message}</span>`,
    showCancelButton:  true,
    confirmButtonText: options?.confirmText ?? 'Yes, proceed',
    cancelButtonText:  options?.cancelText  ?? 'Cancel',
    reverseButtons:    true,
    customClass: {
      popup:         'holla-popup',
      confirmButton: options?.danger !== false ? 'holla-btn-confirm' : 'holla-btn-deny',
      cancelButton:  'holla-btn-cancel',
      title:         'holla-title',
      htmlContainer: 'holla-body',
    },
  });
  return result.isConfirmed;
}

// ── One-off convenience helpers ───────────────────────────────────────────────
export function alertSuccess(msg: string, title = 'Success') {
  return BaseSwal.fire({
    icon:  'success',
    title,
    html:  `<span>${msg}</span>`,
    confirmButtonText: 'OK',
  });
}

export function alertError(msg: string, title = 'Error') {
  return BaseSwal.fire({
    icon:  'error',
    title,
    html:  `<span>${msg}</span>`,
    confirmButtonText: 'OK',
  });
}

export function alertInfo(msg: string, title = 'Info') {
  return BaseSwal.fire({
    icon:  'info',
    title,
    html:  `<span>${msg}</span>`,
    confirmButtonText: 'OK',
  });
}
