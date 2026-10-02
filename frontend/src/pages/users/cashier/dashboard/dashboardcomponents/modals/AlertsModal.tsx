
import React from 'react';
import Swal from 'sweetalert2';

// ── SweetAlert Component ──────────────────────────────────────────────────────

interface SweetAlertProps {
  type: 'info' | 'warning' | 'error' | 'success' | 'question' | 'confirm';

  title?: string;
  message?: string;

  buttonText?: string;

  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;

  showCancelButton?: boolean;

  confirmButtonColor?: string;
  cancelButtonColor?: string;

  timer?: number;

  className?: string;
  children?: React.ReactNode;

  confirmButtonText?: string;
  cancelButtonText?: string;

  showConfirmButton?: boolean;

  // Optional messages shown after the action
  successTitle?: string;
  successMessage?: string;
  successIcon?: 'success' | 'info' | 'warning' | 'error' | 'question';

  cancelTitle?: string;
  cancelMessage?: string;
  cancelIcon?: 'success' | 'info' | 'warning' | 'error' | 'question';

  // Whether to show a success message after confirmation
  showSuccessMessage?: boolean;

  // Whether to show a cancelled message after cancellation
  showCancelMessage?: boolean;
}

const alertConfigs = {
  info: {
    icon: 'info' as const,
    confirmButtonColor: '#0d6efd',
  },

  warning: {
    icon: 'warning' as const,
    confirmButtonColor: '#ffc107',
  },

  error: {
    icon: 'error' as const,
    confirmButtonColor: '#dc3545',
  },

  success: {
    icon: 'success' as const,
    confirmButtonColor: '#198754',
  },

  question: {
    icon: 'question' as const,
    confirmButtonColor: '#6c757d',
  },

  confirm: {
    icon: 'warning' as const,
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
  },
};

const SweetAlert: React.FC<SweetAlertProps> = ({
  type,

  title = '',
  message = '',

  buttonText = 'OK',

  onConfirm,
  onCancel,

  showCancelButton = false,

  confirmButtonColor,
  cancelButtonColor = '#6c757d',

  timer,

  className = '',
  children,

  confirmButtonText,
  cancelButtonText = 'Cancel',

  showConfirmButton = true,

  successTitle = 'Success!',
  successMessage = 'Action completed successfully.',
  successIcon = 'success',

  cancelTitle = 'Cancelled',
  cancelMessage = 'Action cancelled.',
  cancelIcon = 'error',

  showSuccessMessage = false,
  showCancelMessage = false,
}) => {
  const config = alertConfigs[type];

  const capitalizeFirstLetter = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const handleClick = async () => {

    // ─────────────────────────────────────────────────────────────
    // CONFIRMATION TYPE
    // ─────────────────────────────────────────────────────────────

    if (type === 'confirm') {
      const result = await Swal.fire({
        title: title || 'Are you sure?',
        text: message || 'Please confirm this action.',

        icon: config.icon,

        showCancelButton: true,

        confirmButtonColor:
          confirmButtonColor || config.confirmButtonColor,

        cancelButtonColor:
          cancelButtonColor || config.cancelButtonColor,

        confirmButtonText:
          confirmButtonText || 'Confirm',

        cancelButtonText,

        timer,

        allowOutsideClick: false,
      });

      // ───────────────────────────────────────────────────────────
      // CONFIRMED
      // ───────────────────────────────────────────────────────────

      if (result.isConfirmed) {

        if (onConfirm) {
          await onConfirm();
        }

        if (showSuccessMessage) {
          await Swal.fire({
            title: successTitle,
            text: successMessage,
            icon: successIcon,
            confirmButtonColor: '#198754',
            timer: 2000,
            timerProgressBar: true,
          });
        }

      }

      // ───────────────────────────────────────────────────────────
      // CANCELLED
      // ───────────────────────────────────────────────────────────

      else if (
        result.dismiss === Swal.DismissReason.cancel ||
        result.dismiss === Swal.DismissReason.backdrop
      ) {

        if (onCancel) {
          await onCancel();
        }

        if (showCancelMessage) {
          await Swal.fire({
            title: cancelTitle,
            text: cancelMessage,
            icon: cancelIcon,
            confirmButtonColor: '#dc3545',
            timer: 2000,
            timerProgressBar: true,
          });
        }
      }

      return;
    }

    // ─────────────────────────────────────────────────────────────
    // OTHER ALERT TYPES
    // ─────────────────────────────────────────────────────────────

    if (!showConfirmButton) {

      await Swal.fire({
        title: title || capitalizeFirstLetter(type),
        text: message,

        icon: config.icon,

        confirmButtonColor:
          confirmButtonColor || config.confirmButtonColor,

        timer: timer || 2000,

        showConfirmButton: false,

        allowOutsideClick: true,
      });

      if (onConfirm) {
        await onConfirm();
      }

      return;
    }

    const result = await Swal.fire({
      title: title || capitalizeFirstLetter(type),

      text: message,

      icon: config.icon,

      confirmButtonText: buttonText,

      showCancelButton,

      cancelButtonText,

      confirmButtonColor:
        confirmButtonColor || config.confirmButtonColor,

      cancelButtonColor,

      timer,

      allowOutsideClick: false,
    });

    if (result.isConfirmed && onConfirm) {
      await onConfirm();
    }

    else if (result.isDismissed && onCancel) {
      await onCancel();
    }
  };

  // ─────────────────────────────────────────────────────────────
  // DON'T RENDER BUTTON
  // ─────────────────────────────────────────────────────────────

  if (!children && !showConfirmButton) {
    return null;
  }

  return (
    <button
      className={`btn btn-${type === 'confirm' ? 'danger' : type} ${className}`}
      onClick={handleClick}
      type="button"
    >
      {children || `${capitalizeFirstLetter(type)} Alert`}
    </button>
  );
};


