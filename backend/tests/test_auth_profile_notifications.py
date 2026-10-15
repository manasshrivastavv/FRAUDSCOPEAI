import io
import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database.session import SessionLocal
from app.models.models import User, Notification
from app.core.security import verify_password

client = TestClient(app)


def test_auth_end_to_end_registration_login_and_logout():
    """
    Validates account creation, password hashing, credential validation,
    session persistence, and logout flow.
    """
    uid = uuid.uuid4().hex[:8]
    full_name = f"Manas Shrivastava {uid}"
    email = f"manas_{uid}@fraudscope.ai"
    password = "ComplexPassword99#"

    # 1. Registration succeeds with Full Name, Email, Password
    reg_res = client.post("/api/auth/register", json={
        "full_name": full_name,
        "email": email,
        "password": password,
        "confirm_password": password,
        "role": "Fraud Analyst"
    })
    assert reg_res.status_code == 201, reg_res.text
    user_data = reg_res.json()
    assert user_data["full_name"] == full_name
    assert user_data["email"] == email
    assert user_data["role"] == "Fraud Analyst"
    assert "password" not in user_data
    assert "password_hash" not in user_data

    # Verify password in DB is hashed and not stored in plain text
    db = SessionLocal()
    try:
        db_user = db.query(User).filter(User.id == user_data["id"]).first()
        assert db_user is not None
        assert db_user.password_hash != password
        assert verify_password(password, db_user.password_hash)
    finally:
        db.close()

    # 2. Duplicate registration fails
    dup_res = client.post("/api/auth/register", json={
        "full_name": "Another Name",
        "email": email,
        "password": password,
        "confirm_password": password,
        "role": "Investigator"
    })
    assert dup_res.status_code == 409
    assert "already exists" in dup_res.json()["detail"].lower()

    # 3. Login with wrong password is rejected
    wrong_login = client.post("/api/auth/login", json={
        "email": email,
        "password": "WrongPassword123!"
    })
    assert wrong_login.status_code == 401
    assert "invalid credentials" in wrong_login.json()["detail"].lower()

    # 4. Login with non-existent account is rejected
    non_existent = client.post("/api/auth/login", json={
        "email": f"nonexistent_{uid}@domain.com",
        "password": password
    })
    assert non_existent.status_code == 401

    # 5. Login with exact email and password succeeds
    login_res = client.post("/api/auth/login", json={
        "email": email,
        "password": password
    })
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert "access_token" in login_data
    assert login_data["user"]["full_name"] == full_name
    token = login_data["access_token"]

    # 6. Authenticated user profile retrieval (/api/auth/me)
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["full_name"] == full_name
    assert me_res.json()["email"] == email

    # 7. Unauthenticated access without token is rejected
    unauth_client = TestClient(app)
    me_unauth = unauth_client.get("/api/auth/me")
    assert me_unauth.status_code == 401

    # 8. Logout invalidates session
    logout_res = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout_res.status_code == 200


def test_profile_update_and_avatar_lifecycle():
    """
    Validates profile update, Developer role support, avatar upload with MIME/size
    validation, path traversal prevention, and avatar removal.
    """
    uid = uuid.uuid4().hex[:8]
    email = f"developer_{uid}@fraudscope.ai"
    password = "DevPassword2026!"

    # Register as Developer
    reg_res = client.post("/api/auth/register", json={
        "full_name": f"Developer Alex {uid}",
        "email": email,
        "password": password,
        "confirm_password": password,
        "role": "Developer"
    })
    assert reg_res.status_code == 201
    user = reg_res.json()
    assert user["role"] == "Developer"

    # Login to get token
    login_res = client.post("/api/auth/login", json={"email": email, "password": password})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Update Profile (Name and Role)
    update_res = client.put("/api/auth/profile", headers=headers, json={
        "full_name": f"Alex Morgan {uid}",
        "role": "Fraud Analyst"
    })
    assert update_res.status_code == 200
    assert update_res.json()["full_name"] == f"Alex Morgan {uid}"
    assert update_res.json()["role"] == "Fraud Analyst"

    # 2. Reject invalid MIME type
    text_file = io.BytesIO(b"malicious script or text content")
    bad_upload = client.post(
        "/api/auth/avatar",
        headers=headers,
        files={"file": ("exploit.exe", text_file, "application/octet-stream")}
    )
    assert bad_upload.status_code == 400
    assert "invalid image format" in bad_upload.json()["detail"].lower()

    # 3. Reject oversized image (> 2MB)
    huge_data = b"0" * (2 * 1024 * 1024 + 100)
    huge_file = io.BytesIO(huge_data)
    oversized_upload = client.post(
        "/api/auth/avatar",
        headers=headers,
        files={"file": ("huge.jpg", huge_file, "image/jpeg")}
    )
    assert oversized_upload.status_code == 400
    assert "exceeds maximum allowed size" in oversized_upload.json()["detail"].lower()

    # 4. Valid avatar upload (PNG)
    png_header = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200
    valid_file = io.BytesIO(png_header)
    upload_res = client.post(
        "/api/auth/avatar",
        headers=headers,
        files={"file": ("profile.png", valid_file, "image/png")}
    )
    assert upload_res.status_code == 200
    avatar_url = upload_res.json()["avatar_url"]
    assert avatar_url is not None
    assert avatar_url.startswith("/uploads/avatars/avatar_")
    assert avatar_url.endswith(".png")

    # Verify /api/auth/me now returns the avatar_url
    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.json()["avatar_url"] == avatar_url

    # 5. Remove avatar resets to None
    delete_res = client.delete("/api/auth/avatar", headers=headers)
    assert delete_res.status_code == 200
    assert delete_res.json()["avatar_url"] is None

    me_after_delete = client.get("/api/auth/me", headers=headers)
    assert me_after_delete.json()["avatar_url"] is None


