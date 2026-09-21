/**
 * spaces.js — Space management page logic.
 *
 * Handles: list spaces, create space modal, delete space.
 */

import api from './api.js';
import { requireAuth, toast, setLoading, clearLoading, slugify, copyToClipboard } from './utils.js';

const user = await requireAuth();
if (!user) throw new Error('Redirect in progress');

const COLLECT_BASE = window.location.origin + '/collect.html?space=';

await loadSpaces();
setupCreateModal();

// ── Load and render spaces ────────────────────────────────────────────────────
async function loadSpaces() {
  const container = document.getElementById('spaces-grid');
  if (!container) return;

  container.innerHTML = renderSkeletons(3);

  const res = await api.get('/api/spaces');
  if (!res?.ok) {
    container.innerHTML = '<p class="text-muted">Failed to load spaces.</p>';
    return;
  }

  const spaces = res.data.data || [];
  if (spaces.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🚀</div>
        <div class="empty-title">No spaces yet</div>
        <div class="empty-desc">Create your first Space to start collecting testimonials.</div>
        <button class="btn btn-primary" id="btn-create-first">Create Space</button>
      </div>`;
    document.getElementById('btn-create-first')?.addEventListener('click', openCreateModal);
    return;
  }

  container.innerHTML = spaces.map(space => renderSpaceCard(space)).join('');
  attachSpaceCardEvents();
}

function renderSpaceCard(s) {
  const initials = s.name.trim().split(/\s+/).map(p => p[0]).join('').slice(0,2).toUpperCase();
  const collectUrl = `${window.location.origin}/collect.html?space=${s.slug}`;
  return `
    <div class="space-card" data-space-id="${s.id}">
      <div class="space-card-header">
        <div class="space-logo" aria-hidden="true">${initials}</div>
        <div>
          <div class="space-name">${esc(s.name)}</div>
          <div class="space-slug">/${s.slug}</div>
        </div>
      </div>
      <div class="space-card-actions">
        <a href="/testimonials.html?space=${s.id}" class="btn btn-secondary btn-sm space-nav-btn" data-id="${s.id}">Inbox</a>
        <a href="/analytics.html?space=${s.id}" class="btn btn-ghost btn-sm space-nav-btn" data-id="${s.id}">Analytics</a>
        <a href="/embed.html?space=${s.id}" class="btn btn-ghost btn-sm space-nav-btn" data-id="${s.id}">Embed</a>
        <a href="/wall.html?space=${s.slug}" target="_blank" class="btn btn-ghost btn-sm">Wall</a>
        <button class="btn btn-ghost btn-sm" onclick="copyToClipboard('${collectUrl}', 'Collection link copied!')">Copy Link</button>
        <button class="btn btn-ghost btn-sm btn-edit-space" data-id="${s.id}">Settings</button>
        <button class="btn btn-danger btn-sm btn-delete-space" data-id="${s.id}" data-name="${esc(s.name)}">Delete</button>
      </div>
    </div>`;
}

function attachSpaceCardEvents() {
  document.querySelectorAll('.space-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.id) localStorage.setItem('trustframe_active_space', btn.dataset.id);
    });
  });

  // Edit (settings) — navigate to space settings page
  document.querySelectorAll('.btn-edit-space').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.id) localStorage.setItem('trustframe_active_space', btn.dataset.id);
      window.location.href = `/space-settings.html?space=${btn.dataset.id}`;
    });
  });

  // Delete
  document.querySelectorAll('.btn-delete-space').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(btn.dataset.id, btn.dataset.name));
  });
}

async function confirmDelete(spaceId, spaceName) {
  if (!confirm(`Delete "${spaceName}"? This will also delete all its testimonials. This cannot be undone.`)) return;

  const res = await api.delete(`/api/spaces/${spaceId}`);
  if (res?.ok) {
    toast('Space deleted.', 'success');
    await loadSpaces();
  } else {
    toast(res?.data?.message || 'Failed to delete space.', 'error');
  }
}

// ── Create Space Modal ────────────────────────────────────────────────────────
function setupCreateModal() {
  const openBtn = document.getElementById('btn-create-space');
  openBtn?.addEventListener('click', openCreateModal);

  const form = document.getElementById('form-create-space');
  if (!form) return;

  // Auto-generate slug from name
  const nameInput = form.querySelector('[name=name]');
  const slugInput = form.querySelector('[name=slug]');
  nameInput?.addEventListener('input', () => {
    if (slugInput && !slugInput.dataset.manualEdit) {
      slugInput.value = slugify(nameInput.value);
    }
  });
  slugInput?.addEventListener('input', () => {
    if (slugInput) slugInput.dataset.manualEdit = 'true';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    setLoading(btn);

    const data = {
      name: form.querySelector('[name=name]').value.trim(),
      slug: form.querySelector('[name=slug]').value.trim(),
      description: form.querySelector('[name=description]')?.value.trim() || '',
      prompt: form.querySelector('[name=prompt]')?.value.trim() || 'How was your experience?',
      enable_rating: form.querySelector('[name=enable_rating]')?.checked ?? true,
    };

    const res = await api.post('/api/spaces', data);
    clearLoading(btn);

    if (!res?.ok) {
      toast(res?.data?.message || 'Failed to create space.', 'error');
      return;
    }

    toast('Space created!', 'success');
    closeCreateModal();
    await loadSpaces();
  });

  document.getElementById('btn-close-modal')?.addEventListener('click', closeCreateModal);
  document.getElementById('modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCreateModal();
  });
}

function openCreateModal() {
  const backdrop = document.getElementById('modal-backdrop');
  backdrop?.classList.add('open');
  backdrop?.querySelector('.modal input')?.focus();
}

function closeCreateModal() {
  document.getElementById('modal-backdrop')?.classList.remove('open');
  document.getElementById('form-create-space')?.reset();
  const slugInput = document.querySelector('[name=slug]');
  if (slugInput) delete slugInput.dataset.manualEdit;
}

// Make copyToClipboard available globally for inline onclick
window.copyToClipboard = copyToClipboard;

// ── Skeleton ──────────────────────────────────────────────────────────────────
function renderSkeletons(n) {
  return Array.from({length: n}, () => `
    <div class="space-card">
      <div class="space-card-header" style="gap:12px">
        <div class="skeleton skeleton-avatar" style="width:44px;height:44px;border-radius:8px"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px">
          <div class="skeleton skeleton-text" style="width:60%"></div>
          <div class="skeleton skeleton-text" style="width:35%"></div>
        </div>
      </div>
      <div class="space-card-actions" style="gap:8px">
        <div class="skeleton" style="width:60px;height:28px;border-radius:8px"></div>
        <div class="skeleton" style="width:60px;height:28px;border-radius:8px"></div>
        <div class="skeleton" style="width:80px;height:28px;border-radius:8px"></div>
      </div>
    </div>`).join('');
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
