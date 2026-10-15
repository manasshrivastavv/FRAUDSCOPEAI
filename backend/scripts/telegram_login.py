"""
FraudScope AI - Interactive Telegram MTProto Authorization & Diagnostic Script

This script safely initializes an authorized Telethon session for FraudScope AI.
It inspects Telegram's send_code_request response to provide clear diagnostics
on the code delivery mechanism (In-App Telegram Message vs Cellular SMS vs Email),
handles Telegram rate limits and errors gracefully, and NEVER prints or exposes
sensitive credentials, phone numbers, codes, or session data.

Usage:
  python backend/scripts/telegram_login.py
"""
import os
import sys
import re
import asyncio
import getpass
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv

# Search for .env
if (backend_dir / ".env").exists():
    load_dotenv(backend_dir / ".env")
elif (backend_dir.parent / ".env").exists():
    load_dotenv(backend_dir.parent / ".env")
else:
    load_dotenv()

from telethon import TelegramClient
from telethon.tl.types.auth import (
    SentCode,
    SentCodeTypeApp,
    SentCodeTypeSms,
    SentCodeTypeCall,
    SentCodeTypeFlashCall,
    SentCodeTypeMissedCall,
    SentCodeTypeEmailCode,
    SentCodeTypeFragmentSms,
    SentCodeTypeFirebaseSms
)
from telethon.errors import (
    PhoneNumberInvalidError,
    PhoneNumberBannedError,
    PhoneNumberFloodError,
    PhoneCodeInvalidError,
    PhoneCodeExpiredError,
    PhoneCodeEmptyError,
    SessionPasswordNeededError,
    FloodWaitError,
    SendCodeUnavailableError
)


def mask_phone_safely(phone_raw: str) -> str:
    """Masks phone number for safe display without exposing PII."""
    digits = re.sub(r"[^\d+]", "", phone_raw)
    if len(digits) <= 5:
        return "****"
    return digits[:3] + " " + "*" * max(len(digits) - 7, 3) + " " + digits[-4:]


def describe_delivery_type(code_type_obj) -> str:
    """Explains delivery method in clear human terms."""
    if isinstance(code_type_obj, SentCodeTypeApp):
        return (
            "[!] DELIVERY METHOD: IN-APP TELEGRAM MESSAGE\n"
            "    Telegram sent the code directly to your official Telegram App (mobile/desktop),\n"
            "    NOT to your cellular SMS inbox.\n"
            "\n"
            "    ACTION REQUIRED:\n"
            "    1. Open your Telegram mobile or desktop app.\n"
            "    2. Check the official verified chat named 'Telegram' (with the blue checkmark).\n"
            "    3. Find the message: 'Login code: XXXXX' and type it below."
        )
    elif isinstance(code_type_obj, SentCodeTypeSms):
        return (
            "[!] DELIVERY METHOD: REGULAR SMS\n"
            "    Telegram sent the code via SMS to your mobile phone's SMS messages inbox.\n"
            "    Please check your cellular SMS inbox."
        )
    elif isinstance(code_type_obj, (SentCodeTypeCall, SentCodeTypeFlashCall, SentCodeTypeMissedCall)):
        return (
            "[!] DELIVERY METHOD: PHONE CALL VERIFICATION\n"
            "    Telegram is attempting a phone call / flash call to your number."
        )
    elif isinstance(code_type_obj, SentCodeTypeEmailCode):
        return (
            "[!] DELIVERY METHOD: EMAIL VERIFICATION\n"
            "    Telegram dispatched the verification code to your account recovery email."
        )
    elif isinstance(code_type_obj, SentCodeTypeFragmentSms):
        return (
            "[!] DELIVERY METHOD: FRAGMENT ANONYMOUS SMS\n"
            "    Telegram sent the code via the Fragment platform."
        )
    else:
        type_name = type(code_type_obj).__name__
        return f"[*] Delivery mechanism: {type_name}"


