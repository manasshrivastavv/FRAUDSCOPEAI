from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc

from app.database.session import get_db
from app.models.models import Notification, User
from app.schemas.schemas import NotificationSchema, NotificationListResponse
from app.core.security import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=NotificationListResponse)
def get_user_notifications(
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Fetches persistent notifications authorized for the authenticated user.
    Includes user-targeted notifications and broadcast system alerts.
    """
    query = db.query(Notification).filter(
        or_(Notification.user_id == current_user.id, Notification.user_id == None)
    )

    if unread_only:
        query = query.filter(Notification.is_read == False)

    total = query.count()
    notifications = query.order_by(desc(Notification.created_at)).offset(offset).limit(limit).all()

    unread_count = db.query(Notification).filter(
        or_(Notification.user_id == current_user.id, Notification.user_id == None),
        Notification.is_read == False
    ).count()

    return NotificationListResponse(
        notifications=[NotificationSchema.model_validate(n) for n in notifications],
        total=total,
        unread_count=unread_count
    )


@router.get("/unread-count")
def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns the real-time unread notification count for the badge indicator.
    """
    unread_count = db.query(Notification).filter(
        or_(Notification.user_id == current_user.id, Notification.user_id == None),
        Notification.is_read == False
    ).count()
    return {"unread_count": unread_count}


@router.post("/{notification_id}/read", response_model=NotificationSchema)
def mark_notification_as_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Marks a single notification as read.
    Validates ownership to prevent unauthorized state tampering.
    """
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        or_(Notification.user_id == current_user.id, Notification.user_id == None)
    ).first()

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found or access denied."
        )

    notification.is_read = True
    db.add(notification)
    db.commit()
    db.refresh(notification)

    return NotificationSchema.model_validate(notification)


@router.post("/read-all")
def mark_all_notifications_as_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Marks all accessible notifications as read for the current user.
    """
    notifications = db.query(Notification).filter(
        or_(Notification.user_id == current_user.id, Notification.user_id == None),
        Notification.is_read == False
    ).all()

    count = 0
    for notif in notifications:
        notif.is_read = True
        db.add(notif)
        count += 1

    db.commit()
    return {"message": "All notifications marked as read.", "updated_count": count}


def create_notification(
    db: Session,
    title: str,
    message: str,
    type: str = "SYSTEM",
    severity: str = "INFO",
    user_id: Optional[int] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None
) -> Notification:
    """
    Helper function to dispatch persistent system or user notifications
    during alerts, case creation, or scan completions.
    """
    notif = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=type,
        severity=severity,
        is_read=False,
        target_type=target_type,
        target_id=target_id
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif
