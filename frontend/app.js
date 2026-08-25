// Loads package data and renders the fiber/copper package cards on the
// landing page. Pulls from /api/packages so the same data source backs the
// application form's package dropdown too — never hardcoded twice.

async function loadPackages() {
  try {
    const res = await fetch('/api/packages');
    const data = await res.json();
    renderFiber(data.fiber);
    renderCopper(data.copper);
  } catch (err) {
    console.error('Could not load packages:', err);
  }
}

function renderFiber(fiber) {
  const container = document.getElementById('fiberCards');
  if (!container || !fiber) return;

  container.innerHTML = fiber.plans
    .map(
      (p) => `
    <div class="pkg-card">
      <div class="pkg-speed">${p.speed}</div>
      <div class="pkg-price">Rs. ${p.price.toLocaleString()} <span class="per">/ month</span></div>
      <ul class="pkg-feats">
        ${p.features.map((f) => `<li>${f}</li>`).join('')}
      </ul>
      <a href="apply.html?package=${p.id}" class="btn btn-primary">Apply Now</a>
    </div>
  `
    )
    .join('');
}

function renderCopper(copper) {
  const container = document.getElementById('copperCards');
  if (!container || !copper) return;

  container.innerHTML = copper.plans
    .map(
      (p) => `
    <div class="pkg-card">
      <div class="pkg-speed">${p.speed}</div>
      <div class="pkg-price ${p.price ? '' : 'tbd'}">
        ${p.price ? `Rs. ${p.price.toLocaleString()} <span class="per">/ month</span>` : 'Contact for pricing'}
      </div>
      <ul class="pkg-feats">
        <li>Copper cable fixed line</li>
        <li>Installation fee: Rs. ${copper.installationFee.toLocaleString()}</li>
      </ul>
      <a href="apply.html?package=${p.id}" class="btn btn-primary">Apply Now</a>
    </div>
  `
    )
    .join('');
}

loadPackages();
