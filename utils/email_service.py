"""
Email service — sends real emails via SMTP when credentials are configured.
Falls back to dev-mode console output if SMTP is not set up.

Reads from environment:
    SMTP_HOST    — e.g. smtp.gmail.com
    SMTP_PORT    — e.g. 587 (STARTTLS)
    SMTP_USER    — your Gmail / SMTP username
    SMTP_PASS    — Gmail App Password (NOT your regular password)
    SMTP_FROM    — From address shown in the email
    APP_BASE_URL — Base URL used to build verify/invite links
"""
import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

# ── SMTP config from environment ───────────────────────────────────────────────
SMTP_HOST    = os.getenv("SMTP_HOST", "")
SMTP_PORT    = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER    = os.getenv("SMTP_USER", "")
SMTP_PASS    = os.getenv("SMTP_PASS", "")
SMTP_FROM    = os.getenv("SMTP_FROM", "")
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:5000")

# Use real SMTP when all three required vars are set
USE_SMTP = bool(SMTP_HOST and SMTP_USER and SMTP_PASS)


# ── Low-level SMTP sender ──────────────────────────────────────────────────────
def _send_smtp(to_email: str, subject: str, html_body: str, text_body: str = "") -> bool:
    """
    Send an email via SMTP.
    Uses STARTTLS (port 587) or SSL (port 465) automatically.
    Returns True on success, False on failure.
    """
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = SMTP_FROM or SMTP_USER
        msg["To"]      = to_email

        if text_body:
            msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(msg["From"], [to_email], msg.as_string())
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                server.ehlo()
                server.starttls()
                server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(msg["From"], [to_email], msg.as_string())

        logger.info(f"[EMAIL] Sent '{subject}' to {to_email}")
        return True

    except smtplib.SMTPAuthenticationError:
        print(
            f"\n[TRUSTFRAME] Gmail authentication failed for {SMTP_USER}!\n"
            f"  The SMTP_PASS in .env is wrong or expired.\n"
            f"  To fix:\n"
            f"    1. Go to https://myaccount.google.com/apppasswords\n"
            f"    2. Sign in with {SMTP_USER}\n"
            f"    3. Create a new App Password named 'TrustFrame'\n"
            f"    4. Copy the 16-char code (e.g. 'abcd efgh ijkl mnop')\n"
            f"    5. Set SMTP_PASS=abcdefghijklmnop in .env (no spaces)\n"
            f"  Falling back to dev mode — link shown on-screen.\n"
        )
        return False
    except Exception as exc:
        logger.error(f"[EMAIL] SMTP error for {to_email}: {exc}")
        return False



# ── Email templates ────────────────────────────────────────────────────────────
_BASE_HTML = """
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {{ margin:0; padding:0; background:#F0EBFF; font-family:'Segoe UI',Arial,sans-serif; }}
  .wrap {{ max-width:560px; margin:40px auto; background:#ffffff;
           border-radius:20px; overflow:hidden;
           box-shadow:0 8px 40px rgba(109,40,217,0.14); }}
  .header {{ background:linear-gradient(135deg,#5B21B6 0%,#7C3AED 60%,#6D28D9 100%);
             padding:36px 40px 28px; text-align:center; position:relative; }}
  .header-accent {{ position:absolute; top:0; right:0; width:120px; height:120px;
                    background:rgba(255,255,255,0.05); border-radius:0 0 0 120px; }}
  .logo-wrap {{ display:inline-flex; align-items:center; gap:10px; }}
  .logo-icon {{ width:40px; height:40px; background:rgba(255,255,255,0.18);
                border-radius:10px; display:inline-flex; align-items:center;
                justify-content:center; font-size:22px; }}
  .logo-text {{ font-size:22px; font-weight:900; letter-spacing:-0.5px; }}
  .logo-trust {{ color:#ffffff; }}
  .logo-frame {{ color:#c4b5fd; }}
  .tagline {{ color:rgba(255,255,255,0.65); font-size:12px; margin-top:6px; letter-spacing:0.05em; }}
  .body {{ padding:36px 40px; }}
  .title {{ font-size:22px; font-weight:800; color:#1a1a2e; margin:0 0 10px; }}
  .text {{ font-size:15px; color:#555; line-height:1.6; margin:0 0 24px; }}
  .btn {{ display:inline-block; padding:14px 32px;
          background:linear-gradient(135deg,#7C3AED,#5B21B6);
          color:#fff !important; text-decoration:none; border-radius:10px;
          font-weight:700; font-size:15px;
          box-shadow:0 4px 14px rgba(124,58,237,0.35); }}
  .or {{ color:#aaa; font-size:13px; margin:20px 0 8px; }}
  .link {{ font-size:12px; color:#7C3AED; word-break:break-all; }}
  .divider {{ height:1px; background:linear-gradient(90deg,transparent,#e5e7eb,transparent); margin:28px 0; }}
  .footer {{ background:#F0EBFF; padding:20px 40px; text-align:center;
             font-size:12px; color:#9ca3af; border-top:1px solid #ede9fe; }}
  .footer a {{ color:#7C3AED; text-decoration:none; }}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="header-accent"></div>
    <div class="logo-wrap">
      <div class="logo-icon">🛡️</div>
      <div class="logo-text">
        <span class="logo-trust">Trust</span><span class="logo-frame">Frame</span>
      </div>
    </div>
    <div class="tagline">COLLECT · SHOWCASE · GROW</div>
  </div>
  <div class="body">
    {content}
  </div>
  <div class="footer">
    © 2025 TrustFrame &nbsp;·&nbsp; This email was sent to {to_email}<br>
    <a href="{app_url}">Visit TrustFrame</a>
  </div>
</div>
</body>
</html>
"""


