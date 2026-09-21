/**
 * collection.js — Public testimonial collection form.
 *
 * No authentication required.
 * Reads space slug from URL: /collect.html?space=acme-corp
 * Loads space info, renders form, handles submission.
 */

const API_BASE = 'http://localhost:5000';

const params = new URLSearchParams(window.location.search);
const slug   = params.get('space');

if (!slug) {
  document.body.innerHTML = '<div style="text-align:center;padding:4rem;font-family:Inter,sans-serif"><h2>Invalid collection link.</h2></div>';
  throw new Error('No space slug');
}

let spaceData = null;
let selectedRating = 5;
const selectedTags = new Set();

await initCollectionPage();

// ── Load space ────────────────────────────────────────────────────────────────
async function initCollectionPage() {
  try {
    const res = await fetch(`${API_BASE}/api/public/spaces/${slug}`, {
      credentials: 'include',
    });

    if (!res.ok) {
      showError('This collection page does not exist.');
      return;
    }

    const data = await res.json();
    spaceData = data.data;

    renderPage();
    setupRatingSelector();
    setupTagChips();
    setupLivePreview();
    setupForm();
  } catch {
    showError('Cannot connect to server. Please try again later.');
  }
}

// ── Render page content from space data ───────────────────────────────────────
function renderPage() {
  const s = spaceData;
  const initials = s.name.trim().split(/\s+/).map(p => p[0]).join('').slice(0,2).toUpperCase();

  // Logo
  const logoEl = document.getElementById('collect-logo');
  if (logoEl) { logoEl.textContent = initials; }

  // Brand name
  const nameEl = document.getElementById('collect-brand-name');
  if (nameEl) nameEl.textContent = s.name;

  // Prompt
  const promptEl = document.getElementById('collect-prompt');
  if (promptEl) promptEl.textContent = s.prompt || 'How was your experience?';

  // Update page title
  document.title = `Share your experience — ${s.name}`;

  // Rating section
  const ratingSection = document.getElementById('rating-section');
  if (ratingSection) {
    ratingSection.style.display = s.enable_rating ? '' : 'none';
  }

  // Custom questions
  const customContainer = document.getElementById('custom-questions');
  if (customContainer && s.custom_questions?.length) {
    customContainer.innerHTML = s.custom_questions.map((q, i) => `
      <div class="form-group">
        <label class="form-label" for="custom-${i}">${esc(q)}</label>
        <input type="text" id="custom-${i}" class="input" placeholder="Your answer" data-custom-index="${i}">
      </div>
    `).join('');
  }
}

// ── Star rating selector ──────────────────────────────────────────────────────
function setupRatingSelector() {
  const container = document.getElementById('rating-stars');
  if (!container) return;

  const stars = container.querySelectorAll('.star-btn');
  const labels = ['', '1 ★ Poor', '2 ★ Fair', '3 ★ Good', '4 ★ Great Experience', '5 ★ Outstanding! Loved it 💜'];

  function setRating(rating) {
    selectedRating = rating;
    stars.forEach((btn, i) => {
      btn.classList.toggle('active', i < rating);
      btn.setAttribute('aria-pressed', i < rating ? 'true' : 'false');
    });

    const label = document.getElementById('rating-label');
    if (label) label.textContent = labels[rating] || 'Select rating';

    updatePreviewStars(rating);
  }

  stars.forEach((btn, i) => {
    btn.addEventListener('click', () => setRating(i + 1));
    btn.addEventListener('mouseenter', () => {
      stars.forEach((s, j) => s.style.color = j <= i ? '#C9882A' : '');
    });
  });

  container.addEventListener('mouseleave', () => {
    stars.forEach((s, i) => s.style.color = i < selectedRating ? '#C9882A' : '');
  });

  // Default to 5 stars
  setRating(5);
}

function updatePreviewStars(count) {
  const pStars = document.getElementById('preview-stars');
  if (!pStars) return;
  pStars.innerHTML = Array.from({length: 5}, (_, i) => `
    <span style="color:${i < count ? '#C9882A' : '#E7E3E6'}">★</span>
  `).join('');
}

// ── Praise Tag Chips ──────────────────────────────────────────────────────────
function setupTagChips() {
  const container = document.getElementById('tag-chips');
  if (!container) return;

  container.querySelectorAll('.tag-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
        btn.classList.remove('active');
      } else {
        selectedTags.add(tag);
        btn.classList.add('active');
      }
      updatePreviewTags();
    });
  });
}

function updatePreviewTags() {
  const tagsContainer = document.getElementById('preview-tags');
  if (!tagsContainer) return;
  tagsContainer.innerHTML = Array.from(selectedTags).map(t => `
    <span class="preview-tag-pill">${esc(t)}</span>
  `).join('');
}