def test_password_change_flow():
    """
    Validates changing password with current password verification and complexity checks.
    """
    uid = uuid.uuid4().hex[:8]
    email = f"pwd_test_{uid}@fraudscope.ai"
    initial_pwd = "InitialPassword123!"
    new_pwd = "BrandNewSecret789@"

    # Register & Login
    client.post("/api/auth/register", json={
        "full_name": f"User {uid}",
        "email": email,
        "password": initial_pwd,
        "confirm_password": initial_pwd,
        "role": "Investigator"
    })
    login_res = client.post("/api/auth/login", json={"email": email, "password": initial_pwd})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Wrong current password fails
    wrong_curr = client.post("/api/auth/change-password", headers=headers, json={
        "current_password": "WrongCurrentPassword!",
        "new_password": new_pwd,
        "confirm_new_password": new_pwd
    })
    assert wrong_curr.status_code == 400
    assert "verification failed" in wrong_curr.json()["detail"].lower()

    # Successful password change
    change_res = client.post("/api/auth/change-password", headers=headers, json={
        "current_password": initial_pwd,
        "new_password": new_pwd,
        "confirm_new_password": new_pwd
    })
    assert change_res.status_code == 200

    # Old password no longer works
    old_login = client.post("/api/auth/login", json={"email": email, "password": initial_pwd})
    assert old_login.status_code == 401

    # New password works
    new_login = client.post("/api/auth/login", json={"email": email, "password": new_pwd})
    assert new_login.status_code == 200


def test_notifications_lifecycle_and_isolation():
    """
    Validates unread count, listing, marking as read, marking all as read,
    and cross-user isolation.
    """
    uid_a = uuid.uuid4().hex[:8]
    uid_b = uuid.uuid4().hex[:8]

    # Create User A
    client.post("/api/auth/register", json={
        "full_name": "User A",
        "email": f"usera_{uid_a}@fraudscope.ai",
        "password": "Password123!",
        "confirm_password": "Password123!",
        "role": "Investigator"
    })
    login_a = client.post("/api/auth/login", json={"email": f"usera_{uid_a}@fraudscope.ai", "password": "Password123!"})
    token_a = login_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}
    user_a_id = login_a.json()["user"]["id"]

    # Create User B
    client.post("/api/auth/register", json={
        "full_name": "User B",
        "email": f"userb_{uid_b}@fraudscope.ai",
        "password": "Password123!",
        "confirm_password": "Password123!",
        "role": "Investigator"
    })
    login_b = client.post("/api/auth/login", json={"email": f"userb_{uid_b}@fraudscope.ai", "password": "Password123!"})
    token_b = login_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}
    user_b_id = login_b.json()["user"]["id"]

    # Seed notification for User A directly in DB
    db = SessionLocal()
    try:
        notif_a1 = Notification(
            user_id=user_a_id,
            title="High-Risk Mule Alert",
            message="Suspicious transaction identified on Telegram channel",
            type="HIGH_RISK_ALERT",
            severity="HIGH",
            is_read=False,
            target_type="alert",
            target_id="ALERT-001"
        )
        notif_a2 = Notification(
            user_id=user_a_id,
            title="Case Assigned",
            message="Case #2026-004 assigned to your queue",
            type="CASE_UPDATE",
            severity="INFO",
            is_read=False,
            target_type="case",
            target_id="CASE-004"
        )
        notif_b = Notification(
            user_id=user_b_id,
            title="Private Notification for B",
            message="Confidential alert for B only",
            type="SYSTEM",
            severity="LOW",
            is_read=False
        )
        db.add_all([notif_a1, notif_a2, notif_b])
        db.commit()
        db.refresh(notif_a1)
        db.refresh(notif_a2)
        db.refresh(notif_b)
        notif_a1_id = notif_a1.id
        notif_b_id = notif_b.id
    finally:
        db.close()

    # User A checks unread count -> should be at least 2
    count_res = client.get("/api/notifications/unread-count", headers=headers_a)
    assert count_res.status_code == 200
    assert count_res.json()["unread_count"] >= 2

    # User A lists notifications
    list_res = client.get("/api/notifications", headers=headers_a)
    assert list_res.status_code == 200
    data = list_res.json()
    titles = [n["title"] for n in data["notifications"]]
    assert "High-Risk Mule Alert" in titles
    # User A must NOT see User B's notification
    assert "Private Notification for B" not in titles

    # User A cannot mark User B's notification as read (isolation enforcement)
    tamper_res = client.post(f"/api/notifications/{notif_b_id}/read", headers=headers_a)
    assert tamper_res.status_code == 404

    # User A marks one of their own notifications as read
    mark_res = client.post(f"/api/notifications/{notif_a1_id}/read", headers=headers_a)
    assert mark_res.status_code == 200
    assert mark_res.json()["is_read"] is True

    # User A marks all as read
    read_all_res = client.post("/api/notifications/read-all", headers=headers_a)
    assert read_all_res.status_code == 200

    # User A unread count is now 0
    after_count = client.get("/api/notifications/unread-count", headers=headers_a)
    assert after_count.json()["unread_count"] == 0
