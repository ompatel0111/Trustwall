/**
 * wall.js — Public Wall of Love logic.
 *
 * Reads space slug from URL: /wall.html?space=acme-corp
 * Loads approved testimonials and renders the masonry wall.
 * No authentication required.
 */

const API_BASE = 'http://localhost:5000';

const params = new URLSearchParams(window.location.search);
const slug   = params.get('space');

if (!slug) {
  document.body.innerHTML = '<div style="text-align:center;padding:4rem"><h2>Invalid wall link.</h2></div>';
  throw new Error('No space slug');
}

await initWall();

async function initWall() {
  try {
    // Load space info
    const spaceRes = await fetch(`${API_BASE}/api/public/spaces/${slug}`);
    if (!spaceRes.ok) { showError('Wall not found.'); return; }
    const space = (await spaceRes.json()).data;

    renderHeader(space);

    // Load approved testimonials
    const testimonialRes = await fetch(`${API_BASE}/api/public/spaces/${slug}/testimonials`);
    const testimonials = testimonialRes.ok ? (await testimonialRes.json()).data : [];

    renderStats(space, testimonials);
    renderWall(testimonials);

  } catch {
    showError('Cannot load the Wall of Love. Please try again later.');
  }
}

function renderHeader(space) {
  const initials = space.name.trim().split(/\s+/).map(p => p[0]).join('').slice(0,2).toUpperCase();

  const logoEl = document.getElementById('wall-logo');
  if (logoEl) logoEl.textContent = initials;

  const titleEl = document.getElementById('wall-title');
  if (titleEl) titleEl.textContent = `${space.name} — Wall of Love`;

  document.title = `Wall of Love — ${space.name}`;
}

function renderStats(space, testimonials) {
  const total = testimonials.length;
  const rated = testimonials.filter(t => t.rating != null);
  const avg = rated.length ? (rated.reduce((s, t) => s + t.rating, 0) / rated.length).toFixed(1) : '—';

  setEl('wall-stat-total', total);
  setEl('wall-stat-avg', avg);
  setEl('wall-stat-avg-stars', avg !== '—' ? renderStars(Math.round(parseFloat(avg))) : '');
}

function renderWall(testimonials) {
  const container = document.getElementById('wall-masonry');
  if (!container) return;

  if (!testimonials.length) {
    container.innerHTML = `
      <div class="wall-empty">
        <div style="font-size:2.5rem;margin-bottom:1rem">💬</div>
        <h3 style="font-family:'Manrope',sans-serif;font-weight:700;color:#111">No testimonials yet</h3>
        <p style="color:#747074;margin-top:.5rem">Approved testimonials will appear here.</p>
      </div>`;
    return;
  }

  container.innerHTML = testimonials.map(t => renderCard(t)).join('');
}

function renderCard(t) {
  const initials = t.name.trim().split(/\s+/).map(p => p[0]).join('').slice(0,2).toUpperCase();
  const stars = t.rating
    ? Array.from({length: 5}, (_, i) =>
        `<span class="wall-card-star ${i < t.rating ? 'filled' : 'empty'}">★</span>`
      ).join('')
    : '';
  const tags = (t.tags || []).map(tag =>
    `<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:#EDE9FE;color:#7C3AED;font-weight:600">${esc(tag)}</span>`
  ).join('');

  return `
    <div class="wall-card ${t.featured ? 'featured' : ''}">
      ${t.featured ? '<div class="wall-card-featured-badge">⭐ Featured</div>' : ''}
      ${stars ? `<div class="wall-card-stars">${stars}</div>` : ''}
      ${t.headline ? `<h4 style="font-size:15px;font-weight:700;color:#111;margin-bottom:6px">"${esc(t.headline)}"</h4>` : ''}
      <p class="wall-card-review">${esc(t.review)}</p>
      ${tags ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 12px">${tags}</div>` : ''}
      <div class="wall-card-header">
        <div class="avatar avatar-md" data-initial="${initials[0]||'?'}" aria-label="${esc(t.name)}">${initials}</div>
        <div class="wall-card-info">
          <div class="wall-card-name">
            ${t.social_link ? `<a href="${esc(t.social_link)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">${esc(t.name)}</a>` : esc(t.name)}
          </div>
          ${t.company_role ? `<div class="wall-card-role">${esc(t.company_role)}</div>` : ''}
        </div>
      </div>
    </div>`;
}

function renderStars(rating) {
  return Array.from({length: 5}, (_, i) =>
    `<span class="star ${i < rating ? 'filled' : ''}" style="font-size:0.85rem">★</span>`
  ).join('');
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) {
    if (typeof val === 'string' && val.includes('<')) el.innerHTML = val;
    else el.textContent = val;
  }
}

function showError(msg) {
  document.body.innerHTML = `<div style="text-align:center;padding:4rem;font-family:Inter,sans-serif"><h2>${msg}</h2></div>`;
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
