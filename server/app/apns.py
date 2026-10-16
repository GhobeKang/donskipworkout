import time
from datetime import timezone
from pathlib import Path

import httpx
import jwt

from .workout_notifications import parse_notification_time


class apnsSender:
    def __init__(self, key_id: str, team_id: str, key_path: str, topic: str, environment: str):
        self.key_id = key_id
        self.team_id = team_id
        self.private_key = Path(key_path).read_text(encoding='utf-8')
        self.topic = topic
        self.host = (
            'https://api.sandbox.push.apple.com'
            if environment == 'sandbox'
            else 'https://api.push.apple.com'
        )
        self.client = httpx.Client(http2=True, timeout=10)
        self.provider_token = None
        self.provider_token_created_at = 0

    def authorization_token(self) -> str:
        now = int(time.time())
        if self.provider_token is None or now - self.provider_token_created_at >= 3000:
            self.provider_token = jwt.encode(
                {'iss': self.team_id, 'iat': now},
                self.private_key,
                algorithm='ES256',
                headers={'kid': self.key_id},
            )
            self.provider_token_created_at = now
        return self.provider_token

    def send(self, event, device):
        event_data = {
            key: value
            for key, value in event.payload.items()
            if isinstance(value, (str, int, float, bool))
        }
        event_data.update({'event_uuid': event.event_uuid, 'category': event.category})
        expires_at = parse_notification_time(event.payload.get('expires_at'))
        expiration = (
            str(int(expires_at.replace(tzinfo=timezone.utc).timestamp()))
            if expires_at
            else str(int(time.time()) + 86400)
        )
        english = device.language == 'en'
        title = event.payload.get('title_en', event.title) if english else event.title
        body = event.payload.get('body_en', event.body) if english else event.body
        return self.client.post(
            f'{self.host}/3/device/{device.token}',
            headers={
                'authorization': f'bearer {self.authorization_token()}',
                'apns-topic': self.topic,
                'apns-push-type': 'alert',
                'apns-priority': '10',
                'apns-expiration': expiration,
                'apns-collapse-id': event.event_uuid,
            },
            json={
                'aps': {'alert': {'title': title, 'body': body}, 'sound': 'default'},
                **event_data,
            },
        )

    def close(self):
        self.client.close()
