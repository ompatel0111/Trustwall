/**
 * dashboard.js — Dashboard page logic.
 *
 * Loads: user greeting, stats (avg rating, totals), recent testimonials.
 * Renders the sidebar user info.
 */

import api from './api.js';
import { requireAuth, toast, renderStars, formatDate, createAvatar, copyToClipboard } from './utils.js';

// ── Init ──────────────────────────────────────────────────────────────────────
const user = await requireAuth();
if (!user) throw new Error('Redirect in progress');

// Set greeting and user info in sidebar
renderUserInfo(user);
renderGreeting(user);

// Load data
await loadStats();
await loadRecentTestimonials();
setupLogout();
setupMobileMenu();

// ── Greeting ──────────────────────────────────────────────────────────────────
function renderGreeting(user) {
  const hour = new Date().getHours();
  const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const firstName = user.name.split(' ')[0];

  // Page header greeting
  const el = document.getElementById('greeting');
  if (el) el.textContent = `Good ${period}, ${firstName}.`;

  // Banner greeting
  const banner = document.getElementById('greeting-banner');
  const emoji = hour < 12 ? '☀️' : hour < 17 ? '👋' : '🌙';
  if (banner) banner.textContent = `Good ${period}, ${firstName}! ${emoji}`;
}

// ── Sidebar user info ─────────────────────────────────────────────────────────
function renderUserInfo(user) {
  const nameEl  = document.getElementById('sidebar-user-name');
  const emailEl = document.getElementById('sidebar-user-email');
  const avatarEl = document.getElementById('sidebar-avatar');

  if (nameEl)  nameEl.textContent  = user.name;
  if (emailEl) emailEl.textContent = user.email;
  if (avatarEl) {
    const av = createAvatar(user.name, 'sm');
    avatarEl.replaceWith(av);
    av.id = 'sidebar-avatar';
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function loadStats() {
  // Fetch all spaces first, then aggregate analytics
  const spacesRes = await api.get('/api/spaces');
  if (!spacesRes?.ok) return;

  const spaces = spacesRes.data.data || [];

  // Show space count
  setEl('stat-spaces', spaces.length);

  if (spaces.length === 0) {
    setEl('stat-avg',      '–');
    setEl('stat-total',    '0');
    setEl('stat-pending',  '0');
    setEl('stat-featured', '0');
    return;
  }

  // For the first space (most recent), load analytics
  const first = spaces[0];
  const analyticsRes = await api.get(`/api/spaces/${first.id}/analytics`);

  if (analyticsRes?.ok) {
    const stats = analyticsRes.data.data;
    setEl('stat-avg',   stats.avg_rating || '–');
    setEl('stat-total', stats.total);
  }

  // Load pending count across all spaces
  let pending = 0, featured = 0;
  for (const space of spaces) {
    const res = await api.get(`/api/testimonials?space_id=${space.id}&status=pending&per_page=1`);
    if (res?.ok) pending += res.data.data?.total || 0;

    const featRes = await api.get(`/api/testimonials?space_id=${space.id}&status=approved&per_page=100`);
    if (featRes?.ok) {
      const items = featRes.data.data?.testimonials || [];
      featured += items.filter(t => t.featured).length;
    }
  }
  setEl('stat-pending',  pending);
  setEl('stat-featured', featured);
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Recent Testimonials ───────────────────────────────────────────────────────
async function loadRecentTestimonials() {
  const container = document.getElementById('recent-testimonials');
  if (!container) return;

  const spacesRes = await api.get('/api/spaces');
  if (!spacesRes?.ok || !spacesRes.data.data?.length) {
    container.innerHTML = renderEmpty();
    return;
  }

  const firstSpace = spacesRes.data.data[0];
  const res = await api.get(`/api/testimonials?space_id=${firstSpace.id}&status=pending&per_page=5`);
  if (!res?.ok) return;

  const items = res.data.data?.testimonials || [];
  if (items.length === 0) {
    container.innerHTML = renderEmpty();
    return;
  }

  container.innerHTML = items.map(t => `
    <div class="testimonial-item animate-fade-in">
      ${createAvatarHTML(t.name, 'md')}
      <div class="testimonial-meta">
        <div class="testimonial-name">${esc(t.name)}</div>
        <div class="testimonial-role">${esc(t.company_role || '')} · ${formatDate(t.created_at)}</div>
        <div class="testimonial-review">${esc(t.review)}</div>
      </div>
      <div class="testimonial-actions">
        ${t.rating ? renderStars(t.rating) : ''}
        <span class="badge badge-pending">Pending</span>
      </div>
    </div>
  `).join('');
}

function createAvatarHTML(name, size) {
  const initials = name.trim().split(/\s+/).map(p => p[0]).join('').slice(0,2).toUpperCase();
  return `<div class="avatar avatar-${size}" data-initial="${initials[0] || '?'}" aria-label="${esc(name)}">${initials}</div>`;
}

function renderEmpty() {
  return `
    <div class="empty-state">
      <div class="empty-icon">✉</div>
      <div class="empty-title">No testimonials yet</div>
      <div class="empty-desc">Create a space and share your collection link to start gathering reviews.</div>
    </div>
  `;
}

// ── Escape HTML — prevent XSS ─────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Logout ────────────────────────────────────────────────────────────────────
function setupLogout() {
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await api.post('/api/auth/logout');
      window.location.href = '/login.html';
    });
  }
}

// ── Mobile menu ───────────────────────────────────────────────────────────────
function setupMobileMenu() {
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (!hamburger || !sidebar) return;

  function openMenu() {
    sidebar.classList.add('open');
    overlay?.classList.add('open');
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    sidebar.classList.remove('open');
    overlay?.classList.remove('open');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
  }

  hamburger.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeMenu() : openMenu();
  });
  overlay?.addEventListener('click', closeMenu);
}