# ── Public functions ───────────────────────────────────────────────────────────

def send_verification_email(to_email: str, name: str, token: str) -> dict:
    """
    Send an email verification link.
    Uses real SMTP when configured, otherwise prints to console.
    Always returns a dict with verify_url (for on-screen display in dev mode).
    """
    verify_url = f"{APP_BASE_URL}/verify-email.html?token={token}"

    print(f"\n[TRUSTFRAME] Email verification for {to_email}:")
    print(f"  Verification URL: {verify_url}")
    print(f"  Token: {token}\n")
    logger.info(f"[EMAIL] Verify URL for {to_email}: {verify_url}")

    sent = False
    if USE_SMTP:
        first_name = name.split()[0] if name else "there"
        content = f"""
        <p class="title">✉️ Verify your email address</p>
        <p class="text">Hi {first_name},<br><br>
        Thanks for signing up for <strong>TrustFrame</strong>!
        Click the button below to verify your email and activate your account.</p>
        <a href="{verify_url}" class="btn">✓ Verify my email</a>
        <p class="or">Or copy this link into your browser:</p>
        <p class="link">{verify_url}</p>
        <div class="divider"></div>
        <p class="text" style="margin-top:0;font-size:13px;color:#aaa">
        This link expires in 24 hours. If you didn't sign up for TrustFrame, you can safely ignore this email.</p>
        """
        html = _BASE_HTML.format(content=content, to_email=to_email, app_url=APP_BASE_URL)
        text = f"Verify your TrustFrame account:\n{verify_url}\n\nThis link expires in 24 hours."
        sent = _send_smtp(to_email, "Verify your TrustFrame account ✓", html, text)

        if sent:
            logger.info(f"[EMAIL] Verification email sent to {to_email}")
        else:
            logger.warning(f"[EMAIL] SMTP failed — falling back to dev mode for {to_email}")

    return {
        "dev_mode": not sent,
        "smtp_sent": sent,
        "verify_url": verify_url,
        "token": token,
    }


def send_campaign_request(to_email: str, to_name: str, from_name: str,
                          message: str, collection_link: str) -> dict:
    """Send a campaign review-request email."""
    print(f"\n[TRUSTFRAME] Campaign email to {to_email}:")
    print(f"  Collection link: {collection_link}\n")

    sent = False
    if USE_SMTP:
        first_name = to_name.split()[0] if to_name else "there"
        custom_msg = f"<p class='text'>{message}</p>" if message else ""
        content = f"""
        <p class="title">⭐ You've been asked to share a review</p>
        <p class="text">Hi {first_name},<br><br>
        <strong>{from_name}</strong> would love to hear your feedback.
        It only takes 60 seconds!</p>
        {custom_msg}
        <a href="{collection_link}" class="btn">✍️ Leave a review</a>
        <p class="or">Or copy this link:</p>
        <p class="link">{collection_link}</p>
        <div class="divider"></div>
        <p class="text" style="margin-top:0;font-size:13px;color:#aaa">
        Powered by TrustFrame — the trusted review platform.</p>
        """
        html = _BASE_HTML.format(content=content, to_email=to_email, app_url=APP_BASE_URL)
        text = f"You've been asked to leave a review by {from_name}:\n{collection_link}"
        sent = _send_smtp(to_email, f"{from_name} would love your feedback ⭐", html, text)

    return {"dev_mode": not sent, "smtp_sent": sent, "collection_link": collection_link}


def send_team_invite(to_email: str, space_name: str, inviter_name: str,
                     role: str, token: str) -> dict:
    """Send a team-invite email."""
    invite_url = f"{APP_BASE_URL}/accept-invite.html?token={token}"
    print(f"\n[TRUSTFRAME] Team invite to {to_email}:")
    print(f"  Invite URL: {invite_url}\n")

    sent = False
    if USE_SMTP:
        content = f"""
        <p class="title">🤝 You've been invited to join a Space</p>
        <p class="text"><strong>{inviter_name}</strong> has invited you to collaborate
        on <strong>{space_name}</strong> on TrustFrame as <em>{role}</em>.</p>
        <a href="{invite_url}" class="btn">Accept invitation</a>
        <p class="or">Or copy this link:</p>
        <p class="link">{invite_url}</p>
        <div class="divider"></div>
        <p class="text" style="margin-top:0;font-size:13px;color:#aaa">
        If you weren't expecting this invitation, you can safely ignore it.</p>
        """
        html = _BASE_HTML.format(content=content, to_email=to_email, app_url=APP_BASE_URL)
        text = f"You've been invited to {space_name} on TrustFrame:\n{invite_url}"
        sent = _send_smtp(to_email, f"Invitation to join {space_name} on TrustFrame", html, text)

    return {"dev_mode": not sent, "smtp_sent": sent, "invite_url": invite_url, "token": token}
