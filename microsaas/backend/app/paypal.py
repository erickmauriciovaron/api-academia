"""Cliente mínimo de la API REST de PayPal (Subscriptions v1)."""

import time

import httpx

from .config import get_settings

_token: dict = {"value": None, "exp": 0.0}


class PayPalError(Exception):
    pass


def base_url() -> str:
    return "https://api-m.paypal.com" if get_settings().paypal_mode == "live" else "https://api-m.sandbox.paypal.com"


def enabled() -> bool:
    s = get_settings()
    return s.paypal_mode in ("sandbox", "live") and bool(s.paypal_client_id and s.paypal_client_secret)


def _access_token() -> str:
    if _token["value"] and _token["exp"] > time.time() + 60:
        return _token["value"]
    s = get_settings()
    r = httpx.post(
        f"{base_url()}/v1/oauth2/token",
        auth=(s.paypal_client_id, s.paypal_client_secret),
        data={"grant_type": "client_credentials"},
        timeout=30,
    )
    if r.status_code != 200:
        raise PayPalError(f"OAuth PayPal falló: {r.status_code} {r.text[:200]}")
    data = r.json()
    _token["value"] = data["access_token"]
    _token["exp"] = time.time() + int(data.get("expires_in", 3000))
    return _token["value"]


def request(method: str, path: str, json: dict | None = None, headers: dict | None = None) -> dict:
    h = {"Authorization": f"Bearer {_access_token()}", "Content-Type": "application/json"}
    h.update(headers or {})
    r = httpx.request(method, f"{base_url()}{path}", json=json, headers=h, timeout=30)
    if r.status_code >= 300:
        raise PayPalError(f"PayPal {method} {path} -> {r.status_code}: {r.text[:500]}")
    return r.json() if r.content else {}


def create_product(name: str, description: str) -> str:
    data = request(
        "POST",
        "/v1/catalogs/products",
        {"name": name[:127], "description": description[:256], "type": "SERVICE", "category": "SOFTWARE"},
    )
    return data["id"]


def create_plan(product_id: str, name: str, price: str, interval: str) -> str:
    data = request(
        "POST",
        "/v1/billing/plans",
        {
            "product_id": product_id,
            "name": name[:127],
            "status": "ACTIVE",
            "billing_cycles": [
                {
                    "frequency": {"interval_unit": "YEAR" if interval == "year" else "MONTH", "interval_count": 1},
                    "tenure_type": "REGULAR",
                    "sequence": 1,
                    "total_cycles": 0,
                    "pricing_scheme": {"fixed_price": {"value": price, "currency_code": "USD"}},
                }
            ],
            "payment_preferences": {
                "auto_bill_outstanding": True,
                "setup_fee_failure_action": "CONTINUE",
                "payment_failure_threshold": 3,
            },
        },
        headers={"Prefer": "return=representation"},
    )
    return data["id"]


def create_subscription(plan_id: str, custom_id: str, return_url: str, cancel_url: str, email: str | None = None) -> dict:
    body = {
        "plan_id": plan_id,
        "custom_id": custom_id,
        "application_context": {
            "brand_name": get_settings().paypal_brand_name[:127],
            "user_action": "SUBSCRIBE_NOW",
            "shipping_preference": "NO_SHIPPING",
            "return_url": return_url,
            "cancel_url": cancel_url,
        },
    }
    if email:
        body["subscriber"] = {"email_address": email}
    return request("POST", "/v1/billing/subscriptions", body)


def revise_subscription(subscription_id: str, plan_id: str, return_url: str, cancel_url: str) -> dict:
    return request(
        "POST",
        f"/v1/billing/subscriptions/{subscription_id}/revise",
        {"plan_id": plan_id, "application_context": {"return_url": return_url, "cancel_url": cancel_url}},
    )


def get_subscription(subscription_id: str) -> dict:
    return request("GET", f"/v1/billing/subscriptions/{subscription_id}")


def cancel_subscription(subscription_id: str, reason: str = "Cancelado por el cliente") -> None:
    request("POST", f"/v1/billing/subscriptions/{subscription_id}/cancel", {"reason": reason[:128]})


def approve_link(data: dict) -> str | None:
    return next((link["href"] for link in data.get("links", []) if link.get("rel") == "approve"), None)


def verify_webhook(headers: dict, event: dict) -> bool:
    s = get_settings()
    if not s.paypal_webhook_id:
        return False
    body = {
        "auth_algo": headers.get("paypal-auth-algo"),
        "cert_url": headers.get("paypal-cert-url"),
        "transmission_id": headers.get("paypal-transmission-id"),
        "transmission_sig": headers.get("paypal-transmission-sig"),
        "transmission_time": headers.get("paypal-transmission-time"),
        "webhook_id": s.paypal_webhook_id,
        "webhook_event": event,
    }
    try:
        return request("POST", "/v1/notifications/verify-webhook-signature", body).get("verification_status") == "SUCCESS"
    except PayPalError:
        return False


WEBHOOK_EVENTS = [
    "BILLING.SUBSCRIPTION.ACTIVATED",
    "BILLING.SUBSCRIPTION.UPDATED",
    "BILLING.SUBSCRIPTION.CANCELLED",
    "BILLING.SUBSCRIPTION.SUSPENDED",
    "BILLING.SUBSCRIPTION.EXPIRED",
    "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
    "PAYMENT.SALE.COMPLETED",
    "PAYMENT.SALE.REFUNDED",
]


def create_webhook(url: str) -> str:
    data = request("POST", "/v1/notifications/webhooks", {"url": url, "event_types": [{"name": e} for e in WEBHOOK_EVENTS]})
    return data["id"]


def ensure_webhook(url: str) -> str:
    """Devuelve el id del webhook para `url`, creándolo si no existe."""
    for wh in request("GET", "/v1/notifications/webhooks").get("webhooks", []):
        if wh.get("url") == url:
            return wh["id"]
    return create_webhook(url)


def list_transactions(subscription_id: str, start: str, end: str) -> list[dict]:
    """Cobros de una suscripción entre dos fechas ISO-8601 (UTC)."""
    data = request("GET", f"/v1/billing/subscriptions/{subscription_id}/transactions?start_time={start}&end_time={end}")
    return data.get("transactions", [])
