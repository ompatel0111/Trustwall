# Proofly — Testimonial & Social Proof Collection Platform

A premium SaaS application for collecting, moderating and showcasing customer testimonials.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 + CSS3 + Vanilla JavaScript (ES Modules) |
| Backend | Python + Flask |
| Database | MongoDB (PyMongo) |
| Auth | JWT (httpOnly cookies) + bcrypt |

---

## Features

- Create branded testimonial collection **Spaces**
- Public collection form — no customer login required
- Star rating selector (1–5)
- Moderation inbox (approve / reject / archive / feature)
- **Wall of Love** — public masonry page of approved testimonials
- Embed generator — iframe widget (Grid / Carousel / Badge)
- Analytics — avg rating & rating distribution
- JWT auth with refresh token rotation
- Password reset flow (dev mode: token returned in API response)

---

## Project Structure

```
proofly/
├── app.py              # Flask application factory
├── config.py           # All configuration
├── database.py         # MongoDB connection
├── requirements.txt
├── .env.example
│
├── models/
│   ├── user_model.py
│   ├── space_model.py
│   ├── testimonial_model.py
│   └── token_model.py
│
├── routes/
│   ├── auth_routes.py
│   ├── user_routes.py
│   ├── space_routes.py
│   ├── testimonial_routes.py
│   ├── public_routes.py
│   └── analytics_routes.py
│
├── utils/
│   ├── validation.py
│   └── helpers.py
│
├── middleware/
│   └── auth_middleware.py
│
└── frontend/
    ├── index.html          # Landing page
    ├── login.html
    ├── signup.html
    ├── forgot-password.html
    ├── reset-password.html
    ├── dashboard.html
    ├── spaces.html
    ├── testimonials.html
    ├── analytics.html
    ├── embed.html
    ├── collect.html        # Public — no login
    ├── wall.html           # Public — no login
    ├── embed-view.html     # Iframe embed target
    │
    ├── css/
    │   ├── main.css        # Design system + all components
    │   ├── auth.css
    │   ├── dashboard.css
    │   ├── collection.css
    │   └── wall.css
    │
    └── js/
        ├── api.js          # Centralized fetch + auto-refresh
        ├── auth.js
        ├── dashboard.js
        ├── spaces.js
        ├── testimonials.js
        ├── analytics.js
        ├── collection.js
        ├── wall.js
        ├── embed.js
        └── utils.js
```

---

## Installation

### 1. Prerequisites

- Python 3.11+
- MongoDB running locally (`mongod`)

### 2. Setup

```bash
cd proofly

# Install dependencies
pip install -r requirements.txt

# Copy environment file
copy .env.example .env
```

### 3. Environment variables (`.env`)

```
MONGO_URI=mongodb://localhost:27017/proofly
JWT_SECRET_KEY=change-this-in-production
JWT_REFRESH_SECRET_KEY=change-this-too
SECRET_KEY=flask-secret
FRONTEND_URL=http://127.0.0.1:5500
```

### 4. Start MongoDB

Make sure MongoDB is running:
```bash
mongod
```

### 5. Start Flask

```bash
python app.py
```

Flask runs at: `http://localhost:5000`

### 6. Open Frontend

Open `frontend/index.html` using a Live Server (VS Code → Go Live, or any static file server on port 5500).

Or just open the HTML files directly from the `frontend/` directory.

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | /api/auth/signup | Create account |
| POST | /api/auth/login | Login, receive JWT cookies |
| POST | /api/auth/refresh | Rotate refresh token |
| POST | /api/auth/logout | Revoke token, clear cookies |
| POST | /api/auth/forgot-password | Get reset token (returned in dev) |
| POST | /api/auth/reset-password | Set new password |

### Spaces (auth required)
| Method | Endpoint | Description |
|---|---|---|
| POST | /api/spaces | Create space |
| GET | /api/spaces | List my spaces |
| GET | /api/spaces/:id | Get space |
| PUT | /api/spaces/:id | Update space |
| DELETE | /api/spaces/:id | Delete space + testimonials |

### Testimonials (auth required)
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/testimonials?space_id=... | List with filters |
| POST | /api/testimonials/:id/approve | Approve |
| POST | /api/testimonials/:id/reject | Reject |
| POST | /api/testimonials/:id/archive | Archive |
| POST | /api/testimonials/:id/feature | Toggle featured |
| POST | /api/testimonials/:id/like | Toggle liked |

### Public (no auth)
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/public/spaces/:slug | Space info |
| POST | /api/public/spaces/:slug/testimonials | Submit review |
| GET | /api/public/spaces/:slug/testimonials | Approved reviews |
| GET | /api/public/embed/:slug | Embed data |

### Analytics (auth required)
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/spaces/:id/analytics | Rating stats |

---

## Authentication Flow

```
Signup → Login
         ↓
    Access Token (15 min, httpOnly cookie)
    Refresh Token (7 days, httpOnly cookie, hashed in DB)
         ↓
    Protected API call
         ↓
    Token expired? → POST /api/auth/refresh
         ↓
    Old refresh token revoked
    New access + refresh tokens issued (rotation)
         ↓
    Logout → Refresh token revoked, cookies cleared
```

---

## How to Test

### Password Reset (dev mode)

1. Go to `forgot-password.html`
2. Enter your email
3. The reset token is returned **in the API response** (shown in the form)
4. Copy the token
5. Go to `reset-password.html`
6. Paste the token and set a new password

### Creating a Space

1. Login → Dashboard → Spaces
2. Click "New Space"
3. Fill in name (slug auto-generated)
4. Create

### Collecting Testimonials

1. From Spaces page, click "Copy Link" on a space
2. Open the link in an **incognito window** (or a different browser)
3. The collection form appears — no login needed
4. Submit a review

### Moderating

1. Go to Testimonials page
2. Select your space from URL (`?space=SPACE_ID`)
3. Approve pending testimonials

### Wall of Love

Open: `wall.html?space=YOUR-SLUG`

---

## Design System

Colors follow the **60 / 30 / 10 rule**:
- **60%** White / Off-white (`#FFFFFF`, `#FAF9F7`) — backgrounds
- **30%** Black / Charcoal (`#111111`, `#252525`) — text, navigation
- **10%** Berry Jam (`#6B1D49`) — CTA buttons, active states, accents only

Fonts: **Manrope** (headings) + **Inter** (body) via Google Fonts.
