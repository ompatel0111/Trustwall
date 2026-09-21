/**
 * analytics.js — Analytics page logic.
 *
 * Features: space selector, date filters, Chart.js charts,
 * rating distribution bars, and CSV export.
 */

import api from './api.js';
import { requireAuth, renderStars } from './utils.js';

// ── Chart.js instances (destroyed + recreated on filter change) ───────────────
let charts = {};
function destroyCharts() {
  Object.values(charts).forEach(c => c?.destroy());
  charts = {};
}

// ── Violet palette ────────────────────────────────────────────────────────────
const C = {
  violet:      'rgba(124,58,237,0.85)',
  violetFill:  'rgba(124,58,237,0.15)',
  violetMid:   'rgba(139,92,246,0.85)',
  gold:        'rgba(245,185,66,0.85)',
  green:       'rgba(34,197,94,0.75)',
  red:         'rgba(239,68,68,0.75)',
  blue:        'rgba(59,130,246,0.75)',
  purple:      'rgba(168,85,247,0.75)',
  gridColor:   'rgba(0,0,0,0.06)',
};

const DIST_COLORS = [C.violet, C.violetMid, C.gold, C.green, C.red];

// ── State ─────────────────────────────────────────────────────────────────────
let currentDays = 90;
let activeSpace = null;
let spaceId     = null;
let lastData    = null;

try {
  const user = await requireAuth();
  if (!user) throw new Error('Redirect in progress');

  const spacesRes = await api.get('/api/spaces');
  const spaces = spacesRes?.ok ? (spacesRes.data.data || []) : [];

  const noSpacesEl = document.getElementById('no-spaces-state');
  const mainEl     = document.getElementById('analytics-main');

  if (spaces.length === 0) {
    if (noSpacesEl) noSpacesEl.classList.remove('hidden');
    if (mainEl) mainEl.style.display = 'none';
    document.getElementById('space-name')?.textContent === 'No spaces created yet.';
    throw new Error('No spaces');
  }

  const params = new URLSearchParams(window.location.search);
  spaceId = params.get('space');

  activeSpace = spaces.find(s => s.id === spaceId || s.slug === spaceId);
  if (!activeSpace) {
    const savedId = localStorage.getItem('trustframe_active_space');
    activeSpace = spaces.find(s => s.id === savedId) || spaces[0];
    spaceId = activeSpace.id;
  }

  localStorage.setItem('trustframe_active_space', activeSpace.id);

  if (params.get('space') !== activeSpace.id) {
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('space', activeSpace.id);
    window.history.replaceState(null, '', newUrl);
  }

  // ── Space selector ────────────────────────────────────────────────────────
  const spaceSelect = document.getElementById('space-select');
  if (spaceSelect) {
    spaceSelect.innerHTML = spaces.map(s =>
      `<option value="${s.id}" ${s.id === activeSpace.id ? 'selected' : ''}>${escHtml(s.name)}</option>`
    ).join('');
    spaceSelect.classList.remove('hidden');
    spaceSelect.addEventListener('change', e => {
      localStorage.setItem('trustframe_active_space', e.target.value);
      window.location.search = `?space=${e.target.value}`;
    });
  }

  // ── Date filter buttons ───────────────────────────────────────────────────
  document.querySelectorAll('.date-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.date-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDays = btn.dataset.days === 'all' ? null : parseInt(btn.dataset.days);
      loadAnalytics();
    });
  });

  // ── Export CSV ────────────────────────────────────────────────────────────
  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    if (!lastData) return;
    const rows = [['Month', 'Reviews', 'Avg Rating']];
    (lastData.reviews_by_month || []).forEach(m => {
      const avg = (lastData.avg_by_month || []).find(a => a.month === m.month);
      rows.push([m.month, m.count, avg ? avg.avg_rating.toFixed(1) : '—']);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `trustframe-analytics-${activeSpace.slug}.csv`;
    a.click();
  });

  await loadAnalytics();

} catch (e) {
  if (e.message !== 'Redirect in progress' && e.message !== 'No spaces') {
    console.error('Analytics init error:', e);
  }
}

