/**
 * utils.js — Shared frontend utilities.
 *
 * Includes:
 *   - Toast notification system
 *   - Avatar initials generator
 *   - Star rating renderer
 *   - Date formatter
 *   - Copy to clipboard
 *   - Loading button state helpers
 */

// ── Toast Notifications ───────────────────────────────────────────────────────

// Create the toast container if it doesn't exist
function _ensureToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration - ms before auto-dismiss
 */
export function toast(message, type = 'info', duration = 3500) {
  const container = _ensureToastContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');

  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  el.innerHTML = `<span style="flex-shrink:0">${icon}</span><span>${message}</span>`;

  container.appendChild(el);

  // Auto-dismiss after `duration`ms
  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}

// ── Avatar ────────────────────────────────────────────────────────────────────

/**
 * Generate 1–2 letter initials from a name.
 * @param {string} name
 * @returns {string} e.g. "JD" or "A"
 */
export function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts[0]) return parts[0][0].toUpperCase();
  return '?';
}

/**
 * Create an avatar element (div with initials).
 * @param {string} name
 * @param {string} size - 'sm', 'md', 'lg', 'xl'
 */
export function createAvatar(name, size = 'md') {
  const initials = getInitials(name);
  const el = document.createElement('div');
  el.className = `avatar avatar-${size}`;
  el.textContent = initials;
  el.dataset.initial = initials[0] || '?';
  el.setAttribute('aria-label', name);
  return el;
}

// ── Stars ─────────────────────────────────────────────────────────────────────

/**
 * Render a star rating display (read-only).
 * @param {number|null} rating - 1–5 or null
 * @param {string} size - CSS font-size value
 */
export function renderStars(rating, size = '0.9rem') {
  if (!rating) return '';
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(`<span class="star ${i <= rating ? 'filled' : ''}" style="font-size:${size}">★</span>`);
  }
  return `<div class="stars" aria-label="${rating} out of 5 stars">${stars.join('')}</div>`;
}

// ── Date formatting ───────────────────────────────────────────────────────────

/**
 * Format an ISO date string as a human-readable relative time or date.
 * @param {string} isoString
 */
export function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (secs < 60)   return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days < 7)    return `${days}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Clipboard ─────────────────────────────────────────────────────────────────

/**
 * Copy text to clipboard and show a toast.
 * @param {string} text
 * @param {string} successMsg
 */
export async function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
  try {
    await navigator.clipboard.writeText(text);
    toast(successMsg, 'success');
  } catch {
    // Fallback for older browsers
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    toast(successMsg, 'success');
  }
}

// ── Button loading state ──────────────────────────────────────────────────────

/**
 * Put a button into loading state.
 * @param {HTMLButtonElement} btn
 */
export function setLoading(btn) {
  btn.disabled = true;
  btn.classList.add('loading');
  btn._originalText = btn.innerHTML;
  const span = btn.querySelector('.btn-text');
  if (span) span.style.opacity = '0';
}

/**
 * Restore a button from loading state.
 * @param {HTMLButtonElement} btn
 */
export function clearLoading(btn) {
  btn.disabled = false;
  btn.classList.remove('loading');
  if (btn._originalText) {
    btn.innerHTML = btn._originalText;
    delete btn._originalText;
  }
}

// ── Slugify (mirrors backend logic) ──────────────────────────────────────────

export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Route guard — redirect unauthenticated users ──────────────────────────────

/**
 * Check if the user is logged in by hitting /api/user/me.
 * If they're not, redirect to login.
 */
export async function requireAuth() {
  try {
    const res = await fetch('/api/user/me', {
      credentials: 'include',
    });
    if (!res.ok) {
      window.location.href = '/login.html';
      return null;
    }
    const data = await res.json();
    const user = data.data;

    // Automatically populate sidebar user profile if present
    const nameEl  = document.getElementById('sidebar-user-name');
    const emailEl = document.getElementById('sidebar-user-email');
    const avEl    = document.getElementById('sidebar-avatar');
    if (nameEl && user?.name) nameEl.textContent = user.name;
    if (emailEl && user?.email) emailEl.textContent = user.email;
    if (avEl && user?.name) {
      const initials = getInitials(user.name);
      avEl.textContent = initials;
      avEl.dataset.initial = initials[0] || '?';
    }

    return user;
  } catch {
    window.location.href = '/login.html';
    return null;
  }
}

/**
 * If already authenticated, redirect away from auth pages.
 */
export async function redirectIfAuthed(to = '/dashboard.html') {
  try {
    const res = await fetch('/api/user/me', {
      credentials: 'include',
    });
    if (res.ok) window.location.href = to;
  } catch { /* not logged in, stay on page */ }
}
