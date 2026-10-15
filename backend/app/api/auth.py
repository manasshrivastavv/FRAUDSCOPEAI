import os
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request, UploadFile, File
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.models import User, AuditEvent
from app.schemas.schemas import (
    UserRegisterRequest,
    UserLoginRequest,
    UserProfileUpdateRequest,
    ChangePasswordRequest,
    UserResponse,
    AuthResponse
)
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$')
ALLOWED_REGISTRATION_ROLES = {"Investigator", "Fraud Analyst", "Developer"}
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "avatars")
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_AVATAR_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2 MB max size


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(payload: UserRegisterRequest, db: Session = Depends(get_db)):
    """
    Registers a new user account with persistent database storage.
    Enforces password complexity, role security, and unique constraints.
    """
    full_name_clean = (payload.full_name or "").strip()
    email_clean = (payload.email or "").lower().strip()

    # 1. Full name validation
    if not full_name_clean or len(full_name_clean) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Full name is required (minimum 2 characters)."
        )

    # 2. Email format validation
    if not email_clean or not EMAIL_REGEX.match(email_clean):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid email address (e.g., name@example.com)."
        )

    # 3. Username format validation (auto-generate if omitted)
    if payload.username and payload.username.strip():
        username_clean = payload.username.lower().strip()
        if not re.match(r'^[a-zA-Z0-9_]{3,32}$', username_clean):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username must be 3-32 characters long and contain only letters, numbers, and underscores."
            )
    else:
        # Generate safe username from email prefix
        base_username = re.sub(r'[^a-zA-Z0-9_]', '', email_clean.split('@')[0])
        if len(base_username) < 3:
            base_username = f"user_{base_username}"
        username_clean = base_username[:24]
        candidate = username_clean
        counter = 1
        while db.query(User).filter(User.username == candidate).first():
            candidate = f"{username_clean[:20]}_{counter}"
            counter += 1
        username_clean = candidate

    # 4. Password matching
    if payload.confirm_password and payload.password != payload.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password and confirm password do not match."
        )

    # 5. Password policy: min 8 chars, at least 1 digit or special char
    if not payload.password or len(payload.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters in length."
        )
    if not any(char.isdigit() for char in payload.password) and not any(not char.isalnum() for char in payload.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must include at least one number or special symbol for security."
        )

    # 6. Role Security: Prevent unauthorized escalation to Administrator
    role = payload.role.strip() if payload.role else "Investigator"
    if role not in ALLOWED_REGISTRATION_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Direct self-registration for role '{role}' is prohibited. Public registration is restricted to: {', '.join(sorted(ALLOWED_REGISTRATION_ROLES))}."
        )

    # 7. Check unique constraints (email and username)
    existing_email = db.query(User).filter(User.email == email_clean).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists. Please sign in instead."
        )

    existing_username = db.query(User).filter(User.username == username_clean).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this username already exists. Please choose a different username."
        )

    # 8. Secure password hashing
    pwd_hash = hash_password(payload.password)

    # 9. Persistent database record creation
    new_user = User(
        full_name=full_name_clean,
        email=email_clean,
        username=username_clean,
        password_hash=pwd_hash,
        role=role,
        is_active=True,
        created_at=datetime.now(timezone.utc)
    )
    db.add(new_user)
    db.flush()

    # Log audit event
    audit = AuditEvent(
        actor=username_clean,
        action="USER_REGISTER",
        entity_type="USER",
        entity_id=str(new_user.id),
        details=f"User registered with role {role} ({email_clean})"
    )
    db.add(audit)
    db.commit()
    db.refresh(new_user)

    return new_user


