import logging
from pathlib import Path
from typing import Annotated, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError

logger = logging.getLogger(__name__)
notification_message = Annotated[
    str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=500)
]


class notificationText(BaseModel):
    model_config = ConfigDict(extra='forbid')

    title: Annotated[
        str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=100)
    ]
    body: notification_message


class notificationDefaults(BaseModel):
    model_config = ConfigDict(extra='forbid')

    workout: notificationText
    free_workout: notificationText
    snooze: notificationText
    missed: notificationText


class notificationCatalog(BaseModel):
    model_config = ConfigDict(extra='forbid')

    defaults: notificationDefaults
    messages_by_roast_level: dict[
        Literal['off', 'spicy', 'hot'], Annotated[list[notification_message], Field(max_length=100)]
    ] = Field(default_factory=dict)


def read_notification_catalog(catalog_path):
    # Read on every request so an atomically replaced file takes effect without restart.
    try:
        return notificationCatalog.model_validate_json(Path(catalog_path).read_bytes())
    except (OSError, ValidationError) as error:
        logger.error('Notification catalog unavailable: %s', type(error).__name__)
        raise HTTPException(503, '알림 문구 설정을 불러올 수 없습니다.') from None
