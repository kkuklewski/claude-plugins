"""Notification adapters: send one short plain-text message. Pick one with BRAIN_NOTIFY.

    stdout    print it (default; useful with cron mail or a log)
    telegram  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   (bot chats are not end-to-end encrypted)
    slack     SLACK_WEBHOOK_URL                      (an incoming webhook for one channel)
    email     SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASSWORD, MAIL_FROM, MAIL_TO

Whatever the channel, send counts, never titles: notifications land on lock screens and in other
people's inboxes. Replacing the channel never changes the vault.
"""
from __future__ import annotations

import json
import os
import smtplib
import ssl
import urllib.parse
import urllib.request
from email.message import EmailMessage


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _post(url: str, payload: dict) -> None:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:  # noqa: S310 (URL is operator config)
        r.read()


def send(text: str, channel: str | None = None) -> str:
    channel = (channel or _env("BRAIN_NOTIFY", "stdout")).lower()
    if channel == "stdout":
        print(text)
    elif channel == "telegram":
        token = urllib.parse.quote(_env("TELEGRAM_BOT_TOKEN"), safe=":")
        _post(f"https://api.telegram.org/bot{token}/sendMessage",
              {"chat_id": _env("TELEGRAM_CHAT_ID"), "text": text, "disable_web_page_preview": True})
    elif channel == "slack":
        _post(_env("SLACK_WEBHOOK_URL"), {"text": text})
    elif channel == "email":
        msg = EmailMessage()
        msg["Subject"], msg["From"], msg["To"] = text.splitlines()[0][:120], _env("MAIL_FROM"), _env("MAIL_TO")
        msg.set_content(text)
        with smtplib.SMTP(_env("SMTP_HOST"), int(_env("SMTP_PORT", "587")), timeout=30) as s:
            s.starttls(context=ssl.create_default_context())
            if _env("SMTP_USER"):
                s.login(_env("SMTP_USER"), _env("SMTP_PASSWORD"))
            s.send_message(msg)
    else:
        raise ValueError(f"unknown BRAIN_NOTIFY channel {channel!r}")
    return channel
