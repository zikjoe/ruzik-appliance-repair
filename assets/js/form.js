/* ============================================================
   RUZIK APPLIANCE REPAIR — FORM JS
   Lead capture form validation and submission
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  const form = document.getElementById('contact-form');
  if (!form) return;

  const submitBtn = form.querySelector('[type="submit"]');
  const successMsg = document.getElementById('form-success');
  const errorMsg = document.getElementById('form-error');

  // ── VALIDATION RULES ───────────────────────────────────────
  const validators = {
    name: value => value.trim().length >= 2,
    phone: value => /^[\d\s\(\)\-\+]{10,}$/.test(value.trim()),
    email: value => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), // optional
    appliance: value => value !== '',
    message: value => value.trim().length >= 10,
  };

  const errorMessages = {
    name: 'Please enter your full name.',
    phone: 'Please enter a valid phone number.',
    email: 'Please enter a valid email address.',
    appliance: 'Please select the appliance type.',
    message: 'Please describe the issue (at least 10 characters).',
  };

  function validateField(field) {
    const name = field.name;
    const validator = validators[name];
    if (!validator) return true;

    const valid = validator(field.value);
    const errorEl = document.getElementById(`error-${name}`);

    field.classList.toggle('input--error', !valid);
    field.classList.toggle('input--valid', valid);

    if (errorEl) {
      errorEl.textContent = valid ? '' : errorMessages[name];
      errorEl.style.display = valid ? 'none' : 'block';
    }

    return valid;
  }

  // Validate on blur
  form.querySelectorAll('input, select, textarea').forEach(field => {
    field.addEventListener('blur', () => validateField(field));
    field.addEventListener('input', () => {
      if (field.classList.contains('input--error')) validateField(field);
    });
  });

  // ── FORM SUBMISSION ────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate all fields
    const fields = form.querySelectorAll('input[name], select[name], textarea[name]');
    let allValid = true;
    fields.forEach(field => {
      if (!validateField(field)) allValid = false;
    });

    if (!allValid) return;

    // Disable button and show loading state
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';
    if (errorMsg) errorMsg.style.display = 'none';

    try {
      const data = new FormData(form);
      const response = await fetch(form.action, {
        method: 'POST',
        body: data,
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        form.style.display = 'none';
        if (successMsg) successMsg.style.display = 'block';
        // Fire GA event if available
        if (typeof gtag === 'function') {
          gtag('event', 'lead_submitted', { event_category: 'contact_form' });
        }
      } else {
        throw new Error('Server error');
      }
    } catch (err) {
      if (errorMsg) errorMsg.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Request';
    }
  });

});
