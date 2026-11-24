import logging
import re
from pathlib import Path
from typing import Literal
from urllib.parse import parse_qs, urlsplit

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/v1/app-updates', tags=['app-updates'])
version_pattern = r'^\d{1,9}(?:\.\d{1,9}){0,2}$'


class appRelease(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

    latest_version: str | None = Field(default=None, pattern=version_pattern)
    latest_build: str | None = Field(default=None, pattern=version_pattern)
    store_url: str = Field(min_length=1, max_length=500)

    @field_validator('store_url')
    @classmethod
    def validate_store_url(cls, value):
        parsed_url = urlsplit(value)
        if (parsed_url.scheme != 'https' or parsed_url.username or parsed_url.password
                or parsed_url.port or parsed_url.hostname not in {'play.google.com', 'apps.apple.com'}):
            raise ValueError('An HTTPS app store URL is required')
        return value


class appReleaseCatalog(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

    android: appRelease
    ios: appRelease


@router.get('/{platform}', response_model=appRelease)
def get_app_release(platform: Literal['android', 'ios'], request: Request, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    try:
        catalog = appReleaseCatalog.model_validate_json(
            Path(request.app.state.settings.app_release_catalog_path).read_bytes(),
        )
        release = getattr(catalog, platform)
        parsed_url = urlsplit(release.store_url)
        if platform == 'android':
            valid_store = (parsed_url.hostname == 'play.google.com'
                           and parsed_url.path == '/store/apps/details'
                           and parse_qs(parsed_url.query).get('id') == ['com.donskip.attendancecheck'])
        else:
            valid_store = (parsed_url.hostname == 'apps.apple.com'
                           and re.fullmatch(r'/(?:[a-z]{2}/)?app/(?:[^/]+/)?id6823856877/?', parsed_url.path))
        if not valid_store:
            raise ValueError('The store URL must identify this app on the requested platform')
    except (OSError, ValueError, ValidationError) as error:
        logger.warning('app_release_catalog_unavailable error_type=%s', type(error).__name__)
        raise HTTPException(status_code=503, detail='업데이트 정보를 확인할 수 없습니다.',
                            headers={'Cache-Control': 'no-store'}) from None
    if release.latest_version is None:
        return Response(status_code=204, headers={'Cache-Control': 'no-store'})
    return release
