from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


# User Schemas
class UserCreate(BaseModel):
    username: str = Field(
        ..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_\-]+$"
    )
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)
    role: Literal["admin", "owner", "viewer"]
    password: str = Field(..., min_length=8, max_length=128)


class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    username: str = Field(
        ..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_\-]+$"
    )
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter.")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit.")
        return v


class UserRoleUpdate(BaseModel):
    role: Literal["admin", "owner", "viewer"]


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# Document Schemas
class DocumentUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    category: str | None = Field(None, min_length=1, max_length=50)
    sensitivity: Literal["Public", "Internal", "Confidential", "Restricted"] | None = (
        None
    )
    allow_viewer_download: bool | None = None


class DocumentResponse(BaseModel):
    id: int
    uuid: str
    title: str
    filename: str
    file_size: int
    mime_type: str
    sha256_hash: str
    category: str
    sensitivity: str
    owner_id: int
    owner_username: str | None = None
    my_permission: str | None = None
    can_download: bool = True
    allow_viewer_download: bool = False
    created_at: str
    updated_at: str


# Permission Schemas
class PermissionGrantRequest(BaseModel):
    target_username_or_id: str = Field(
        ..., description="Username or user ID to grant permission to"
    )
    permission_level: Literal["read", "edit"] = Field(
        ..., description="Access level to grant"
    )
    can_download: bool = Field(
        False, description="Whether to explicitly permit document downloading for viewers"
    )


class PermissionRevokeRequest(BaseModel):
    target_user_id: int


class PermissionEntry(BaseModel):
    user_id: int
    username: str
    full_name: str
    email: str
    permission_level: str
    can_download: bool = False
    granted_by: int
    granted_by_username: str | None = None
    granted_at: str


# Audit Schemas
class AuditLogEntry(BaseModel):
    id: int
    sequence_number: int
    timestamp: str
    user_id: int | None
    username: str
    action: str
    document_id: int | None
    document_title: str | None
    status: str
    ip_address: str | None
    details: str | None
    previous_hash: str
    entry_hash: str


class AuditVerificationResult(BaseModel):
    valid: bool
    total_records: int
    corrupted_sequence: int | None = None
    reason: str | None = None
    message: str | None = None
    last_verified_sequence: int | None = None
    latest_chain_hash: str | None = None


# AI Access Assistant Schemas
class AISuggestedGrant(BaseModel):
    user_id: int
    username: str
    full_name: str
    recommended_level: Literal["read", "edit"]
    confidence_score: float
    justification: str


class AISuggestionResponse(BaseModel):
    document_id: int
    document_title: str
    category: str
    sensitivity: str
    suggested_grants: list[AISuggestedGrant]
    safety_disclaimer: str = "AI recommendations are strictly advisory. Access is NEVER granted automatically without explicit human owner confirmation."


class AIConfirmGrantRequest(BaseModel):
    target_user_id: int
    permission_level: Literal["read", "edit"]
    ai_recommendation_id: str | None = None
