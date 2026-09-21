/**
 * testimonials.js — Moderation inbox logic.
 *
 * Features: tabs, search, advanced filters (rating/tag),
 * bulk select/actions, delete, restore, pagination, approve/reject/archive/feature/like.
 */

import api from './api.js';
import { requireAuth, toast, renderStars, formatDate, esc } from './utils.js';

// ── State ─────────────────────────────────────────────────────────────────────
let currentStatus = 'all';
let currentPage   = 1;
let searchQuery   = '';
let filterRating  = '';
let filterTag     = '';
let selectedIds   = new Set();
let spaceId       = null;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
  const user = await requireAuth();
  if (!user) return;

  const noSpacesEl = document.getElementById('no-spaces-state');
  const mainEl     = document.getElementById('testimonials-main');

  let spaces = [];
  try {
    const spacesRes = await api.get('/api/spaces');
    spaces = spacesRes?.ok ? (spacesRes.data?.data || []) : [];
  } catch (e) {
    console.error('Failed to fetch spaces:', e);
  }

  if (spaces.length === 0) {
    if (noSpacesEl) noSpacesEl.classList.remove('hidden');
    if (mainEl)     mainEl.style.display = 'none';
    const countEl = document.getElementById('result-count');
    if (countEl) countEl.textContent = 'No spaces created yet.';
    return;
  }

  if (noSpacesEl) noSpacesEl.classList.add('hidden');
  if (mainEl)     mainEl.style.display = 'block';

  const params = new URLSearchParams(window.location.search);
  let urlSpaceId = params.get('space');

  let activeSpace = spaces.find(s => s.id === urlSpaceId || s.slug === urlSpaceId);
  if (!activeSpace) {
    const savedId = localStorage.getItem('trustframe_active_space');
    activeSpace = spaces.find(s => s.id === savedId) || spaces[0];
  }
  spaceId = activeSpace.id;
  localStorage.setItem('trustframe_active_space', activeSpace.id);

  if (params.get('space') !== activeSpace.id) {
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('space', activeSpace.id);
    window.history.replaceState(null, '', newUrl);
  }

  // Space selector
  const spaceSelect = document.getElementById('space-select');
  if (spaceSelect) {
    spaceSelect.innerHTML = spaces.map(s =>
      `<option value="${s.id}" ${s.id === activeSpace.id ? 'selected' : ''}>${esc(s.name)}</option>`
    ).join('');
    spaceSelect.classList.remove('hidden');
    spaceSelect.addEventListener('change', e => {
      localStorage.setItem('trustframe_active_space', e.target.value);
      window.location.search = `?space=${e.target.value}`;
    });
  }

  setupTabs();
  setupSearch();
  setupFilters();
  setupBulkToolbar();
  await loadTestimonials();
}

// ── Load testimonials ─────────────────────────────────────────────────────────
async function loadTestimonials() {
  const container = document.getElementById('testimonials-list');
  const countEl   = document.getElementById('result-count');
  if (!container) return;

  container.innerHTML = renderSkeletons(4);

  const qs = new URLSearchParams({
    space_id: spaceId,
    status:   currentStatus,
    page:     currentPage,
    per_page: 15,
  });
  if (searchQuery) qs.set('search', searchQuery);
  if (filterRating) qs.set('rating', filterRating);
  if (filterTag)    qs.set('tag', filterTag);

  try {
    const res = await api.get(`/api/testimonials?${qs}`);
    if (!res?.ok) {
      container.innerHTML = `
        <div style="padding:3rem 2rem;text-align:center">
          <div style="font-size:2.5rem;margin-bottom:1rem">⚠️</div>
          <p style="color:var(--muted);font-size:0.9rem">Failed to load testimonials. Please try refreshing.</p>
          <button class="btn btn-secondary btn-sm mt-4" onclick="location.reload()">Refresh page</button>
        </div>`;
      return;
    }

    const payload = res.data?.data || {};
    const { testimonials = [], total = 0, pages = 1 } = payload;

    if (countEl) countEl.textContent = `${total} testimonial${total !== 1 ? 's' : ''}`;

    if (!testimonials.length) {
      container.innerHTML = renderEmpty();
      renderPagination(0, 1);
      return;
    }

    container.innerHTML = testimonials.map(t => renderTestimonialRow(t)).join('');
    attachActions();
    renderPagination(pages, currentPage);

    // Re-apply checkbox state
    selectedIds.clear();
    updateBulkToolbar();
  } catch (e) {
    console.error('Error loading testimonials:', e);
    container.innerHTML = `<p style="padding:2rem;color:var(--danger);text-align:center">An error occurred. Check your connection and try again.</p>`;
  }
}

// ── Render one testimonial row ────────────────────────────────────────────────
function renderTestimonialRow(t) {
  const name = t.name || 'Anonymous';
  const initials = name.trim().split(/\s+/).map(p => p[0]).join('').slice(0,2).toUpperCase() || '?';
  const statusBadgeMap = {
    pending:  '<span class="badge badge-pending">Pending</span>',
    approved: '<span class="badge badge-success">Approved</span>',
    rejected: '<span class="badge badge-error">Rejected</span>',
    archived: '<span class="badge badge-default">Archived</span>',
  };
  const statusBadge = statusBadgeMap[t.status] || '';

  return `
    <div class="testimonial-item animate-fade-in" data-id="${t.id}">
      <div class="t-item-check">
        <input type="checkbox" class="testimonial-checkbox" data-id="${t.id}" aria-label="Select testimonial">
      </div>
      <div class="avatar avatar-md t-item-avatar" data-initial="${initials[0]}">${initials}</div>
      <div class="t-item-body">
        <div class="t-item-header">
          <span class="t-item-name">${esc(name)}</span>
          ${statusBadge}
          ${t.featured ? '<span class="badge badge-violet">⭐ Featured</span>' : ''}
          ${t.liked    ? '<span class="badge badge-violet">♥ Liked</span>'    : ''}
        </div>
        <div class="t-item-role">${esc(t.company_role || 'Anonymous')} · ${formatDate(t.created_at)}</div>
        ${t.rating   ? `<div class="t-item-stars">${renderStars(t.rating, '0.85rem')}</div>` : ''}
        ${t.headline ? `<div class="t-item-headline">"${esc(t.headline)}"</div>` : ''}
        <div class="t-item-review">${esc(t.review)}</div>
        ${t.tags && t.tags.length ? `
          <div class="t-item-tags">
            ${t.tags.map(tag => `<span class="tag-pill">${esc(tag)}</span>`).join('')}
          </div>` : ''}
      </div>
      <div class="t-item-actions">
        <div class="t-item-actions-primary">
          ${t.status !== 'approved' ? `<button class="btn btn-sm btn-primary action-btn" data-action="approve" data-id="${t.id}">✓ Approve</button>` : ''}
          ${t.status === 'pending'  ? `<button class="btn btn-sm btn-secondary action-btn" data-action="reject"  data-id="${t.id}">✗ Reject</button>` : ''}
          ${t.status !== 'archived' ? `<button class="btn btn-sm btn-ghost action-btn" data-action="archive" data-id="${t.id}">Archive</button>` : ''}
          ${t.status === 'archived' ? `<button class="btn btn-sm btn-secondary action-btn" data-action="restore" data-id="${t.id}">Restore</button>` : ''}
        </div>
        <div class="t-item-actions-secondary">
          <button class="icon-btn action-btn ${t.featured ? 'icon-btn-active' : ''}" data-action="feature" data-id="${t.id}" title="${t.featured ? 'Unfeature' : 'Feature'}">${t.featured ? '★' : '☆'}</button>
          <button class="icon-btn action-btn ${t.liked ? 'icon-btn-active-red' : ''}" data-action="like"    data-id="${t.id}" title="${t.liked ? 'Unlike' : 'Like'}">${t.liked ? '♥' : '♡'}</button>
          <button class="icon-btn icon-btn-danger action-btn" data-action="delete" data-id="${t.id}" title="Delete permanently">🗑</button>
        </div>
      </div>
    </div>`;
}

// ── Action buttons ────────────────────────────────────────────────────────────
function attachActions() {
  document.querySelectorAll('.action-btn').forEach(btn => {
    // Remove old listeners by cloning
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
  });

  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { action, id } = btn.dataset;

      if (action === 'delete') {
        if (!confirm('Delete this testimonial permanently? This cannot be undone.')) return;
        btn.disabled = true;
        const res = await api.delete(`/api/testimonials/${id}`);
        btn.disabled = false;
        if (res?.ok) { toast('Deleted', 'success'); await loadTestimonials(); }
        else          { toast(res?.data?.message || 'Delete failed.', 'error'); }
        return;
      }

      if (action === 'restore') {
        btn.disabled = true;
        const res = await api.post(`/api/testimonials/${id}/restore`);
        btn.disabled = false;
        if (res?.ok) { toast('Restored to Pending', 'success'); await loadTestimonials(); }
        else          { toast(res?.data?.message || 'Restore failed.', 'error'); }
        return;
      }

      btn.disabled = true;
      const res = await api.post(`/api/testimonials/${id}/${action}`);
      btn.disabled = false;
      if (res?.ok) {
        const msgs = { approve: 'Approved ✓', reject: 'Rejected', archive: 'Archived', feature: 'Updated', like: 'Updated' };
        toast(msgs[action] || 'Updated', 'success');
        await loadTestimonials();
      } else {
        toast(res?.data?.message || 'Action failed.', 'error');
      }
    });
  });

  // Checkbox listeners
  document.querySelectorAll('.testimonial-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) selectedIds.add(cb.dataset.id);
      else            selectedIds.delete(cb.dataset.id);
      updateBulkToolbar();
    });
  });
}

// ── Bulk toolbar ──────────────────────────────────────────────────────────────
function setupBulkToolbar() {
  document.getElementById('bulk-approve')?.addEventListener('click', () => bulkAction('approve'));
  document.getElementById('bulk-reject')?.addEventListener('click',  () => bulkAction('reject'));
  document.getElementById('bulk-archive')?.addEventListener('click', () => bulkAction('archive'));
  document.getElementById('bulk-delete')?.addEventListener('click',  () => {
    if (!confirm(`Delete ${selectedIds.size} testimonial(s) permanently? This cannot be undone.`)) return;
    bulkAction('delete');
  });
  document.getElementById('bulk-clear')?.addEventListener('click', () => {
    selectedIds.clear();
    document.querySelectorAll('.testimonial-checkbox').forEach(cb => cb.checked = false);
    updateBulkToolbar();
  });
}

async function bulkAction(action) {
  if (selectedIds.size === 0) return;
  try {
    const res = await api.post('/api/testimonials/bulk', { ids: [...selectedIds], action });
    if (res?.ok) {
      const msgs = { approve: 'Approved', reject: 'Rejected', archive: 'Archived', delete: 'Deleted' };
      toast(`${msgs[action] || 'Updated'} ${selectedIds.size} testimonial(s)`, 'success');
      selectedIds.clear();
      await loadTestimonials();
    } else {
      toast(res?.data?.message || 'Bulk action failed.', 'error');
    }
  } catch (e) {
    toast('Bulk action failed. Please try again.', 'error');
  }
}

function updateBulkToolbar() {
  const toolbar = document.getElementById('bulk-toolbar');
  const countEl = document.getElementById('bulk-count');
  if (!toolbar) return;
  if (selectedIds.size > 0) {
    toolbar.classList.remove('hidden');
    toolbar.style.display = 'flex';
    if (countEl) countEl.textContent = `${selectedIds.size} selected`;
  } else {
    toolbar.classList.add('hidden');
  }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      currentStatus = btn.dataset.status || 'all';
      currentPage = 1;
      loadTestimonials();
    });
  });
}

// ── Search ────────────────────────────────────────────────────────────────────
function setupSearch() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;
  let timeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      searchQuery = searchInput.value.trim();
      currentPage = 1;
      loadTestimonials();
    }, 350);
  });
}

// ── Filters ───────────────────────────────────────────────────────────────────
function setupFilters() {
  const ratingSelect = document.getElementById('filter-rating');
  const tagInput     = document.getElementById('filter-tag');
  const clearBtn     = document.getElementById('clear-filters');
  let tagTimeout;

  ratingSelect?.addEventListener('change', () => {
    filterRating = ratingSelect.value;
    currentPage = 1;
    loadTestimonials();
  });

  tagInput?.addEventListener('input', () => {
    clearTimeout(tagTimeout);
    tagTimeout = setTimeout(() => {
      filterTag = tagInput.value.trim();
      currentPage = 1;
      loadTestimonials();
    }, 350);
  });

  clearBtn?.addEventListener('click', () => {
    filterRating = '';
    filterTag = '';
    searchQuery = '';
    if (ratingSelect) ratingSelect.value = '';
    if (tagInput) tagInput.value = '';
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    currentPage = 1;
    loadTestimonials();
  });
}

// ── Pagination ────────────────────────────────────────────────────────────────
function renderPagination(totalPages, page) {
  const container = document.getElementById('pagination');
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    pages.push(`<button class="btn btn-sm ${i === page ? 'btn-primary' : 'btn-secondary'} page-btn" data-page="${i}">${i}</button>`);
  }

  container.innerHTML = `
    <button class="btn btn-sm btn-ghost page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Prev</button>
    ${pages.join('')}
    <button class="btn btn-sm btn-ghost page-btn" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next →</button>
  `;

  container.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p >= 1 && p <= totalPages) {
        currentPage = p;
        loadTestimonials();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

// ── Empty / skeleton ──────────────────────────────────────────────────────────
function renderEmpty() {
  const descriptions = {
    all: 'No testimonials collected yet. Share your space link to start getting reviews.',
    pending: 'No pending testimonials. New submissions will appear here.',
    approved: 'No approved testimonials yet. Approve pending reviews to display them.',
    rejected: 'No rejected testimonials.',
    archived: 'No archived testimonials.',
  };
  return `
    <div style="padding:4rem 2rem;text-align:center">
      <div style="font-size:3rem;margin-bottom:1rem">📭</div>
      <div style="font-weight:700;font-size:1rem;color:var(--black);margin-bottom:0.5rem">No testimonials here</div>
      <div style="color:var(--muted);font-size:0.875rem;max-width:360px;margin:0 auto">${descriptions[currentStatus] || 'No testimonials found.'}</div>
    </div>`;
}

function renderSkeletons(n) {
  return Array.from({length: n}, () => `
    <div class="testimonial-item">
      <div style="width:16px;height:16px;flex-shrink:0"></div>
      <div class="skeleton skeleton-avatar avatar-md"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px">
        <div class="skeleton skeleton-text" style="width:35%"></div>
        <div class="skeleton skeleton-text" style="width:22%"></div>
        <div class="skeleton skeleton-text" style="width:85%"></div>
        <div class="skeleton skeleton-text" style="width:70%"></div>
      </div>
    </div>`).join('');
}

// Kick off
init();