// ── Individual Alert Components ──────────────────────────────────────────────

export const InfoAlert: React.FC<Omit<SweetAlertProps, 'type'>> = (props) => (
  <SweetAlert type="info" {...props} />
);

export const WarningAlert: React.FC<Omit<SweetAlertProps, 'type'>> = (props) => (
  <SweetAlert type="warning" {...props} />
);

export const ErrorAlert: React.FC<Omit<SweetAlertProps, 'type'>> = (props) => (
  <SweetAlert type="error" {...props} />
);

export const SuccessAlert: React.FC<Omit<SweetAlertProps, 'type'>> = (props) => (
  <SweetAlert type="success" {...props} />
);

export const QuestionAlert: React.FC<Omit<SweetAlertProps, 'type'>> = (props) => (
  <SweetAlert type="question" {...props} />
);

export const ConfirmAlert: React.FC<Omit<SweetAlertProps, 'type'>> = (props) => (
  <SweetAlert type="confirm" {...props} />
);


// ── Custom Alert Hook ─────────────────────────────────────────────────────────

export const useSweetAlert = () => {

  const showAlert = async ({
    type,

    title,
    message,

    confirmButtonText = 'OK',
    cancelButtonText = 'Cancel',

    showCancelButton = false,

    confirmButtonColor,
    cancelButtonColor = '#6c757d',

    timer,

    onConfirm,
    onCancel,

  }: {
    type: 'info' | 'warning' | 'error' | 'success' | 'question';

    title?: string;
    message?: string;

    confirmButtonText?: string;
    cancelButtonText?: string;

    showCancelButton?: boolean;

    confirmButtonColor?: string;
    cancelButtonColor?: string;

    timer?: number;

    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void | Promise<void>;
  }) => {

    const config = alertConfigs[type];

    const result = await Swal.fire({
      title: title || capitalizeFirstLetter(type),

      text: message,

      icon: config.icon,

      confirmButtonText,

      cancelButtonText,

      showCancelButton,

      confirmButtonColor:
        confirmButtonColor || config.confirmButtonColor,

      cancelButtonColor,

      timer,

      allowOutsideClick: false,
    });

    if (result.isConfirmed && onConfirm) {
      await onConfirm();
    }

    else if (result.isDismissed && onCancel) {
      await onCancel();
    }

    return result;
  };


  // ─────────────────────────────────────────────────────────────
  // GENERIC CONFIRMATION
  // ─────────────────────────────────────────────────────────────

  const showConfirm = async ({
    title = 'Are you sure?',
    message = 'Please confirm this action.',

    confirmButtonText = 'Confirm',
    cancelButtonText = 'Cancel',

    confirmButtonColor = '#3085d6',
    cancelButtonColor = '#d33',

    onConfirm,
    onCancel,

    showSuccessMessage = false,

    successTitle = 'Success!',
    successMessage = 'Action completed successfully.',

    showCancelMessage = false,

    cancelTitle = 'Cancelled',
    cancelMessage = 'Action cancelled.',

  }: {
    title?: string;
    message?: string;

    confirmButtonText?: string;
    cancelButtonText?: string;

    confirmButtonColor?: string;
    cancelButtonColor?: string;

    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void | Promise<void>;

    showSuccessMessage?: boolean;

    successTitle?: string;
    successMessage?: string;

    showCancelMessage?: boolean;

    cancelTitle?: string;
    cancelMessage?: string;

  }) => {

    const result = await Swal.fire({

      title,

      text: message,

      icon: 'warning',

      showCancelButton: true,

      confirmButtonColor,

      cancelButtonColor,

      confirmButtonText,

      cancelButtonText,

      allowOutsideClick: false,
    });


    // ───────────────────────────────────────────────────────────
    // CONFIRMED
    // ───────────────────────────────────────────────────────────

    if (result.isConfirmed) {

      if (onConfirm) {
        await onConfirm();
      }

      if (showSuccessMessage) {
        await Swal.fire({
          title: successTitle,
          text: successMessage,
          icon: 'success',
          confirmButtonColor: '#198754',
          timer: 2000,
          timerProgressBar: true,
        });
      }

      return true;
    }


    // ───────────────────────────────────────────────────────────
    // CANCELLED
    // ───────────────────────────────────────────────────────────

    if (
      result.dismiss === Swal.DismissReason.cancel ||
      result.dismiss === Swal.DismissReason.backdrop
    ) {

      if (onCancel) {
        await onCancel();
      }

      if (showCancelMessage) {
        await Swal.fire({
          title: cancelTitle,
          text: cancelMessage,
          icon: 'error',
          confirmButtonColor: '#dc3545',
          timer: 2000,
          timerProgressBar: true,
        });
      }

      return false;
    }

    return false;
  };


  const capitalizeFirstLetter = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };


  return {
    showAlert,
    showConfirm,
  };
};


