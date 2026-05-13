from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Response schema for the health check endpoint."""

    status: str
    version: str
