/* ============================================================
   RUZIK APPLIANCE REPAIR — FORM JS
   Handles validation, AJAX submission to Netlify Forms,
   and redirect to thank-you page on success.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  const form = document.getElementById('contact-form');
  if (!form) return;

  const submitBtn = form.querySelector('[type="submit"]');
  const errorMsg  = document.getElementById('form-error');

  // ── VALIDATION RULES ───────────────────────────────────────
  // Keys match the `name` attribute of each field.
  const validators = {
    name:           v => v.trim().length >= 2,
    phone:          v => /^[\d\s\(\)\-\+]{10,}$/.test(v.trim()),
    email:          v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), // optional
    'service-type': () => !!form.querySelector('[name="service-type"]:checked'),
    appliance:      v => v !== '',
    message:        v => v.trim().length >= 10,
    zip:            v => /^\d{5}$/.test(v.trim()),
  };

  const errorMessages = {
    name:           'Please enter your full name.',
    phone:          'Please enter a valid phone number.',
    email:          'Please enter a valid email address.',
    'service-type': 'Please select Repair or Installation.',
    appliance:      'Please select the appliance type.',
    message:        'Please describe the issue (at least 10 characters).',
    zip:            'Please enter a valid 5-digit ZIP code.',
  };

  // ── SINGLE FIELD VALIDATION ────────────────────────────────
  function validateField(field) {
    const name      = field.name;
    const validator = validators[name];
    if (!validator) return true;

    const isRadio = field.type === 'radio';
    const valid   = isRadio
      ? !!form.querySelector(`[name="${name}"]:checked`)
      : validator(field.value);

    // Apply error/valid CSS classes (skip for radio buttons — style handled by CSS :has)
    if (!isRadio) {
      field.classList.toggle('input--error', !valid);
      field.classList.toggle('input--valid',  valid && field.value !== '');
    }

    // Show or hide the error message span
    const errorEl = document.getElementById(`error-${name}`);
    if (errorEl) {
      errorEl.textContent  = valid ? '' : errorMessages[name];
      errorEl.style.display = valid ? 'none' : 'block';
    }

    return valid;
  }

  // ── LIVE VALIDATION LISTENERS ──────────────────────────────
  // Validate on blur; re-validate on input/change if field already has an error.
  form.querySelectorAll('input, select, textarea').forEach(field => {
    field.addEventListener('blur',   () => validateField(field));
    field.addEventListener('change', () => validateField(field));
    field.addEventListener('input',  () => {
      if (field.classList.contains('input--error')) validateField(field);
    });
  });

  // ── FORM SUBMISSION ────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Run validation on all fields, deduplicating radio groups
    let allValid = true;
    const checkedGroups = new Set();

    form.querySelectorAll('input[name], select[name], textarea[name]').forEach(field => {
      // Only validate the first radio in each named group
      if (field.type === 'radio') {
        if (checkedGroups.has(field.name)) return;
        checkedGroups.add(field.name);
      }
      if (!validateField(field)) allValid = false;
    });

    if (!allValid) {
      // Scroll to the first error so mobile users see it
      const firstError = form.querySelector('.input--error, .form-error[style*="block"]');
      if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Show loading state
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Sending…';
    if (errorMsg) errorMsg.style.display = 'none';

    try {
      // Netlify Forms requires application/x-www-form-urlencoded for reliable AJAX.
      // Do NOT use plain FormData — it can silently fail.
      const body = new URLSearchParams(new FormData(form)).toString();

      const response = await fetch('/', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (response.ok) {
        // Fire GA lead event with appliance type as the label
        if (typeof gtag === 'function') {
          gtag('event', 'lead_submitted', {
            event_category: 'contact_form',
            event_label: form.querySelector('[name="appliance"]')?.value || 'unknown',
            value: 1,
          });
        }
        // Redirect to thank-you page (this is where GA conversion is tracked)
        window.location.href = '/thank-you.html';
      } else {
        throw new Error(`Netlify responded with status ${response.status}`);
      }

    } catch (err) {
      console.error('Form submission error:', err);
      if (errorMsg) errorMsg.style.display = 'block';
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Send Service Request';
    }
  });

});