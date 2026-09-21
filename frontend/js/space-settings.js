/**
 * space-settings.js — Space Settings page logic.
 *
 * Handles: tab switching, general settings, wall settings (with live preview),
 * auto-moderation toggles, team invites/removal, copy link, delete space.
 */

import api from './api.js';
import { requireAuth, toast, setLoading, clearLoading, copyToClipboard, createAvatar } from './utils.js';

const user = await requireAuth();
if (!user) throw new Error('Redirect in progress');

renderUserInfo(user);
setupLogout();
setupMobileMenu();

const params = new URLSearchParams(window.location.search);
const spaceId = params.get('space');
if (!spaceId) {
  window.location.href = '/spaces.html';
  throw new Error('No space ID provided');
}

let spaceData = null;

// ── Boot ──────────────────────────────────────────────────────────────────────
await loadSpaceDetails();
setupTabs();
setupSettingsForm();
setupWallSettings();
setupAutoMod();
setupTeam();

// ── Load space details ────────────────────────────────────────────────────────
async function loadSpaceDetails() {
  const res = await api.get(`/api/spaces/${spaceId}`);
  if (!res?.ok) {
    toast('Space not found or unauthorized.', 'error');
    setTimeout(() => window.location.href = '/spaces.html', 1000);
    return;
  }

  spaceData = res.data.data;
  document.getElementById('header-space-title').textContent = spaceData.name;
  document.getElementById('settings-name').value        = spaceData.name || '';
  document.getElementById('settings-slug').value        = spaceData.slug || '';
  document.getElementById('settings-description').value = spaceData.description || '';
  document.getElementById('settings-prompt').value      = spaceData.prompt || 'How was your experience?';
  document.getElementById('settings-enable-rating').checked = !!spaceData.enable_rating;

  // Auto-mod checkboxes
  document.getElementById('auto-approve').checked = !!spaceData.auto_approve_high_rating;
  document.getElementById('auto-feature').checked = !!spaceData.auto_feature_top_rating;

  // View Wall link
  const wallBtn = document.getElementById('btn-view-wall');
  if (wallBtn) wallBtn.href = `/wall.html?space=${spaceData.slug}`;

  // Copy link
  const copyBtn = document.getElementById('btn-copy-link');
  if (copyBtn) {
    const collectUrl = `${window.location.origin}/collect.html?space=${spaceData.slug}`;
    copyBtn.addEventListener('click', () => copyToClipboard(collectUrl, 'Collection link copied!'));
  }

  // Delete space
  const delBtn = document.getElementById('btn-delete-this-space');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Delete "${spaceData.name}"?\n\nThis will permanently delete all testimonials, wall pages, and analytics. This CANNOT be undone.`)) return;
      setLoading(delBtn);
      const delRes = await api.delete(`/api/spaces/${spaceId}`);
      clearLoading(delBtn);
      if (delRes?.ok) {
        toast('Space deleted.', 'success');
        setTimeout(() => window.location.href = '/spaces.html', 800);
      } else {
        toast(delRes?.data?.message || 'Failed to delete space.', 'error');
      }
    });
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function setupTabs() {
  const tabIds = { general: 'tab-general', wall: 'tab-wall', automod: 'tab-automod', team: 'tab-team' };

  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      Object.values(tabIds).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      });
      const target = tabIds[btn.dataset.tab];
      if (target) {
        const el = document.getElementById(target);
        if (el) el.classList.remove('hidden');
      }

      // Load team members when tab opened
      if (btn.dataset.tab === 'team') loadTeam();
      if (btn.dataset.tab === 'wall') loadWallSettings();
    });
  });
}

// ── General settings form ─────────────────────────────────────────────────────
function setupSettingsForm() {
  const form = document.getElementById('form-space-settings');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    setLoading(btn);

    const payload = {
      name:          document.getElementById('settings-name').value.trim(),
      description:   document.getElementById('settings-description').value.trim(),
      prompt:        document.getElementById('settings-prompt').value.trim(),
      enable_rating: document.getElementById('settings-enable-rating').checked,
    };

    const res = await api.put(`/api/spaces/${spaceId}`, payload);
    clearLoading(btn);

    if (res?.ok) {
      toast('Settings saved!', 'success');
      spaceData = res.data.data;
      document.getElementById('header-space-title').textContent = spaceData.name;
    } else {
      toast(res?.data?.message || 'Failed to update settings.', 'error');
    }
  });
}

// ── Wall settings ─────────────────────────────────────────────────────────────
function setupWallSettings() {
  // Sync color picker <-> text input
  const colorPicker = document.getElementById('wall-accent');
  const colorText   = document.getElementById('wall-accent-text');
  if (colorPicker && colorText) {
    colorPicker.addEventListener('input', () => { colorText.value = colorPicker.value; updateWallPreview(); });
    colorText.addEventListener('input', () => {
      if (/^#[0-9a-f]{6}$/i.test(colorText.value)) {
        colorPicker.value = colorText.value;
        updateWallPreview();
      }
    });
  }

  // Live preview on any input change
  ['wall-title','wall-subtitle','wall-show-name','wall-show-role','wall-show-rating','wall-show-date','wall-show-tags'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateWallPreview);
    document.getElementById(id)?.addEventListener('change', updateWallPreview);
  });

  document.getElementById('btn-save-wall')?.addEventListener('click', saveWallSettings);
}

async function loadWallSettings() {
  const res = await api.get(`/api/spaces/${spaceId}/wall-settings`);
  if (!res?.ok) return;

  const s = res.data.data || {};
  setVal('wall-title',    s.wall_title    ?? 'Wall of Love');
  setVal('wall-subtitle', s.wall_subtitle ?? '');
  setVal('wall-layout',   s.layout        ?? 'grid');
  setVal('wall-sort',     s.sort_by       ?? 'newest');
  setVal('wall-per-page', s.per_page      ?? 12);

  const accent = s.accent_color || '#7C3AED';
  const colorPicker = document.getElementById('wall-accent');
  const colorText   = document.getElementById('wall-accent-text');
  if (colorPicker) colorPicker.value = accent;
  if (colorText)   colorText.value   = accent;

  setCheck('wall-show-name',   s.show_name   !== false);
  setCheck('wall-show-role',   s.show_role   !== false);
  setCheck('wall-show-rating', s.show_rating !== false);
  setCheck('wall-show-date',   s.show_date   !== false);
  setCheck('wall-show-tags',   s.show_tags   !== false);

  updateWallPreview();
}

async function saveWallSettings() {
  const btn = document.getElementById('btn-save-wall');
  setLoading(btn);

  const payload = {
    wall_title:    document.getElementById('wall-title')?.value.trim() || 'Wall of Love',
    wall_subtitle: document.getElementById('wall-subtitle')?.value.trim() || '',
    layout:        document.getElementById('wall-layout')?.value || 'grid',
    sort_by:       document.getElementById('wall-sort')?.value || 'newest',
    per_page:      parseInt(document.getElementById('wall-per-page')?.value) || 12,
    accent_color:  document.getElementById('wall-accent-text')?.value || '#7C3AED',
    show_name:     document.getElementById('wall-show-name')?.checked !== false,
    show_role:     document.getElementById('wall-show-role')?.checked !== false,
    show_rating:   document.getElementById('wall-show-rating')?.checked !== false,
    show_date:     document.getElementById('wall-show-date')?.checked !== false,
    show_tags:     document.getElementById('wall-show-tags')?.checked !== false,
  };

  const res = await api.put(`/api/spaces/${spaceId}/wall-settings`, payload);
  clearLoading(btn);
  if (res?.ok) toast('Wall settings saved!', 'success');
  else         toast(res?.data?.message || 'Save failed.', 'error');
}

function updateWallPreview() {
  const accent   = document.getElementById('wall-accent-text')?.value || '#7C3AED';
  const showName = document.getElementById('wall-show-name')?.checked !== false;
  const showRole = document.getElementById('wall-show-role')?.checked !== false;
  const showDate = document.getElementById('wall-show-date')?.checked !== false;
  const showRating = document.getElementById('wall-show-rating')?.checked !== false;
  const showTags = document.getElementById('wall-show-tags')?.checked !== false;

  const starsEl = document.getElementById('preview-stars');
  const nameEl  = document.getElementById('preview-name');
  const roleEl  = document.getElementById('preview-role');
  const dateEl  = document.getElementById('preview-date');
  const tagEl   = document.getElementById('preview-tag');
  const tagPill = document.getElementById('preview-tag-pill');

  if (starsEl)  starsEl.style.display = showRating ? '' : 'none';
  if (nameEl)   nameEl.style.display  = showName ? '' : 'none';
  if (roleEl)   roleEl.style.display  = showRole ? '' : 'none';
  if (dateEl)   dateEl.style.display  = showDate ? '' : 'none';
  if (tagEl)    tagEl.style.display   = showTags ? '' : 'none';

  if (tagPill) {
    tagPill.style.background = accent + '22';
    tagPill.style.color      = accent;
  }
  if (starsEl) starsEl.style.color = '#F5B942';
}

// ── Auto-moderation ───────────────────────────────────────────────────────────
function setupAutoMod() {
  document.getElementById('btn-save-automod')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-automod');
    setLoading(btn);

    const payload = {
      auto_approve_high_rating: document.getElementById('auto-approve')?.checked || false,
      auto_feature_top_rating:  document.getElementById('auto-feature')?.checked || false,
    };

    const res = await api.put(`/api/spaces/${spaceId}`, payload);
    clearLoading(btn);
    if (res?.ok) toast('Automation settings saved!', 'success');
    else         toast(res?.data?.message || 'Save failed.', 'error');
  });
}

// ── Team management ───────────────────────────────────────────────────────────
function setupTeam() {
  document.getElementById('btn-invite-member')?.addEventListener('click', inviteMember);
}

async function loadTeam() {
  const listEl = document.getElementById('team-list');
  if (!listEl) return;
  listEl.innerHTML = '<p class="text-sm text-muted">Loading…</p>';

  const res = await api.get(`/api/spaces/${spaceId}/team`);
  if (!res?.ok) { listEl.innerHTML = '<p class="text-sm text-muted">Could not load team members.</p>'; return; }

  const members = res.data.data || [];
  if (members.length === 0) {
    listEl.innerHTML = '<p class="text-sm text-muted">No team members yet. Invite someone above.</p>';
    return;
  }

  listEl.innerHTML = members.map(m => `
    <div class="team-row">
      <div class="avatar avatar-sm" style="flex-shrink:0">${m.name.charAt(0).toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:var(--text-sm);color:var(--black)">${esc(m.name)}</div>
        <div style="font-size:var(--text-xs);color:var(--muted)">${esc(m.email)}</div>
      </div>
      <span class="badge badge-${m.role === 'admin' ? 'violet' : 'default'}">${m.role}</span>
      <span class="badge badge-${m.status === 'active' ? 'success' : 'pending'}">${m.status}</span>
      <button class="btn btn-sm btn-danger btn-remove-member" data-id="${m.id}" data-name="${esc(m.name)}">Remove</button>
    </div>
  `).join('');

  listEl.querySelectorAll('.btn-remove-member').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Remove ${btn.dataset.name} from this space?`)) return;
      const res = await api.delete(`/api/spaces/${spaceId}/team/${btn.dataset.id}`);
      if (res?.ok) { toast('Member removed.', 'success'); loadTeam(); }
      else          { toast(res?.data?.message || 'Remove failed.', 'error'); }
    });
  });
}

