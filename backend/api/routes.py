"""API endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from backend.core.database import get_db
from backend.models.schemas import (
    ProfileCreate, ProfileResponse, UserProfile,
    BatchProcessRequest, BatchProcessResponse
)
from backend.models.database import Profile
from backend.services.orchestrator import ProcessingOrchestrator

router = APIRouter()


# Profile endpoints
@router.post("/profiles", response_model=ProfileResponse)
def create_profile(profile: ProfileCreate, db: Session = Depends(get_db)):
    """Create a new user profile."""
    db_profile = Profile(
        name=profile.name,
        profile_data=profile.profile_data.model_dump()
    )

    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)

    return ProfileResponse(
        id=db_profile.id,
        name=db_profile.name,
        profile_data=UserProfile(**db_profile.profile_data),
        created_at=db_profile.created_at,
        updated_at=db_profile.updated_at
    )


@router.get("/profiles", response_model=List[ProfileResponse])
def list_profiles(db: Session = Depends(get_db)):
    """List all profiles."""
    profiles = db.query(Profile).all()

    return [
        ProfileResponse(
            id=p.id,
            name=p.name,
            profile_data=UserProfile(**p.profile_data),
            created_at=p.created_at,
            updated_at=p.updated_at
        )
        for p in profiles
    ]


@router.get("/profiles/{profile_id}", response_model=ProfileResponse)
def get_profile(profile_id: int, db: Session = Depends(get_db)):
    """Get a specific profile."""
    profile = db.query(Profile).filter(Profile.id == profile_id).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    return ProfileResponse(
        id=profile.id,
        name=profile.name,
        profile_data=UserProfile(**profile.profile_data),
        created_at=profile.created_at,
        updated_at=profile.updated_at
    )


@router.put("/profiles/{profile_id}", response_model=ProfileResponse)
def update_profile(
    profile_id: int,
    profile_update: ProfileCreate,
    db: Session = Depends(get_db)
):
    """Update a profile."""
    profile = db.query(Profile).filter(Profile.id == profile_id).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile.name = profile_update.name
    profile.profile_data = profile_update.profile_data.model_dump()

    db.commit()
    db.refresh(profile)

    return ProfileResponse(
        id=profile.id,
        name=profile.name,
        profile_data=UserProfile(**profile.profile_data),
        created_at=profile.created_at,
        updated_at=profile.updated_at
    )


@router.delete("/profiles/{profile_id}")
def delete_profile(profile_id: int, db: Session = Depends(get_db)):
    """Delete a profile."""
    profile = db.query(Profile).filter(Profile.id == profile_id).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    db.delete(profile)
    db.commit()

    return {"status": "deleted"}


# Processing endpoints
@router.post("/process", response_model=BatchProcessResponse)
async def process_batch(request: BatchProcessRequest, db: Session = Depends(get_db)):
    """Process a batch of opportunities."""
    orchestrator = ProcessingOrchestrator(db)

    try:
        result = await orchestrator.process_batch(request)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


# Health check
@router.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
