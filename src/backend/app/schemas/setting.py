from pydantic import BaseModel, Field


class SettingRead(BaseModel):
    """Response schema for a single Setting key/value pair."""

    key: str
    value: str

    model_config = {"from_attributes": True}


class SettingUpsert(BaseModel):
    """Request schema for upserting a Setting value by key."""

    value: str = Field(default="")
