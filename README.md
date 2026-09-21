# TrustFrame — Testimonial & Social Proof Platform

> **Collect testimonials. Showcase trust. Grow with proof.**  
> A full-stack SaaS platform designed to collect, curate, moderate, and showcase authentic customer reviews and social proof without any technical barrier.

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, Modern CSS3 (Variables & Animations), Vanilla JavaScript (ES Modules), Chart.js |
| **Backend** | Python 3.11+, Flask REST API, Flask-JWT-Extended, Flask-Limiter, Flask-CORS |
| **Database** | MongoDB with PyMongo |
| **Authentication** | JWT stored in secure `httpOnly` cookies with refresh token rotation & bcrypt hashing |
| **Email Service** | SMTP (Gmail App Password support) with branded HTML templates and dev-mode fallback |

---

## ✨ Features

- **Branded Collection Spaces** — Create and configure spaces with custom headers, prompts, tags, and theme accents.
- **Public Review Collection** — Shareable collection link with zero sign-in friction for end users. Supports 1–5 star ratings, avatar/name/title inputs, and optional photo uploads.
- **Moderation Inbox** — Comprehensive dashboard inbox to approve, reject, archive, feature, or like submitted testimonials.
- **Wall of Love** — Public, responsive masonry wall showcasing approved testimonials with dynamic average rating and review counts.
- **Embed Generator** — Embed widgets directly into any website (Grid, Carousel, Masonry, Badge) with copy-paste HTML iframe code and live preview.
- **Email Review Campaigns** — Launch personalized email campaigns to request testimonials directly from customers with tracking.
- **Analytics & Insights** — Visual breakdown of average ratings, rating distribution, and submission trends with Chart.js.
- **Space Customization & Team Settings** — Fine-tune wall titles, custom form fields, thank-you messages, webhook notifications, and invite team members with roles.
- **Secure Authentication** — Email verification, JWT authentication with auto-refreshing sessions, and password recovery.

---

## 📂 Project Structure

```
proofly/
├── app.py                     # Flask application entry point & blueprint registration
├── config.py                  # Environment and application configuration
├── database.py                # MongoDB connection and collection initialization
├── requirements.txt           # Python dependencies
├── .env.example               # Example environment variables
│
├── models/                    # Data models & validation schemas
│   ├── user_model.py          # User accounts, auth & verification
│   ├── space_model.py         # Space settings, form config & wall options
│   ├── testimonial_model.py   # Testimonials, ratings & moderation states
│   ├── campaign_model.py      # Email collection campaigns & recipient tracking
│   ├── team_model.py          # Team members & permissions
│   └── token_model.py         # Refresh token storage for rotation
│
├── routes/                    # API endpoints
│   ├── auth_routes.py         # Signup, login, verification, refresh, logout, password reset
│   ├── user_routes.py         # Profile & account management
│   ├── space_routes.py        # Space CRUD & settings
│   ├── testimonial_routes.py  # Moderation actions (approve, reject, feature, etc.)
│   ├── campaign_routes.py     # Campaign creation, sending & metrics
│   ├── public_routes.py       # Public collection, wall data & embed payloads
│   └── analytics_routes.py    # Rating stats & chart data
│
├── utils/                     # Utility services & helpers
│   ├── email_service.py       # SMTP email sender & responsive HTML templates
│   ├── validation.py          # Input sanitization and validators
│   └── helpers.py             # Response wrappers & slug generators
│
├── middleware/                # Security & request filters
│   └── auth_middleware.py     # JWT extraction & role validation
│
└── frontend/                  # Web interface
    ├── index.html             # Landing page
    ├── login.html             # User login
    ├── signup.html            # Account registration
    ├── verify-email.html      # Email token verification
    ├── forgot-password.html   # Password reset request
    ├── reset-password.html    # Password update
    ├── dashboard.html         # Overview dashboard
    ├── spaces.html            # Space management
    ├── create-space.html      # Space creation wizard
    ├── space-settings.html    # Space configuration, team & wall settings
    ├── testimonials.html      # Moderation inbox & review list
    ├── analytics.html         # Analytics dashboard with Chart.js
    ├── campaigns.html         # Email campaign manager
    ├── embed.html             # Embed generator & preview tool
    ├── collect.html           # Public review submission page
    ├── wall.html              # Public Wall of Love page
    ├── embed-view.html        # Lightweight iframe widget target
    │
    ├── images/
    │   └── logo.png           # TrustFrame 3D Shield mark
    │
    ├── css/
    │   ├── main.css           # Global typography, colors & UI components
    │   ├── auth.css           # Authentication layout & card styles
    │   ├── dashboard.css      # Sidebar, topbar, grid cards & controls
    │   ├── collection.css     # Public collection form theme
    │   └── wall.css           # Masonry grid & Wall of Love theme
    │
    └── js/
        ├── api.js             # Fetch client with auto token refresh & error handling
        ├── auth.js            # Auth forms & session management
        ├── dashboard.js       # Dashboard overview metrics & activity
        ├── spaces.js          # Space listing & quick actions
        ├── space-settings.js  # Space settings, wall config & team management
        ├── testimonials.js    # Moderation inbox logic & batch filters
        ├── analytics.js       # Chart.js rendering & metric computations
        ├── campaigns.js       # Campaign wizard & tracking
        ├── embed.js           # Widget builder & snippet generator
        ├── collection.js      # Interactive submission form logic
        ├── wall.js            # Public masonry loader & statistics
        └── utils.js           # Toast alerts, date formatting & clipboard helpers
```

