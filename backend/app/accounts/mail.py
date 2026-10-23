from email.message import EmailMessage
from pathlib import Path
import smtplib
import ssl
from uuid import uuid4

from app.core.config import get_settings


def send_reset(email: str, token: str) -> None:
    settings = get_settings()
    message = EmailMessage()
    message["Subject"] = (
        "ChronoCampus — password reset / Сброс пароля / Գաղտնաբառի վերականգնում"
    )
    message["From"] = settings.smtp_from or "chronocampus@example.invalid"
    message["To"] = email
    # Fragment is consumed by the frontend; it is never included in HTTP access logs.
    link = settings.public_url.rstrip("/") + "/#reset=" + token
    message.set_content(
        "Open this link to choose a new password. Opening it does not change your password.\n"
        "Откройте ссылку и задайте новый пароль. Сам переход пароль не меняет.\n"
        "Բացեք հղումը և ընտրեք նոր գաղտնաբառ։ Միայն բացելը գաղտնաբառը չի փոխում։\n\n"
        + link
        + f"\n\nExpires in / Срок действия / Ժամկետ: {settings.reset_minutes} min."
    )
    if settings.mail_mode == "file":
        directory = Path(settings.mail_directory)
        directory.mkdir(parents=True, exist_ok=True)
        (directory / f"{uuid4().hex}.eml").write_bytes(message.as_bytes())
    elif settings.mail_mode == "smtp":
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as client:
            client.starttls(context=ssl.create_default_context())
            if settings.smtp_username:
                client.login(
                    settings.smtp_username, settings.smtp_password.get_secret_value()
                )
            client.send_message(message)
    else:
        raise RuntimeError("mail_not_configured")
