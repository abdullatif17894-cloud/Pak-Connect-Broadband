// Staff dashboard: lists applications from data/orders-equivalent storage
// (Redis on Vercel, data/applications.json locally — see
// applicationsStorage.js), shows uploaded documents, and advances status.

const STATUS_LABELS = {
  NEW: 'New',
  UNDER_REVIEW: 'Under Review',
  FORWARDED_TO_PTCL: 'Forwarded to PTCL',
  INSTALLED: 'Installed',
};

const NEXT_STATUS = {
  NEW: { value: 'UNDER_REVIEW', label: 'Start Review' },
  UNDER_REVIEW: { value: 'FORWARDED_TO_PTCL', label: 'Forward to PTCL' },
  FORWARDED_TO_PTCL: { value: 'INSTALLED', label: 'Mark Installed' },
  INSTALLED: null,
};

const DOC_LABELS = {
  idDocument: 'CNIC / ID',
  utilityBill: 'Utility Bill',
  sofForm: 'SOF Form',
  ntcLetter: 'NTC Letter',
};

async function loadApplications() {
  const wrap = document.getElementById('appsWrap');
  wrap.innerHTML = '<p class="loading">Loading applications…</p>';

  try {
    const res = await fetch('/api/staff/applications');
    const data = await res.json();
    renderApplications(data.applications || []);
  } catch (err) {
    wrap.innerHTML = '<p class="loading">Could not load applications.</p>';
  }
}

function renderApplications(applications) {
  const wrap = document.getElementById('appsWrap');

  if (applications.length === 0) {
    wrap.innerHTML = '<p class="loading">No applications yet.</p>';
    return;
  }

  const sorted = [...applications].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

  wrap.innerHTML = sorted.map(renderCard).join('');

  wrap.querySelectorAll('[data-advance]').forEach((btn) => {
    btn.addEventListener('click', () => advanceStatus(btn.dataset.advance, btn.dataset.nextStatus));
  });
}

function renderCard(app) {
  const next = NEXT_STATUS[app.status];
  const cnicFlag =
    app.cnicCheck && app.cnicCheck.checked && app.cnicCheck.expired
      ? '<div class="cnic-flag">⚠ CNIC flagged as expired</div>'
      : '';

  const docs = Object.keys(DOC_LABELS)
    .map((key) => {
      const url = app.documents && app.documents[key];
      if (!url) return `<span class="doc-missing">${DOC_LABELS[key]}: not provided</span>`;
      return `<a class="doc-link" href="${url}" target="_blank" rel="noopener">${DOC_LABELS[key]} ↗</a>`;
    })
    .join('');

  return `
    <div class="app-card">
      <div>
        <div class="app-main">
          <div class="app-field"><label>Name</label><div>${escapeHtml(app.fullName)}</div></div>
          <div class="app-field"><label>Mobile</label><div>${escapeHtml(app.mobile)}</div></div>
          <div class="app-field"><label>Email</label><div>${escapeHtml(app.email)}</div></div>
          <div class="app-field"><label>Package</label><div>${escapeHtml(app.connectionType)} — ${escapeHtml(app.packageId)}</div></div>
          <div class="app-field" style="grid-column: 1 / -1;"><label>Address</label><div>${escapeHtml(app.address)}</div></div>
        </div>
        <div class="app-docs">${docs}</div>
        ${cnicFlag}
      </div>
      <div class="app-side">
        <div style="text-align:right;">
          <span class="status-pill status-${app.status}">${STATUS_LABELS[app.status]}</span>
          <div class="ref-id">Ref #${app.applicationId}</div>
        </div>
        ${
          next
            ? `<button class="btn btn-primary" data-advance="${app.applicationId}" data-next-status="${next.value}">${next.label}</button>`
            : ''
        }
      </div>
    </div>
  `;
}

async function advanceStatus(applicationId, nextStatus) {
  try {
    const res = await fetch(`/api/staff/applications/${applicationId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || 'Could not update status.');
      return;
    }
    loadApplications();
  } catch (err) {
    alert('Could not update status.');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

document.getElementById('refreshBtn').addEventListener('click', loadApplications);
loadApplications();