@router.post("/login", response_model=AuthResponse)
def login_user(payload: UserLoginRequest, response: Response, db: Session = Depends(get_db)):
    """
    Authenticates registered user credentials, establishes an authenticated session,
    and sets an HttpOnly session cookie alongside JWT token return.
    """
    identifier_clean = (payload.email or payload.username_or_email or "").lower().strip()
    if not identifier_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide your email address or username to sign in."
        )

    if not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password cannot be empty."
        )

    # Look up by email or username
    user = db.query(User).filter(
        (User.email == identifier_clean) | (User.username == identifier_clean)
    ).first()

    # Generic error without revealing username/email presence (prevents account enumeration)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please verify your email/username and password."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is currently deactivated. Contact your system administrator."
        )

    # Issue signed access token
    token = create_access_token({
        "sub": str(user.id),
        "username": user.username,
        "email": user.email,
        "role": user.role
    })

    # Set HttpOnly session cookie
    response.set_cookie(
        key="fraudscope_session",
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=86400
    )

    # Log audit event
    db.add(AuditEvent(
        actor=user.username,
        action="USER_LOGIN",
        entity_type="USER",
        entity_id=str(user.id),
        details=f"Successful authentication for {user.username} ({user.role})"
    ))
    db.commit()

    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
        message="Authentication successful. Welcome to FraudScope AI."
    )


@router.post("/logout")
def logout_user(response: Response, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Invalidates current session and clears the HttpOnly cookie.
    """
    response.delete_cookie(key="fraudscope_session", httponly=True, samesite="lax")

    db.add(AuditEvent(
        actor=current_user.username,
        action="USER_LOGOUT",
        entity_type="USER",
        entity_id=str(current_user.id),
        details="Session terminated by user"
    ))
    db.commit()

    return {"message": "Logged out successfully from FraudScope AI."}


@router.get("/me", response_model=UserResponse)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """
    Returns the authenticated user's profile information without sensitive hashes.
    """
    return current_user


@router.put("/profile", response_model=UserResponse)
def update_user_profile(
    payload: UserProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Updates authenticated user's personal profile information.
    """
    if payload.full_name is not None:
        name_clean = payload.full_name.strip()
        if len(name_clean) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Full name must be at least 2 characters long."
            )
        current_user.full_name = name_clean

    if payload.role is not None:
        role_clean = payload.role.strip()
        if role_clean in ALLOWED_REGISTRATION_ROLES:
            current_user.role = role_clean

    current_user.updated_at = datetime.now(timezone.utc)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return current_user


@router.post("/avatar", response_model=UserResponse)
async def upload_user_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Uploads, validates, and sets a custom profile photo for the authenticated user.
    """
    if file.content_type not in ALLOWED_AVATAR_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image format ({file.content_type}). Allowed formats: JPEG, PNG, WebP, GIF."
        )

    # Read and check size
    contents = await file.read()
    if len(contents) > MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile photo exceeds maximum allowed size of 2 MB."
        )
    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty."
        )

    # Determine safe file extension
    ext_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif"
    }
    ext = ext_map.get(file.content_type, ".jpg")
    safe_filename = f"avatar_{current_user.id}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    # Remove previous avatar file if exists
    if current_user.avatar_url and "/uploads/avatars/" in current_user.avatar_url:
        old_filename = os.path.basename(current_user.avatar_url)
        old_path = os.path.join(UPLOAD_DIR, old_filename)
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass

    # Save new file
    with open(file_path, "wb") as f:
        f.write(contents)

    current_user.avatar_url = f"/uploads/avatars/{safe_filename}"
    current_user.updated_at = datetime.now(timezone.utc)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return current_user


@router.delete("/avatar", response_model=UserResponse)
def remove_user_avatar(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Removes user's custom avatar and resets to default initials avatar.
    """
    if current_user.avatar_url and "/uploads/avatars/" in current_user.avatar_url:
        old_filename = os.path.basename(current_user.avatar_url)
        old_path = os.path.join(UPLOAD_DIR, old_filename)
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass

    current_user.avatar_url = None
    current_user.updated_at = datetime.now(timezone.utc)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return current_user


@router.post("/change-password")
def change_user_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Safely changes password after verifying current credentials.
    """
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password verification failed. Please enter your existing password correctly."
        )

    if payload.confirm_new_password and payload.new_password != payload.confirm_new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password and confirmation password do not match."
        )

    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters long."
        )
    if not any(char.isdigit() for char in payload.new_password) and not any(not char.isalnum() for char in payload.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must include at least one number or special character."
        )

    current_user.password_hash = hash_password(payload.new_password)
    current_user.updated_at = datetime.now(timezone.utc)
    db.add(current_user)
    db.commit()

    return {"message": "Password changed successfully."}