async def authorize_interactive(client: TelegramClient, session_path: str, bot_token: str = ""):
    print("[*] Connecting to Telegram MTProto Data Centers...")
    await client.connect()

    if not client.is_connected():
        print("[!] Network Error: Could not establish MTProto connection with Telegram Data Centers.")
        print("    Please check your internet connection and DNS settings.")
        return False

    # Check if existing session is already authorized
    if await client.is_user_authorized():
        me = await client.get_me()
        user_display = getattr(me, 'username', None) or getattr(me, 'first_name', 'Authorized Account')
        print("=" * 60)
        print(f"[+] Session is ALREADY AUTHORIZED as: @{user_display}")
        print(f"[+] Preserving existing session file: {session_path}.session")
        print("[+] Live surveillance feed is ready to monitor configured channels.")
        print("=" * 60)
        return True

    # If bot token is provided, authorize bot directly
    if bot_token:
        print("[*] Authorizing via TELEGRAM_BOT_TOKEN...")
        await client.start(bot_token=bot_token)
        if await client.is_user_authorized():
            me = await client.get_me()
            print(f"[+] Bot authorization successful as: @{getattr(me, 'username', 'Bot')}")
            return True
        else:
            print("[!] Bot authorization failed.")
            return False

    # Interactive Phone Number Authorization
    print("\n[*] Interactive User Authorization:")
    raw_phone = input("Please enter your phone number with country code (e.g. +91XXXXXXXXXX): ").strip()
    clean_phone = re.sub(r"[^\d+]", "", raw_phone)

    if not clean_phone.startswith("+"):
        clean_phone = "+" + clean_phone

    if len(clean_phone) < 8:
        print("[!] Error: Phone number must include international country code (e.g. +91XXXXXXXXXX).")
        return False

    masked = mask_phone_safely(clean_phone)
    print(f"[*] Requesting authorization code from Telegram for {masked}...")

    try:
        sent_code: SentCode = await client.send_code_request(clean_phone)
    except PhoneNumberInvalidError:
        print("\n[!] Error (PhoneNumberInvalidError):")
        print("    Telegram rejected this phone number format as invalid.")
        print("    Ensure you include the country code (e.g. +91 for India) without dashes or spaces.")
        return False
    except PhoneNumberBannedError:
        print("\n[!] Error (PhoneNumberBannedError):")
        print("    Telegram has banned or restricted this phone number from API access.")
        return False
    except PhoneNumberFloodError:
        print("\n[!] Error (PhoneNumberFloodError):")
        print("    Too many login code requests have been made for this phone number recently.")
        print("    Telegram has temporarily rate-limited your account to prevent abuse.")
        print("    ACTION: Please wait 15-30 minutes before trying again, OR use Option B (Telegram Bot Token).")
        return False
    except FloodWaitError as e:
        print(f"\n[!] Rate Limit (FloodWaitError): Telegram requested a cooldown of {e.seconds} seconds.")
        return False
    except SendCodeUnavailableError:
        print("\n[!] Error (SendCodeUnavailableError): Telegram cannot deliver a code to this number right now.")
        return False
    except Exception as e:
        print(f"\n[!] Unexpected error requesting login code: {type(e).__name__}: {e}")
        return False

    # Explain Delivery Mechanism
    print("\n" + "=" * 60)
    print(describe_delivery_type(sent_code.type))
    if sent_code.timeout:
        print(f"\n[*] Telegram delivery timeout window: {sent_code.timeout} seconds")
    print("=" * 60 + "\n")

    # Prompt for verification code
    code_input = input("Please enter the verification code you received: ").strip()
    clean_code = re.sub(r"\s+", "", code_input)

    if not clean_code:
        print("[!] Error: Verification code cannot be empty.")
        return False

    # Sign in with code
    print("[*] Verifying code with Telegram Data Centers...")
    try:
        await client.sign_in(phone=clean_phone, code=clean_code, phone_code_hash=sent_code.phone_code_hash)
    except SessionPasswordNeededError:
        print("\n[*] Two-Step Verification (2FA Cloud Password) is enabled for this account.")
        pwd = getpass.getpass("Please enter your Telegram 2FA cloud password: ")
        try:
            await client.sign_in(password=pwd)
        except Exception as pwd_err:
            print(f"[!] 2FA verification failed: {type(pwd_err).__name__}: {pwd_err}")
            return False
    except PhoneCodeInvalidError:
        print("\n[!] Error (PhoneCodeInvalidError): The code entered is incorrect.")
        print("    Make sure you entered the newest code from the official 'Telegram' chat.")
        return False
    except PhoneCodeExpiredError:
        print("\n[!] Error (PhoneCodeExpiredError): The verification code has expired.")
        print("    Telegram codes expire after a few minutes. Please rerun the script for a fresh code.")
        return False
    except PhoneCodeEmptyError:
        print("\n[!] Error: Verification code was empty.")
        return False
    except FloodWaitError as e:
        print(f"\n[!] Rate Limit (FloodWaitError): Must wait {e.seconds} seconds.")
        return False
    except Exception as e:
        print(f"\n[!] Sign-in failed: {type(e).__name__}: {e}")
        return False

    # Final verification check
    if await client.is_user_authorized():
        me = await client.get_me()
        user_display = getattr(me, 'username', None) or getattr(me, 'first_name', 'Authorized Account')
        print("\n" + "=" * 60)
        print(f"[+] Authorization SUCCESSFUL! Authenticated as: @{user_display}")
        print(f"[+] Authorized session saved to: {session_path}.session")
        print("[+] Live surveillance feed can now monitor configured channels.")
        print("=" * 60)
        return True
    else:
        print("[!] Authorization could not be completed.")
        return False


def main():
    print("=" * 60)
    print("  FRAUDSCOPE AI - TELEGRAM MTPROTO SESSION DIAGNOSTIC & LOGIN  ")
    print("=" * 60)

    api_id_str = os.getenv("TELEGRAM_API_ID", "").strip()
    api_hash = os.getenv("TELEGRAM_API_HASH", "").strip()
    session_name = os.getenv("TELEGRAM_SESSION_NAME", "fraudscope_telegram").strip()
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()

    if not api_id_str.isdigit() or not api_hash:
        print("[!] Error: TELEGRAM_API_ID and TELEGRAM_API_HASH are not set in backend/.env")
        print("    Please obtain credentials from https://my.telegram.org and add them to backend/.env")
        sys.exit(1)

    api_id = int(api_id_str)
    sessions_dir = backend_dir / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    session_path = str(sessions_dir / session_name)

    print(f"[*] Target session file: backend/sessions/{session_name}.session")

    client = TelegramClient(session_path, api_id, api_hash)

    async def run():
        try:
            return await authorize_interactive(client, session_path, bot_token)
        finally:
            if client.is_connected():
                await client.disconnect()

    success = asyncio.run(run())
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
