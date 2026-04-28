import logging
import random
from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from core.models import IdempotencyKey, Payout, PayoutStatus
from core.services import complete_payout, fail_payout, transition_payout

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 3
BASE_BACKOFF_SECONDS = 30


@shared_task
def process_pending_payouts():
    payouts = (
        Payout.objects.filter(status=str(PayoutStatus.PENDING))
        .order_by("created_at")
        .values_list("id", flat=True)[:50]
    )
    for payout_id in payouts:
        process_single_payout.delay(payout_id)


@shared_task
def retry_stuck_payouts():
    now = timezone.now()
    payouts = (
        Payout.objects.filter(
            status=str(PayoutStatus.PROCESSING), next_retry_at__lte=now
        )
        .order_by("next_retry_at")
        .values_list("id", flat=True)[:50]
    )
    for payout_id in payouts:
        process_single_payout.delay(payout_id)


@shared_task
def purge_expired_idempotency_keys():
    now = timezone.now()
    deleted, _ = IdempotencyKey.objects.filter(expires_at__lte=now).delete()
    if deleted:
        logger.info("Purged expired idempotency keys", extra={"deleted": deleted})


@shared_task
def process_single_payout(payout_id: int):
    with transaction.atomic():
        payout = Payout.objects.select_for_update().get(id=payout_id)
        if payout.status == str(PayoutStatus.COMPLETED) or payout.status == str(
            PayoutStatus.FAILED
        ):
            return

        if payout.status == str(PayoutStatus.PENDING):
            transition_payout(
                payout=payout,
                to_status=str(PayoutStatus.PROCESSING),
                actor="worker",
            )

        if payout.attempt_count >= MAX_ATTEMPTS:
            logger.warning(
                "Payout exceeded max attempts",
                extra={"payout_id": payout.id, "attempts": payout.attempt_count},
            )
            fail_payout(payout, "max retries exceeded")
            return

        payout.attempt_count += 1
        payout.save(update_fields=["attempt_count", "updated_at"])
        outcome = random.random()
        if outcome < 0.7:
            logger.info("Payout completed", extra={"payout_id": payout.id})
            complete_payout(payout)
            return
        if outcome < 0.9:
            logger.info("Payout failed", extra={"payout_id": payout.id})
            fail_payout(payout, "simulated failure")
            return

        backoff_seconds = BASE_BACKOFF_SECONDS * (2 ** (payout.attempt_count - 1))
        payout.next_retry_at = timezone.now() + timedelta(seconds=backoff_seconds)
        payout.save(update_fields=["attempt_count", "next_retry_at", "updated_at"])
        logger.info(
            "Payout scheduled for retry",
            extra={"payout_id": payout.id, "next_retry_at": payout.next_retry_at},
        )
