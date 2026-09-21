/**
 * embed.js — Embed generator and embed-view logic.
 *
 * embed.html: owner configures theme/layout, gets iframe code.
 * embed-view.html: the actual embedded widget served in an iframe.
 */

// ── EMBED GENERATOR (embed.html) ──────────────────────────────────────────────
import api from './api.js';
import { requireAuth, copyToClipboard } from './utils.js';

const isGenerator = document.getElementById('embed-generator') !== null;
const isView      = document.getElementById('embed-view-root') !== null;

if (isGenerator) await initGenerator();
if (isView)      await initEmbedView();

// ── Generator ─────────────────────────────────────────────────────────────────
async function initGenerator() {
  const user = await requireAuth();
  if (!user) return;

  const spacesRes = await api.get('/api/spaces');
  const spaces = spacesRes?.ok ? (spacesRes.data.data || []) : [];

  const noSpacesEl = document.getElementById('no-spaces-state');
  const mainEl     = document.getElementById('embed-generator');

  if (spaces.length === 0) {
    if (noSpacesEl) noSpacesEl.classList.remove('hidden');
    if (mainEl) mainEl.style.display = 'none';
    const titleEl = document.getElementById('embed-space-name');
    if (titleEl) titleEl.textContent = 'No spaces created yet.';
    return;
  }

  const params  = new URLSearchParams(window.location.search);
  let spaceId = params.get('space');

  let space = spaces.find(s => s.id === spaceId || s.slug === spaceId);
  if (!space) {
    const savedId = localStorage.getItem('trustframe_active_space');
    space = spaces.find(s => s.id === savedId) || spaces[0];
    spaceId = space.id;
  }

  localStorage.setItem('trustframe_active_space', space.id);

  if (params.get('space') !== space.id) {
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('space', space.id);
    window.history.replaceState(null, '', newUrl);
  }

  const spaceSelect = document.getElementById('space-select');
  if (spaceSelect) {
    spaceSelect.innerHTML = spaces.map(s => `
      <option value="${s.id}" ${s.id === space.id ? 'selected' : ''}>${esc(s.name)}</option>
    `).join('');
    spaceSelect.classList.remove('hidden');
    spaceSelect.addEventListener('change', (e) => {
      localStorage.setItem('trustframe_active_space', e.target.value);
      window.location.search = `?space=${e.target.value}`;
    });
  }

  const titleEl = document.getElementById('embed-space-name');
  if (titleEl) titleEl.textContent = `Widget for "${space.name}" (/${space.slug})`;

  let theme  = 'light';
  let layout = 'grid';

  updateCode();
  updatePreview();

  // Controls
  document.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-theme]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      theme = btn.dataset.theme;
      updateCode();
      updatePreview();
    });
  });

  document.querySelectorAll('[data-layout]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-layout]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      layout = btn.dataset.layout;
      updateCode();
      updatePreview();
    });
  });

  document.getElementById('btn-copy-code')?.addEventListener('click', () => {
    const code = document.getElementById('embed-code')?.value;
    if (code) copyToClipboard(code, 'Embed code copied!');
  });

  function getEmbedUrl() {
    return `${window.location.origin}/embed-view.html?space=${space.slug}&theme=${theme}&layout=${layout}`;
  }

  function updateCode() {
    const url = getEmbedUrl();
    const code = `<iframe\n  src="${url}"\n  width="100%"\n  height="600"\n  frameborder="0"\n  style="border:none;border-radius:12px"\n></iframe>`;
    const el = document.getElementById('embed-code');
    if (el) el.value = code;
  }

  function updatePreview() {
    const iframe = document.getElementById('embed-preview');
    if (iframe) iframe.src = getEmbedUrl();
  }
}

// ── Embed View (runs inside the iframe) ───────────────────────────────────────
async function initEmbedView() {
  const API_BASE = 'http://localhost:5000';
  const params   = new URLSearchParams(window.location.search);
  const slug     = params.get('space');
  const theme    = params.get('theme') || 'light';
  const layout   = params.get('layout') || 'grid';

  if (!slug) return;

  // Apply theme
  document.documentElement.dataset.theme = theme;

  try {
    const res = await fetch(`${API_BASE}/api/public/embed/${slug}`);
    if (!res.ok) return;
    const { testimonials } = (await res.json()).data;

    const root = document.getElementById('embed-view-root');
    if (!root) return;

    if (!testimonials.length) {
      root.innerHTML = '<p style="text-align:center;color:#747074;padding:2rem;font-family:Inter,sans-serif">No testimonials yet.</p>';
      return;
    }

    if (layout === 'badge') {
      renderBadge(root, testimonials);
    } else if (layout === 'carousel') {
      renderCarousel(root, testimonials);
    } else {
      renderGrid(root, testimonials);
    }
  } catch { /* silently fail in embed */ }
}

