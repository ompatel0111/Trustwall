/**
 * campaigns.js — Campaign list page logic.
 *
 * Features: space selector, create campaign with customers,
 * send requests (SMTP or dev fallback), delete campaign, stats dashboard.
 */

import api from './api.js';
import { requireAuth, toast, setLoading, clearLoading, formatDate, esc } from './utils.js';

let spaceId = null;

async function initPage() {
  const user = await requireAuth();
  if (!user) return;

  const noSpacesEl = document.getElementById('no-spaces-state');
  const mainEl     = document.getElementById('campaigns-main');

  let spaces = [];
  try {
    const spacesRes = await api.get('/api/spaces');
    spaces = spacesRes?.ok ? (spacesRes.data?.data || []) : [];
  } catch (e) {
    console.error('Failed to fetch spaces:', e);
  }

  if (spaces.length === 0) {
    if (noSpacesEl) noSpacesEl.classList.remove('hidden');
    if (mainEl) mainEl.style.display = 'none';
    return;
  }

  if (noSpacesEl) noSpacesEl.classList.add('hidden');
  if (mainEl) mainEl.style.display = 'block';

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

  setupModal();
  await loadCampaigns();
}

// ── Modal Setup ─────────────────────────────────────────────────────────────
function setupModal() {
  const modal = document.getElementById('modal-create-campaign');

  document.getElementById('btn-new-campaign')?.addEventListener('click', () => {
    modal?.classList.remove('hidden');
    document.getElementById('campaign-name')?.focus();
  });
  document.getElementById('btn-close-campaign-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-campaign')?.addEventListener('click', closeModal);
  modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  document.getElementById('form-create-campaign')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    setLoading(btn);

    try {
      const name     = document.getElementById('campaign-name').value.trim();
      const message  = document.getElementById('campaign-message').value.trim();
      const rawLines = document.getElementById('campaign-customers').value.trim().split('\n').filter(l => l.trim());
      const emailRe  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!name) {
        toast('Campaign name is required.', 'error');
        clearLoading(btn);
        return;
      }

      // Parse customers: "Name, Email" per line — skip invalid emails
      const customers = rawLines
        .map(line => {
          const parts = line.split(',');
          const email = (parts.pop() || '').trim();
          const cname = parts.join(',').trim() || email.split('@')[0];
          return emailRe.test(email) ? { name: cname, email } : null;
        })
        .filter(Boolean);

      const skipped = rawLines.length - customers.length;
      if (rawLines.length > 0 && customers.length === 0) {
        toast('No valid customers found. Check email format: Name, email@example.com', 'error');
        clearLoading(btn);
        return;
      }

      // 1. Create campaign
      const createRes = await api.post('/api/campaigns', { space_id: spaceId, name, message });
      if (!createRes?.ok) {
        toast(createRes?.data?.message || 'Failed to create campaign.', 'error');
        clearLoading(btn);
        return;
      }

      const campaignId = createRes.data?.data?.id;

      if (customers.length > 0 && campaignId) {
        // 2. Add customers in one batch call
        const addRes = await api.post(`/api/campaigns/${campaignId}/requests`, { requests: customers });
        if (!addRes?.ok) {
          toast(`Campaign created but could not add customers: ${addRes?.data?.message || 'unknown error'}`, 'error');
          closeModal();
          await loadCampaigns();
          return;
        }

        // 3. Send all requests
        const sendRes = await api.post(`/api/campaigns/${campaignId}/send`, {});
        if (sendRes?.ok) {
          const sent = sendRes.data?.data?.sent || customers.length;
          const skipMsg = skipped > 0 ? ` (${skipped} skipped — invalid email)` : '';
          toast(`Campaign created! ${sent} email request${sent !== 1 ? 's' : ''} dispatched${skipMsg}. 🚀`, 'success');
        } else {
          toast('Campaign created. Requests added but email sending failed.', 'error');
        }
      } else if (customers.length === 0) {
        toast('Campaign created. Add customers and send when ready.', 'success');
      }

      closeModal();
      await loadCampaigns();
    } catch (err) {
      console.error('Error creating campaign:', err);
      toast('An unexpected error occurred.', 'error');
    } finally {
      clearLoading(btn);
    }
  });
}

function closeModal() {
  const modal = document.getElementById('modal-create-campaign');
  modal?.classList.add('hidden');
  document.getElementById('form-create-campaign')?.reset();
  // Reset validation UI
  const badge = document.getElementById('customer-count-badge');
  if (badge) badge.style.display = 'none';
  const valList = document.getElementById('customer-validation-list');
  if (valList) { valList.style.display = 'none'; valList.innerHTML = ''; }

}

