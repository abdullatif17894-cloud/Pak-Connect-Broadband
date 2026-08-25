// Application form logic: loads packages, wires up the connection-type ->
// package dropdowns, runs the CNIC expiry check as soon as a file is chosen,
// and submits the full form (with documents) to the backend.

let PACKAGES = null;

async function loadPackages() {
  const res = await fetch('/api/packages');
  PACKAGES = await res.json();

  // Pre-select a package if the user arrived via an "Apply Now" link
  // (?package=fiber-20 etc.) from the landing page.
  const params = new URLSearchParams(window.location.search);
  const preselect = params.get('package');
  if (preselect) {
    const type = preselect.startsWith('fiber') ? 'fiber' : 'copper';
    document.getElementById('connectionType').value = type;
    populatePackages(type);
    document.getElementById('packageId').value = preselect;
    updatePkgSummary();
  }
}

function populatePackages(type) {
  const select = document.getElementById('packageId');
  if (!type || !PACKAGES) {
    select.innerHTML = '<option value="">Select connection type first</option>';
    return;
  }

  const group = PACKAGES[type];
  select.innerHTML =
    '<option value="">Select a package</option>' +
    group.plans
      .map((p) => {
        const priceLabel = p.price ? `Rs. ${p.price.toLocaleString()}/mo` : 'Contact for pricing';
        return `<option value="${p.id}">${p.speed} — ${priceLabel}</option>`;
      })
      .join('');
}

function updatePkgSummary() {
  const type = document.getElementById('connectionType').value;
  const pkgId = document.getElementById('packageId').value;
  const summary = document.getElementById('pkgSummary');

  if (!type || !pkgId || !PACKAGES) {
    summary.hidden = true;
    return;
  }

  const group = PACKAGES[type];
  const plan = group.plans.find((p) => p.id === pkgId);
  if (!plan) {
    summary.hidden = true;
    return;
  }

  const priceLabel = plan.price ? `Rs. ${plan.price.toLocaleString()} / month` : 'Contact for pricing';
  const installFee = group.installationFee ? `Rs. ${group.installationFee.toLocaleString()}` : 'Contact for details';

  summary.hidden = false;
  summary.innerHTML = `Selected: <strong>${plan.speed}</strong> &mdash; ${priceLabel}. Installation fee: <strong>${installFee}</strong> (one-time).`;
}

document.getElementById('connectionType').addEventListener('change', (e) => {
  populatePackages(e.target.value);
  updatePkgSummary();
});
document.getElementById('packageId').addEventListener('change', updatePkgSummary);

// --- CNIC expiry check -----------------------------------------------
// As soon as the customer picks their CNIC/ID file, send it to the AI
// verification endpoint so they find out immediately if it's expired,
// rather than after submitting the whole form.

const idInput = document.getElementById('idDocument');
const cnicStatus = document.getElementById('cnicStatus');
let cnicCheckPassed = null; // null = not checked yet, true/false = result

idInput.addEventListener('change', async () => {
  const file = idInput.files[0];
  if (!file) {
    cnicStatus.hidden = true;
    cnicCheckPassed = null;
    return;
  }

  cnicStatus.hidden = false;
  cnicStatus.className = 'cnic-status checking';
  cnicStatus.textContent = 'Checking your document…';
  cnicCheckPassed = null;

  try {
    const formData = new FormData();
    formData.append('idDocument', file);
    const res = await fetch('/api/check-cnic', { method: 'POST', body: formData });
    const result = await res.json();

    if (!result.success) {
      cnicStatus.className = 'cnic-status expired';
      cnicStatus.textContent = result.message || 'Could not verify this document — please check and try again.';
      cnicCheckPassed = false;
      return;
    }

    if (result.expired) {
      cnicStatus.className = 'cnic-status expired';
      cnicStatus.textContent = 'Your CNIC has expired. Please upload a valid, unexpired CNIC.';
      cnicCheckPassed = false;
    } else {
      cnicStatus.className = 'cnic-status ok';
      cnicStatus.textContent = result.expiryDate
        ? `Looks good — valid until ${result.expiryDate}.`
        : 'Document looks valid.';
      cnicCheckPassed = true;
    }
  } catch (err) {
    // If the check itself fails (network issue etc.), don't block
    // submission — staff will verify manually. Just don't show a false
    // negative.
    cnicStatus.hidden = true;
    cnicCheckPassed = null;
  }
});

// --- Form submission ---------------------------------------------------

const form = document.getElementById('applyForm');
const submitBtn = document.getElementById('submitBtn');
const formError = document.getElementById('formError');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;

  if (cnicCheckPassed === false) {
    formError.hidden = false;
    formError.textContent = 'Please upload a valid, unexpired CNIC before submitting.';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const formData = new FormData(form);
    const res = await fetch('/api/apply', { method: 'POST', body: formData });
    const result = await res.json();

    if (!result.success) {
      throw new Error(result.error || 'Something went wrong. Please try again.');
    }

    document.querySelector('.apply-layout').closest('.section').hidden = true;
    document.getElementById('applyForm').closest('.apply-hero').hidden = true;
    const successSection = document.getElementById('successSection');
    successSection.hidden = false;
    document.getElementById('successMessage').textContent =
      `Your application (Reference #${result.applicationId}) has been received. We'll review it and forward it to PTCL shortly.`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    formError.hidden = false;
    formError.textContent = err.message || 'Something went wrong. Please try again.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Application';
  }
});

loadPackages();