// ── Quick Functions ──────────────────────────────────────────────────────────

export const showInfo = (
  message: string,
  title?: string,
  timer?: number
) => {
  return Swal.fire({
    title: title || 'Info',
    text: message,
    icon: 'info',
    confirmButtonColor: '#0d6efd',
    timer: timer || 2000,
    timerProgressBar: true,
  });
};


export const showWarning = (
  message: string,
  title?: string,
  timer?: number
) => {
  return Swal.fire({
    title: title || 'Warning',
    text: message,
    icon: 'warning',
    confirmButtonColor: '#ffc107',
    timer: timer || 2000,
    timerProgressBar: true,
  });
};


export const showError = (
  message: string,
  title?: string,
  timer?: number
) => {
  return Swal.fire({
    title: title || 'Error',
    text: message,
    icon: 'error',
    confirmButtonColor: '#dc3545',
    timer: timer || 3000,
    timerProgressBar: true,
  });
};


export const showSuccess = (
  message: string,
  title?: string,
  timer?: number
) => {
  return Swal.fire({
    title: title || 'Success',
    text: message,
    icon: 'success',
    confirmButtonColor: '#198754',
    timer: timer || 2000,
    timerProgressBar: true,
  });
};


// ── Generic Quick Confirmation ───────────────────────────────────────────────

export const showConfirm = async (
  message: string = 'Please confirm this action.',
  title: string = 'Are you sure?',
  confirmButtonText: string = 'Confirm',
  cancelButtonText: string = 'Cancel',
  successTitle?: string,
  successMessage?: string,
) => {

  const result = await Swal.fire({

    title,

    text: message,

    icon: 'warning',

    showCancelButton: true,

    confirmButtonColor: '#3085d6',

    cancelButtonColor: '#d33',

    confirmButtonText,

    cancelButtonText,

    allowOutsideClick: false,
  });


  if (result.isConfirmed) {

    if (successTitle || successMessage) {

      await Swal.fire({
        title: successTitle || 'Success!',
        text: successMessage || 'Action completed successfully.',
        icon: 'success',
        confirmButtonColor: '#198754',
        timer: 2000,
        timerProgressBar: true,
      });

    }

    return true;
  }


  if (
    result.dismiss === Swal.DismissReason.cancel ||
    result.dismiss === Swal.DismissReason.backdrop
  ) {

    return false;
  }


  return false;
};

export default SweetAlert;