async function inviteMember() {
  const emailInput = document.getElementById('invite-email');
  const roleInput  = document.getElementById('invite-role');
  const btn        = document.getElementById('btn-invite-member');
  const devBox     = document.getElementById('invite-dev-box');
  const devLink    = document.getElementById('invite-dev-link');

  const email = emailInput?.value.trim();
  const role  = roleInput?.value || 'viewer';
  if (!email) { toast('Please enter an email address.', 'error'); return; }

  setLoading(btn);
  const res = await api.post(`/api/spaces/${spaceId}/team`, { email, role, name: email.split('@')[0] });
  clearLoading(btn);

  if (res?.ok) {
    toast('Invite sent!', 'success');
    if (emailInput) emailInput.value = '';

    const devData = res.data?.data;
    if (devData?.dev_invite?.invite_url && devBox && devLink) {
      devLink.href        = devData.dev_invite.invite_url;
      devLink.textContent = devData.dev_invite.invite_url;
      devBox.classList.remove('hidden');
    }
    loadTeam();
  } else {
    toast(res?.data?.message || 'Invite failed.', 'error');
  }
}

// ── Sidebar / user info ───────────────────────────────────────────────────────
function renderUserInfo(user) {
  const nameEl  = document.getElementById('sidebar-user-name');
  const emailEl = document.getElementById('sidebar-user-email');
  const avatarEl = document.getElementById('sidebar-avatar');
  if (nameEl)  nameEl.textContent  = user.name;
  if (emailEl) emailEl.textContent = user.email;
  if (avatarEl && createAvatar) {
    const av = createAvatar(user.name, 'sm');
    avatarEl.replaceWith(av);
    av.id = 'sidebar-avatar';
  }
}

function setupLogout() {
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await api.post('/api/auth/logout');
    window.location.href = '/login.html';
  });
}

function setupMobileMenu() {
  const hamburger = document.getElementById('hamburger');
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebar-overlay');
  if (!hamburger || !sidebar) return;

  function openMenu()  { sidebar.classList.add('open'); overlay?.classList.add('open'); hamburger.setAttribute('aria-expanded','true'); }
  function closeMenu() { sidebar.classList.remove('open'); overlay?.classList.remove('open'); hamburger.setAttribute('aria-expanded','false'); }

  hamburger.addEventListener('click', () => sidebar.classList.contains('open') ? closeMenu() : openMenu());
  overlay?.addEventListener('click', closeMenu);
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function setVal(id, val)     { const el = document.getElementById(id); if (el) el.value = val; }
function setCheck(id, val)   { const el = document.getElementById(id); if (el) el.checked = val; }
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