function renderGrid(root, testimonials) {
  root.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;padding:16px">
      ${testimonials.map(t => embedCard(t)).join('')}
    </div>`;
}

function renderCarousel(root, testimonials) {
  let idx = 0;
  const total = testimonials.length;

  function update() {
    cardEl.innerHTML = embedCard(testimonials[idx]);
    counterEl.textContent = `${idx + 1} / ${total}`;
  }

  root.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;padding:24px;gap:16px">
      <div id="carousel-card" style="width:100%;max-width:480px"></div>
      <div style="display:flex;align-items:center;gap:12px">
        <button id="prev-btn" style="background:none;border:1px solid #E7E3E5;border-radius:8px;padding:6px 14px;cursor:pointer;font-family:Inter,sans-serif">←</button>
        <span id="carousel-counter" style="font-size:13px;color:#747074;font-family:Inter,sans-serif"></span>
        <button id="next-btn" style="background:none;border:1px solid #E7E3E5;border-radius:8px;padding:6px 14px;cursor:pointer;font-family:Inter,sans-serif">→</button>
      </div>
    </div>`;

  const cardEl    = document.getElementById('carousel-card');
  const counterEl = document.getElementById('carousel-counter');

  document.getElementById('prev-btn').addEventListener('click', () => { idx = (idx - 1 + total) % total; update(); });
  document.getElementById('next-btn').addEventListener('click', () => { idx = (idx + 1) % total; update(); });

  update();
}

function renderBadge(root, testimonials) {
  const rated = testimonials.filter(t => t.rating);
  const avg = rated.length ? (rated.reduce((s, t) => s + t.rating, 0) / rated.length).toFixed(1) : '—';
  root.innerHTML = `
    <div style="display:inline-flex;align-items:center;gap:10px;background:white;border:1px solid #E7E3E5;border-radius:12px;padding:12px 20px;font-family:Inter,sans-serif">
      <span style="font-size:1.5rem;color:#C9882A">★</span>
      <div>
        <div style="font-size:1.25rem;font-weight:700;color:#111;font-family:Manrope,sans-serif">${avg}</div>
        <div style="font-size:12px;color:#747074">${testimonials.length} review${testimonials.length !== 1 ? 's' : ''}</div>
      </div>
    </div>`;
}

function embedCard(t) {
  const initials = t.name.trim().split(/\s+/).map(p => p[0]).join('').slice(0,2).toUpperCase();
  const stars = t.rating
    ? Array.from({length: 5}, (_, i) => `<span style="color:${i < t.rating ? '#C9882A' : '#E7E3E5'}">★</span>`).join('')
    : '';
  const tags = (t.tags || []).map(tag =>
    `<span style="font-size:11px;padding:2px 7px;border-radius:99px;background:#EDE9FE;color:#7C3AED;font-weight:600">${esc(tag)}</span>`
  ).join('');

  return `
    <div style="background:white;border:1px solid #E7E3E5;border-radius:12px;padding:16px;font-family:Inter,sans-serif">
      ${stars ? `<div style="margin-bottom:8px">${stars}</div>` : ''}
      ${t.headline ? `<div style="font-weight:700;font-size:14px;color:#111;margin-bottom:6px">"${esc(t.headline)}"</div>` : ''}
      <p style="font-size:14px;color:#252525;line-height:1.6;margin-bottom:12px">${esc(t.review)}</p>
      ${tags ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">${tags}</div>` : ''}
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;border-radius:50%;background:#EDE9FE;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#7C3AED;font-family:Manrope,sans-serif;flex-shrink:0">${initials}</div>
        <div>
          <div style="font-weight:600;font-size:13px;color:#111">
            ${t.social_link ? `<a href="${esc(t.social_link)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">${esc(t.name)}</a>` : esc(t.name)}
          </div>
          ${t.company_role ? `<div style="font-size:12px;color:#747074">${esc(t.company_role)}</div>` : ''}
        </div>
      </div>
    </div>`;
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
