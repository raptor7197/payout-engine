from typing import Optional, Tuple

from rest_framework import authentication, exceptions

from core.models import Merchant


class MerchantHeaderAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request) -> Optional[Tuple[Merchant, None]]:
        merchant_id = request.headers.get("X-Merchant-Id")
        bearer = request.headers.get("Authorization")
        if not merchant_id and bearer:
            if bearer.lower().startswith("bearer "):
                merchant_id = bearer.split(" ", 1)[1].strip()

        if not merchant_id:
            return None

        try:
            merchant = Merchant.objects.get(id=merchant_id)
        except (Merchant.DoesNotExist, ValueError):
            raise exceptions.AuthenticationFailed("Invalid merchant credentials")

        return (merchant, None)

    def authenticate_header(self, request) -> str:
        return "X-Merchant-Id"


class MerchantPermission:
    def has_permission(self, request, view):
        return isinstance(request.user, Merchant)


class AllowUnauthenticated:
    def has_permission(self, request, view):
        return True