// ── Real-Time Live Preview Sync ───────────────────────────────────────────────
function setupLivePreview() {
  const nameInput     = document.getElementById('name');
  const roleInput     = document.getElementById('company_role');
  const headlineInput = document.getElementById('headline');
  const reviewInput   = document.getElementById('review');
  const charCounter   = document.getElementById('char-counter');

  const pName     = document.getElementById('preview-name');
  const pRole     = document.getElementById('preview-role');
  const pAvatar   = document.getElementById('preview-avatar');
  const pHeadline = document.getElementById('preview-headline');
  const pBody     = document.getElementById('preview-body');

  function update() {
    const nameVal = nameInput?.value.trim() || 'Jane Smith';
    const roleVal = roleInput?.value.trim() || 'Role / Company';
    const headVal = headlineInput?.value.trim();
    const revVal  = reviewInput?.value.trim() || 'Your review text will preview here in real time as you type…';

    const initials = nameVal.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'JS';

    if (pName)     pName.textContent = nameVal;
    if (pRole)     pRole.textContent = roleVal;
    if (pAvatar)   pAvatar.textContent = initials;
    if (pHeadline) {
      pHeadline.textContent = headVal ? `"${headVal}"` : '';
      pHeadline.style.display = headVal ? '' : 'none';
    }
    if (pBody)     pBody.textContent = revVal;

    if (charCounter && reviewInput) {
      const len = reviewInput.value.length;
      charCounter.textContent = `${len.toLocaleString()} / 2,000`;
      charCounter.style.color = len < 10 ? 'var(--muted)' : 'var(--violet)';
    }
  }

  nameInput?.addEventListener('input', update);
  roleInput?.addEventListener('input', update);
  headlineInput?.addEventListener('input', update);
  reviewInput?.addEventListener('input', update);

  update();
}

// ── Form submission ───────────────────────────────────────────────────────────
function setupForm() {
  const form = document.getElementById('form-collect');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const name        = form.querySelector('[name=name]').value.trim();
    const email       = form.querySelector('[name=email]').value.trim();
    const role        = form.querySelector('[name=company_role]')?.value.trim() || '';
    const headline    = form.querySelector('[name=headline]')?.value.trim() || '';
    const social_link = form.querySelector('[name=social_link]')?.value.trim() || '';
    const review      = form.querySelector('[name=review]').value.trim();
    const consent     = form.querySelector('[name=consent]')?.checked ?? true;

    // Gather custom question answers
    const customAnswers = [];
    form.querySelectorAll('[data-custom-index]').forEach(input => {
      customAnswers[parseInt(input.dataset.customIndex)] = input.value.trim();
    });

    // Frontend validation
    let valid = true;
    if (!name)   { showFieldError('error-name', 'Your name is required.'); valid = false; }
    if (!email || !isValidEmail(email)) { showFieldError('error-email', 'A valid email is required.'); valid = false; }
    if (review.length < 10) { showFieldError('error-review', 'Review must be at least 10 characters.'); valid = false; }
    if (spaceData.enable_rating && !selectedRating) {
      showFieldError('error-rating', 'Please select a star rating.'); valid = false;
    }
    if (!valid) return;

    const submitBtn = form.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');

    try {
      const payload = {
        name,
        email,
        review,
        company_role: role,
        headline,
        social_link,
        tags: Array.from(selectedTags),
        consent,
        custom_answers: customAnswers,
      };
      if (spaceData.enable_rating && selectedRating) {
        payload.rating = selectedRating;
      }

      const res = await fetch(`${API_BASE}/api/public/spaces/${slug}/testimonials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        showFieldError('error-review', data.message || 'Submission failed. Please try again.');
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
        return;
      }

      // Show success state and embed their preview
      document.getElementById('collect-form-area').style.display = 'none';
      const successEl = document.getElementById('collect-success');
      successEl.classList.remove('hidden');

      const previewClone = document.querySelector('.live-preview-card')?.cloneNode(true);
      const successWrap = document.getElementById('success-preview-wrap');
      if (previewClone && successWrap) {
        previewClone.style.maxWidth = '460px';
        previewClone.style.margin = '0 auto';
        successWrap.innerHTML = '';
        successWrap.appendChild(previewClone);
      }

    } catch {
      showFieldError('error-review', 'Cannot connect to server. Please try again.');
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function clearErrors() {
  document.querySelectorAll('.form-error').forEach(el => {
    el.textContent = '';
    el.classList.add('hidden');
  });
}

function showError(msg) {
  document.body.innerHTML = `
    <div style="text-align:center;padding:4rem;font-family:Inter,sans-serif;color:#252525">
      <div style="font-size:2rem;margin-bottom:1rem">😕</div>
      <h2 style="font-family:Manrope,sans-serif;margin-bottom:.5rem">${msg}</h2>
      <p style="color:#747074">Please check the link and try again.</p>
    </div>`;
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