// ── Load analytics data ───────────────────────────────────────────────────────
async function loadAnalytics() {
  const titleEl = document.getElementById('space-name');
  if (titleEl) titleEl.textContent = `Analytics for "${activeSpace.name}"`;

  const qs = currentDays ? `?days=${currentDays}` : '';
  const res = await api.get(`/api/spaces/${spaceId}/analytics${qs}`);

  const barsContainer = document.getElementById('rating-bars');

  if (!res?.ok) {
    if (barsContainer) barsContainer.innerHTML = `<p class="text-sm text-muted p-4">Could not load analytics. ${res?.data?.message || ''}</p>`;
    return;
  }

  const data = res.data.data || {};
  lastData = data;

  const { avg_rating = 0, total = 0, distribution = {}, pending_count = 0 } = data;

  const dist = {
    5: Number(distribution[5] ?? distribution['5'] ?? 0),
    4: Number(distribution[4] ?? distribution['4'] ?? 0),
    3: Number(distribution[3] ?? distribution['3'] ?? 0),
    2: Number(distribution[2] ?? distribution['2'] ?? 0),
    1: Number(distribution[1] ?? distribution['1'] ?? 0),
  };

  const totalRated    = dist[5] + dist[4] + dist[3] + dist[2] + dist[1];
  const recommendRate = totalRated > 0 ? Math.round(((dist[5] + dist[4]) / totalRated) * 100) : 0;
  const fiveStarPct   = totalRated > 0 ? Math.round((dist[5] / totalRated) * 100) : 0;

  // ── Summary stat values ───────────────────────────────────────────────────
  setEl('stat-avg',        totalRated > 0 && avg_rating ? avg_rating.toFixed(1) : '—');
  setEl('stat-total',      total || 0);
  setEl('stat-pending',    pending_count || 0);
  setEl('stat-avg-stars',  totalRated > 0 && avg_rating ? renderStars(Math.round(avg_rating)) : '');
  setEl('stat-recommend',  totalRated > 0 ? `${recommendRate}%` : '—');
  setEl('stat-five-star',  totalRated > 0 ? `${fiveStarPct}%` : '—');
  setEl('stat-rated-count', `${totalRated} rating${totalRated !== 1 ? 's' : ''}`);

  // ── Charts ────────────────────────────────────────────────────────────────
  destroyCharts();

  const reviewsByMonth = data.reviews_by_month || [];
  const avgByMonth     = data.avg_by_month     || [];
  const tagsBreakdown  = data.tags_breakdown   || [];

  const monthLabels    = reviewsByMonth.map(m => m.month);
  const monthCounts    = reviewsByMonth.map(m => m.count);
  const avgValues      = avgByMonth.map(m => m.avg_rating);

  // Reviews over time
  const ctxTime = document.getElementById('chart-reviews-time');
  if (ctxTime) {
    charts.reviewsTime = new Chart(ctxTime, {
      type: 'line',
      data: {
        labels: monthLabels,
        datasets: [{
          label: 'Reviews',
          data: monthCounts,
          borderColor: C.violet,
          backgroundColor: C.violetFill,
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: C.violet,
          tension: 0.35,
          fill: true,
        }]
      },
      options: chartOptions('Reviews', 0),
    });
  }

  // Avg rating over time
  const ctxAvg = document.getElementById('chart-avg-time');
  if (ctxAvg) {
    charts.avgTime = new Chart(ctxAvg, {
      type: 'line',
      data: {
        labels: avgByMonth.map(m => m.month),
        datasets: [{
          label: 'Avg Rating',
          data: avgValues,
          borderColor: C.gold,
          backgroundColor: 'rgba(245,185,66,0.12)',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: C.gold,
          tension: 0.35,
          fill: true,
        }]
      },
      options: { ...chartOptions('Avg Rating', 1), scales: { y: { min: 1, max: 5, ticks: { stepSize: 1 }, grid: { color: C.gridColor } }, x: { grid: { display: false } } } },
    });
  }

  // Rating distribution doughnut
  const ctxDist = document.getElementById('chart-dist');
  if (ctxDist) {
    charts.dist = new Chart(ctxDist, {
      type: 'doughnut',
      data: {
        labels: ['5★', '4★', '3★', '2★', '1★'],
        datasets: [{
          data: [dist[5], dist[4], dist[3], dist[2], dist[1]],
          backgroundColor: DIST_COLORS,
          borderWidth: 2,
          borderColor: '#fff',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { font: { size: 11 }, padding: 10 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} reviews` } },
        },
        cutout: '62%',
      },
    });
  }

  // Tags bar chart
  const ctxTags = document.getElementById('chart-tags');
  if (ctxTags && tagsBreakdown.length > 0) {
    const top10 = tagsBreakdown.slice(0, 10);
    charts.tags = new Chart(ctxTags, {
      type: 'bar',
      data: {
        labels: top10.map(t => t.tag),
        datasets: [{
          label: 'Reviews',
          data: top10.map(t => t.count),
          backgroundColor: C.violetFill,
          borderColor: C.violet,
          borderWidth: 1.5,
          borderRadius: 4,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.raw} reviews` } } },
        scales: { x: { grid: { color: C.gridColor }, ticks: { stepSize: 1 } }, y: { grid: { display: false } } },
      },
    });
  } else if (ctxTags) {
    const p = document.createElement('p');
    p.className = 'text-xs text-muted';
    p.style.padding = '1rem 0';
    p.textContent = 'No tags found in approved reviews.';
    ctxTags.replaceWith(p);
  }

  // ── Rating distribution bars ──────────────────────────────────────────────
  if (!barsContainer) return;
  const maxCount = Math.max(...Object.values(dist), 1);
  barsContainer.innerHTML = [5, 4, 3, 2, 1].map(star => {
    const count = dist[star];
    const pct   = totalRated > 0 ? Math.round((count / totalRated) * 100) : 0;
    const width = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
    return `
      <div class="rating-bar-row">
        <div class="rating-bar-label">${star} <span style="color:var(--gold);font-size:0.9rem">★</span></div>
        <div class="rating-bar-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${star} stars: ${count} review${count !== 1 ? 's' : ''}">
          <div class="rating-bar-fill" style="width:${width}%"></div>
        </div>
        <div class="rating-bar-count">${count}</div>
        <div class="text-xs text-muted" style="width:36px;text-align:right">${pct}%</div>
      </div>`;
  }).join('');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function chartOptions(yLabel, minY = 0) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      y: { beginAtZero: true, min: minY, grid: { color: C.gridColor }, ticks: { stepSize: 1 } },
      x: { grid: { display: false } },
    },
    elements: { line: { borderJoinStyle: 'round' } },
  };
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (typeof val === 'string' && val.includes('<')) el.innerHTML = val;
  else el.textContent = val;
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
