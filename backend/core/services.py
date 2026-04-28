import hashlib
import json
from datetime import timedelta
from typing import Optional

from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from core.models import (
    IdempotencyKey,
    IdempotencyState,
    LedgerEntry,
    LedgerEntryType,
    Merchant,
    MerchantBalance,
    Payout,
    PayoutStateTransition,
    PayoutStatus,
)

IDEMPOTENCY_TTL_HOURS = 24


class IdempotencyConflict(Exception):
    pass


class InsufficientFunds(Exception):
    pass


def hash_request(method: str, path: str, body: dict) -> str:
    normalized = json.dumps(
        {"method": method, "path": path, "body": body}, sort_keys=True
    )
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def start_idempotent_request(
    merchant: Merchant, key: str, request_hash: str
) -> tuple[IdempotencyKey, bool]:
    now = timezone.now()
    expires_at = now + timedelta(hours=IDEMPOTENCY_TTL_HOURS)
    try:
        record = IdempotencyKey.objects.create(
            merchant=merchant,
            key=key,
            request_hash=request_hash,
            state=IdempotencyState.IN_PROGRESS,
            expires_at=expires_at,
        )
        return record, True
    except IntegrityError:
        record = (
            IdempotencyKey.objects.select_for_update()
            .filter(merchant=merchant, key=key)
            .first()
        )
        if not record:
            raise
        if record.is_expired():
            record.delete()
            record = IdempotencyKey.objects.create(
                merchant=merchant,
                key=key,
                request_hash=request_hash,
                state=IdempotencyState.IN_PROGRESS,
                expires_at=expires_at,
            )
            return record, True
        if record.request_hash != request_hash:
            raise IdempotencyConflict("Idempotency key reuse with different payload")
        return record, False


def finalize_idempotency(
    record: IdempotencyKey,
    status_code: int,
    response_body: dict,
    resource_id: Optional[str] = None,
) -> None:
    record.response_status_code = status_code
    record.response_body = response_body
    record.resource_id = resource_id
    record.state = IdempotencyState.COMPLETED
    record.save(
        update_fields=[
            "response_status_code",
            "response_body",
            "resource_id",
            "state",
            "updated_at",
        ]
    )


def create_payout_with_hold(
    *,
    merchant: Merchant,
    amount_paise: int,
    bank_account,
    idempotency_key: Optional[str],
) -> Payout:
    with transaction.atomic():
        balance = (
            MerchantBalance.objects.select_for_update()
            .filter(merchant=merchant)
            .first()
        )
        if not balance:
            balance = MerchantBalance.objects.create(merchant=merchant)
        if balance.available_balance_paise < amount_paise:
            raise InsufficientFunds("Insufficient available balance")

        MerchantBalance.objects.filter(id=balance.id).update(
            available_balance_paise=F("available_balance_paise") - amount_paise,
            held_balance_paise=F("held_balance_paise") + amount_paise,
        )

        payout = Payout.objects.create(
            merchant=merchant,
            bank_account=bank_account,
            amount_paise=amount_paise,
            status=str(PayoutStatus.PENDING),
            idempotency_key=idempotency_key,
        )

        LedgerEntry.objects.create(
            merchant=merchant,
            entry_type=LedgerEntryType.PAYOUT_HOLD,
            amount_paise=amount_paise,
            payout=payout,
        )

        PayoutStateTransition.objects.create(
            payout=payout,
            from_status=str(PayoutStatus.PENDING),
            to_status=str(PayoutStatus.PENDING),
            actor="api",
            metadata={"note": "created"},
        )

        return payout


def transition_payout(
    *,
    payout: Payout,
    to_status: str,
    actor: str,
    metadata: Optional[dict] = None,
) -> None:
    allowed = {
        str(PayoutStatus.PENDING): {str(PayoutStatus.PROCESSING)},
        str(PayoutStatus.PROCESSING): {
            str(PayoutStatus.COMPLETED),
            str(PayoutStatus.FAILED),
        },
    }
    if payout.status not in allowed or to_status not in allowed[payout.status]:
        raise ValueError("Illegal payout status transition")

    now = timezone.now()
    from_status = payout.status
    update_fields = ["status", "updated_at"]
    payout.status = to_status
    if to_status == str(PayoutStatus.PROCESSING):
        payout.processing_started_at = now
        update_fields.append("processing_started_at")
    elif to_status == str(PayoutStatus.COMPLETED):
        payout.completed_at = now
        update_fields.append("completed_at")
    elif to_status == str(PayoutStatus.FAILED):
        payout.failed_at = now
        update_fields.append("failed_at")

    payout.save(update_fields=update_fields)

    PayoutStateTransition.objects.create(
        payout=payout,
        from_status=from_status,
        to_status=to_status,
        actor=actor,
        metadata=metadata or {},
    )


def complete_payout(payout: Payout) -> None:
    with transaction.atomic():
        payout = Payout.objects.select_for_update().get(id=payout.id)
        if payout.status != str(PayoutStatus.PROCESSING):
            return
        transition_payout(
            payout=payout, to_status=str(PayoutStatus.COMPLETED), actor="worker"
        )
        MerchantBalance.objects.filter(merchant=payout.merchant).update(
            held_balance_paise=F("held_balance_paise") - payout.amount_paise,
        )
        LedgerEntry.objects.create(
            merchant=payout.merchant,
            entry_type=LedgerEntryType.PAYOUT_DEBIT_FINAL,
            amount_paise=payout.amount_paise,
            payout=payout,
        )


def fail_payout(payout: Payout, reason: str) -> None:
    with transaction.atomic():
        payout = Payout.objects.select_for_update().get(id=payout.id)
        if payout.status != str(PayoutStatus.PROCESSING):
            return
        payout.failure_reason = reason
        payout.save(update_fields=["failure_reason", "updated_at"])
        transition_payout(
            payout=payout, to_status=str(PayoutStatus.FAILED), actor="worker"
        )
        MerchantBalance.objects.filter(merchant=payout.merchant).update(
            held_balance_paise=F("held_balance_paise") - payout.amount_paise,
            available_balance_paise=F("available_balance_paise") + payout.amount_paise,
        )
        LedgerEntry.objects.create(
            merchant=payout.merchant,
            entry_type=LedgerEntryType.PAYOUT_RELEASE,
            amount_paise=payout.amount_paise,
            payout=payout,
        )


def credit_merchant(
    merchant: Merchant, amount_paise: int, reference: Optional[dict] = None
) -> None:
    with transaction.atomic():
        balance, _ = MerchantBalance.objects.select_for_update().get_or_create(
            merchant=merchant
        )
        MerchantBalance.objects.filter(id=balance.id).update(
            available_balance_paise=F("available_balance_paise") + amount_paise
        )
        LedgerEntry.objects.create(
            merchant=merchant,
            entry_type=LedgerEntryType.CREDIT,
            amount_paise=amount_paise,
            reference=reference or {},
        )