---

## 🛠️ Installation & Setup

### 1. Prerequisites
- **Python 3.11+** installed
- **MongoDB** running locally (`mongodb://localhost:27017`) or a MongoDB Atlas URI

### 2. Environment Configuration
Create a `.env` file in the `proofly/` directory (or copy from `.env.example`):

```env
# Flask Settings
SECRET_KEY=your-super-secret-key-change-in-production
FLASK_DEBUG=True

# MongoDB Connection
MONGO_URI=mongodb://localhost:27017/proofly

# JWT Authentication
JWT_SECRET_KEY=jwt-secret-key-change-in-production
JWT_REFRESH_SECRET_KEY=jwt-refresh-secret-key-change-in-production

# App URLs
FRONTEND_URL=http://localhost:5000
APP_BASE_URL=http://localhost:5000

# Email Service (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-google-app-password
SMTP_FROM=TrustFrame <your-email@gmail.com>
```

### 3. Install Dependencies
```bash
cd proofly
pip install -r requirements.txt
```

### 4. Start the Application
```bash
python app.py
```
Flask will start at `http://localhost:5000`.

Open your browser and navigate to:
- **Landing Page**: `http://localhost:5000/`
- **Dashboard**: `http://localhost:5000/dashboard.html`
- **Login**: `http://localhost:5000/login.html`

---

## 🔌 API Reference

### 🔐 Authentication (`/api/auth`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/signup` | Register new account and send verification email |
| `POST` | `/api/auth/login` | Authenticate user & issue JWT `httpOnly` cookies |
| `GET` | `/api/auth/verify-email?token=...` | Verify email address token |
| `POST` | `/api/auth/resend-verification` | Resend verification email |
| `POST` | `/api/auth/refresh` | Rotate refresh token & issue new access token |
| `POST` | `/api/auth/logout` | Revoke active session & clear cookies |
| `POST` | `/api/auth/forgot-password` | Request password reset token |
| `POST` | `/api/auth/reset-password` | Set new password with reset token |

### 🏢 Spaces (`/api/spaces`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/spaces` | List all spaces owned by or shared with current user |
| `POST` | `/api/spaces` | Create a new space |
| `GET` | `/api/spaces/:id` | Get space configuration and details |
| `PUT` | `/api/spaces/:id` | Update space settings, wall design, and notifications |
| `DELETE` | `/api/spaces/:id` | Delete space and its associated testimonials |
| `POST` | `/api/spaces/:id/team` | Invite a team member |
| `DELETE` | `/api/spaces/:id/team/:userId` | Remove a team member |

### 💬 Testimonials (`/api/testimonials`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/testimonials?space_id=...` | List testimonials with status/rating/search filters |
| `POST` | `/api/testimonials/:id/approve` | Approve a testimonial |
| `POST` | `/api/testimonials/:id/reject` | Reject a testimonial |
| `POST` | `/api/testimonials/:id/archive` | Archive a testimonial |
| `POST` | `/api/testimonials/:id/feature` | Toggle featured status |
| `POST` | `/api/testimonials/:id/like` | Toggle liked status |
| `DELETE` | `/api/testimonials/:id` | Permanently delete a testimonial |

### ✉️ Campaigns (`/api/campaigns`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/campaigns?space_id=...` | List campaigns for a space |
| `POST` | `/api/campaigns` | Create and send email collection campaign |
| `GET` | `/api/campaigns/:id` | Get campaign statistics and delivery status |

### 📊 Analytics (`/api/analytics`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/spaces/:id/analytics` | Summary metrics, rating distributions & timeline stats |

### 🌐 Public Endpoints (`/api/public` — No Auth Required)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/public/spaces/:slug` | Retrieve space details for collection page |
| `POST` | `/api/public/spaces/:slug/testimonials` | Submit a customer testimonial |
| `GET` | `/api/public/spaces/:slug/wall` | Retrieve approved testimonials for Wall of Love |
| `GET` | `/api/public/embed/:slug` | Retrieve widget data for iframe embed |

---

## 🎨 Design System

TrustFrame uses a refined modern liquid violet theme:

- **Primary Violet**: `#7C3AED` (Main brand & accents)
- **Deep Violet**: `#5B21B6` / `#3B0764` (Sidebar & gradients)
- **Light Violet Accent**: `#A78BFA` / `#C4B5FD`
- **Dark Surface**: `#120B1E` / `#1E1030`
- **Typography**: `Plus Jakarta Sans` / `Manrope` (Headings) + `Inter` (Body)

---

## 📄 License

This project is licensed under the MIT License.
