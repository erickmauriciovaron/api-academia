import html
import logging
import smtplib
from email.message import EmailMessage

import httpx
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .models import NotificationLog

log = logging.getLogger("notify")


def email_layout(title: str, body_html: str, cta_url: str | None = None, cta_text: str | None = None) -> str:
    s = get_settings()
    cta = (
        f'<p style="margin:24px 0"><a href="{html.escape(cta_url)}" style="background:#111827;color:#fff;padding:12px 20px;'
        f'border-radius:8px;text-decoration:none;display:inline-block">{html.escape(cta_text or "Abrir")}</a></p>'
        if cta_url
        else ""
    )
    return (
        '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#111827">'
        f'<h2 style="margin-bottom:8px">{html.escape(title)}</h2>{body_html}{cta}'
        f'<p style="color:#6b7280;font-size:12px;margin-top:32px">{html.escape(s.app_name)}</p></div>'
    )


def send_email(to: str, subject: str, html_body: str) -> bool:
    return deliver_email(to, subject, html_body) is None


def deliver_email(to: str, subject: str, html_body: str) -> str | None:
    """Envía un correo. Devuelve None si salió bien o el motivo del error."""
    s = get_settings()
    if not to:
        return "Sin destinatario"
    if not s.smtp_host:
        log.info("EMAIL (sin SMTP) to=%s subject=%s", to, subject)
        return None
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = s.smtp_from
    msg["To"] = to
    msg.set_content("Este mensaje requiere un cliente de correo compatible con HTML.")
    msg.add_alternative(html_body, subtype="html")
    try:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
            if s.smtp_tls:
                smtp.starttls()
            if s.smtp_user:
                smtp.login(s.smtp_user, s.smtp_password)
            smtp.send_message(msg)
        return None
    except smtplib.SMTPAuthenticationError as e:
        reason = f"Usuario o contraseña SMTP incorrectos ({e.smtp_code})"
    except smtplib.SMTPSenderRefused as e:
        reason = f"El servidor rechazó el remitente {s.smtp_from!r}: {_smtp_text(e.smtp_error)}"
    except smtplib.SMTPRecipientsRefused as e:
        reason = f"Destinatario rechazado: {e.recipients}"
    except smtplib.SMTPResponseException as e:
        reason = f"El servidor SMTP respondió {e.smtp_code}: {_smtp_text(e.smtp_error)}"
    except (smtplib.SMTPException, OSError) as e:
        reason = f"No se pudo conectar con {s.smtp_host}:{s.smtp_port}: {e}"
    log.error("Error enviando correo a %s: %s", to, reason)
    return reason


def _smtp_text(raw) -> str:
    return (raw.decode(errors="replace") if isinstance(raw, bytes) else str(raw))[:300]


def send_whatsapp(phone: str, text: str) -> bool:
    """Envía una plantilla aprobada con un parámetro de cuerpo (WhatsApp Cloud API)."""
    s = get_settings()
    phone = "".join(ch for ch in (phone or "") if ch.isdigit())
    if not (s.whatsapp_token and s.whatsapp_phone_id and phone):
        return False
    try:
        r = httpx.post(
            f"https://graph.facebook.com/v21.0/{s.whatsapp_phone_id}/messages",
            headers={"Authorization": f"Bearer {s.whatsapp_token}"},
            json={
                "messaging_product": "whatsapp",
                "to": phone,
                "type": "template",
                "template": {
                    "name": s.whatsapp_template,
                    "language": {"code": s.whatsapp_lang},
                    "components": [{"type": "body", "parameters": [{"type": "text", "text": text[:1000]}]}],
                },
            },
            timeout=20,
        )
        if r.status_code >= 300:
            log.error("WhatsApp error %s: %s", r.status_code, r.text[:300])
            return False
        return True
    except httpx.HTTPError as e:
        log.error("WhatsApp error: %s", e)
        return False


def notify_once(db: Session, key: str, tenant_id: int | None, channel: str, recipient: str, subject: str, sender) -> bool:
    """Ejecuta `sender()` solo si la clave no se ha usado antes. Devuelve True si envió."""
    if not recipient:
        return False
    entry = NotificationLog(key=key[:200], tenant_id=tenant_id, channel=channel, recipient=recipient[:254], subject=subject)
    try:
        with db.begin_nested():
            db.add(entry)
    except IntegrityError:
        return False
    ok = sender()
    if not ok:
        db.delete(entry)
        db.flush()
    db.commit()
    return ok