// ── Load campaigns ────────────────────────────────────────────────────────────
async function loadCampaigns() {
  const listEl = document.getElementById('campaigns-list');
  if (!listEl) return;

  // Show loading state
  listEl.innerHTML = `
    <div class="campaign-card" style="padding:var(--space-5)">
      <div style="display:flex;gap:var(--space-4)">
        <div class="skeleton" style="width:44px;height:44px;border-radius:var(--radius-md);flex-shrink:0"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:10px">
          <div class="skeleton skeleton-text" style="width:30%"></div>
          <div class="skeleton skeleton-text" style="width:70%"></div>
          <div class="skeleton skeleton-text" style="width:45%"></div>
        </div>
      </div>
    </div>`;

  try {
    const res = await api.get(`/api/campaigns?space_id=${spaceId}`);
    if (!res?.ok) {
      listEl.innerHTML = `
        <div style="padding:3rem;text-align:center">
          <div style="font-size:2rem;margin-bottom:1rem">⚠️</div>
          <p style="color:var(--muted)">Failed to load campaigns. Please refresh.</p>
        </div>`;
      return;
    }

    const campaigns = res.data?.data || [];

    // Compute totals for stats
    let totalSent = 0, totalOpened = 0, totalReceived = 0;
    campaigns.forEach(c => {
      (c.requests || []).forEach(r => {
        if (['sent','opened','submitted'].includes(r.status)) totalSent++;
        if (['opened','submitted'].includes(r.status)) totalOpened++;
        if (r.status === 'submitted') totalReceived++;
      });
    });
    const convRate = totalSent > 0 ? Math.round((totalReceived / totalSent) * 100) + '%' : '—';

    setEl('stat-campaigns',  campaigns.length);
    setEl('stat-sent',       totalSent);
    setEl('stat-opened',     totalOpened);
    setEl('stat-received',   totalReceived);
    setEl('stat-conversion', convRate);

    if (campaigns.length === 0) {
      listEl.innerHTML = `
        <div class="campaigns-empty">
          <div class="campaigns-empty-icon">📣</div>
          <div class="campaigns-empty-title">No campaigns yet</div>
          <div class="campaigns-empty-desc">Create your first campaign to start requesting reviews from customers by email.</div>
          <button class="btn btn-primary" id="btn-empty-new-campaign">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:6px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Campaign
          </button>
        </div>`;
      document.getElementById('btn-empty-new-campaign')?.addEventListener('click', () => {
        document.getElementById('btn-new-campaign')?.click();
      });
      return;
    }

    listEl.innerHTML = campaigns.map(c => renderCampaignCard(c)).join('');
    wireCardActions();
  } catch (err) {
    console.error('Error loading campaigns:', err);
    listEl.innerHTML = `<p style="padding:2rem;color:var(--danger);text-align:center">Error loading campaigns.</p>`;
  }
}

// ── Render one campaign card ──────────────────────────────────────────────────
function renderCampaignCard(c) {
  const requests  = c.requests || [];
  const total     = requests.length;
  const sent      = requests.filter(r => ['sent','opened','submitted'].includes(r.status)).length;
  const received  = requests.filter(r => r.status === 'submitted').length;
  const pending   = requests.filter(r => r.status === 'pending').length;
  const pct       = total > 0 ? Math.round((sent / total) * 100) : 0;

  const statusBadge = c.status === 'active'
    ? '<span class="badge badge-success">Active</span>'
    : '<span class="badge badge-default">' + esc(c.status) + '</span>';

  const icons = ['📣', '📧', '✉️', '📮', '📬'];
  const icon = icons[Math.abs(c.id?.charCodeAt(0) || 0) % icons.length];

  const requestRows = requests.length > 0
    ? requests.map(r => `
        <div class="request-row">
          <div class="request-row-info">
            <div class="request-row-name">${esc(r.name)}</div>
            <div class="request-row-email">${esc(r.email)}</div>
          </div>
          <div class="request-row-status">
            ${{ pending: '<span class="badge badge-default">Pending</span>', sent: '<span class="badge badge-pending">Sent</span>', opened: '<span class="badge badge-violet">Opened</span>', submitted: '<span class="badge badge-success">Submitted</span>' }[r.status] || '<span class="badge badge-default">' + esc(r.status) + '</span>'}
          </div>
          <div class="request-row-date">${r.sent_at ? formatDate(r.sent_at) : '—'}</div>
          <div class="request-row-copy">
            ${r.collection_link ? `<button class="btn btn-ghost btn-sm btn-copy-link" data-link="${esc(r.collection_link)}" title="Copy collection link">🔗</button>` : ''}
          </div>
        </div>`)
      .join('')
    : '<div style="padding:1.5rem;text-align:center;color:var(--muted);font-size:0.875rem">No customers added yet.</div>';

  return `
    <div class="campaign-card" data-campaign-id="${c.id}">
      <div class="campaign-card-header">
        <div class="campaign-card-icon">${icon}</div>
        <div class="campaign-card-info">
          <div class="campaign-card-top">
            <span class="campaign-card-name">${esc(c.name)}</span>
            ${statusBadge}
          </div>
          ${c.message ? `<div class="campaign-card-msg">${esc(c.message.slice(0, 130))}${c.message.length > 130 ? '…' : ''}</div>` : ''}
          <div class="campaign-card-meta">
            <span class="campaign-meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              <strong>${total}</strong> customers
            </span>
            <span class="campaign-meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              <strong>${sent}</strong> sent
            </span>
            <span class="campaign-meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              <strong>${received}</strong> received
            </span>
            <span class="campaign-meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              ${c.created_at ? formatDate(c.created_at) : ''}
            </span>
          </div>
        </div>
        <div class="campaign-card-actions">
          ${pending > 0 ? `<button class="btn btn-sm btn-primary btn-send-campaign" data-id="${c.id}" title="Send to ${pending} pending customer${pending !== 1 ? 's' : ''}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Send (${pending})
          </button>` : `<button class="btn btn-sm btn-secondary btn-send-campaign" data-id="${c.id}" title="Re-send">↗ Re-send</button>`}
          <button class="btn btn-sm btn-secondary btn-toggle-requests" data-id="${c.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            Requests (${total})
          </button>
          <button class="btn btn-sm btn-danger btn-delete-campaign" data-id="${c.id}" title="Delete campaign">🗑</button>
        </div>
      </div>

      ${total > 0 ? `
      <div class="campaign-progress-bar-wrap">
        <div class="campaign-progress-label">
          <span>${pct}% sent</span>
          <span>${sent}/${total}</span>
        </div>
        <div class="campaign-progress-track">
          <div class="campaign-progress-fill" style="width:${pct}%"></div>
        </div>
      </div>` : ''}

      <div class="campaign-requests-panel" id="panel-${c.id}">
        <div class="campaign-requests-header">
          <span class="campaign-requests-header-title">Customer Requests (${total})</span>
        </div>
        ${requestRows}
      </div>
    </div>`;
}

// ── Wire up card buttons ──────────────────────────────────────────────────────
function wireCardActions() {
  // Toggle requests panel
  document.querySelectorAll('.btn-toggle-requests').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(`panel-${btn.dataset.id}`);
      if (!panel) return;
      const isOpen = panel.classList.toggle('open');
      btn.style.background = isOpen ? 'var(--violet-light)' : '';
      btn.style.color = isOpen ? 'var(--violet)' : '';
    });
  });

  // Send campaign
  document.querySelectorAll('.btn-send-campaign').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Send / re-send review request emails to all pending customers?')) return;
      const origText = btn.innerHTML;
      setLoading(btn);
      try {
        const res = await api.post(`/api/campaigns/${btn.dataset.id}/send`, {});
        if (res?.ok) {
          const sent = res.data?.data?.sent ?? 0;
          toast(sent > 0 ? `${sent} email${sent !== 1 ? 's' : ''} sent! 🚀` : 'No pending requests to send.', sent > 0 ? 'success' : 'info');
          await loadCampaigns();
        } else {
          toast(res?.data?.message || 'Send failed.', 'error');
        }
      } catch (e) {
        toast('Failed to send requests.', 'error');
      } finally {
        clearLoading(btn);
      }
    });
  });

  // Delete campaign
  document.querySelectorAll('.btn-delete-campaign').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this campaign permanently? This cannot be undone.')) return;
      try {
        const res = await api.delete(`/api/campaigns/${btn.dataset.id}`);
        if (res?.ok) {
          toast('Campaign deleted.', 'success');
          await loadCampaigns();
        } else {
          toast(res?.data?.message || 'Delete failed.', 'error');
        }
      } catch (e) {
        toast('Failed to delete campaign.', 'error');
      }
    });
  });

  // Copy collection links
  document.querySelectorAll('.btn-copy-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const link = btn.dataset.link;
      if (link) {
        navigator.clipboard.writeText(link).then(() => toast('Collection link copied!', 'success'));
      }
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// Kick off page
initPage();
