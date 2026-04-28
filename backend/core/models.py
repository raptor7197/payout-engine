from django.db import models
from django.utils import timezone


class Merchant(models.Model):
    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.name} ({self.email})"


class MerchantBalance(models.Model):
    merchant = models.OneToOneField(Merchant, on_delete=models.CASCADE)
    available_balance_paise = models.BigIntegerField(default=0)
    held_balance_paise = models.BigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class BankAccount(models.Model):
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE)
    account_masked = models.CharField(max_length=32)
    ifsc = models.CharField(max_length=16)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class PayoutStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    PROCESSING = "processing", "Processing"
    COMPLETED = "completed", "Completed"
    FAILED = "failed", "Failed"


class Payout(models.Model):
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE)
    bank_account = models.ForeignKey(BankAccount, on_delete=models.PROTECT)
    amount_paise = models.BigIntegerField()
    status = models.CharField(max_length=16, choices=PayoutStatus.choices)
    attempt_count = models.IntegerField(default=0)
    next_retry_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.CharField(max_length=255, null=True, blank=True)
    idempotency_key = models.CharField(max_length=64, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    processing_started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)


class LedgerEntryType(models.TextChoices):
    CREDIT = "credit", "Credit"
    PAYOUT_HOLD = "payout_hold", "Payout hold"
    PAYOUT_RELEASE = "payout_release", "Payout release"
    PAYOUT_DEBIT_FINAL = "payout_debit_final", "Payout debit final"


class LedgerEntry(models.Model):
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE)
    entry_type = models.CharField(max_length=32, choices=LedgerEntryType.choices)
    amount_paise = models.BigIntegerField()
    payout = models.ForeignKey(Payout, on_delete=models.SET_NULL, null=True, blank=True)
    reference = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class IdempotencyState(models.TextChoices):
    IN_PROGRESS = "in_progress", "In progress"
    COMPLETED = "completed", "Completed"
    FAILED = "failed", "Failed"


class IdempotencyKey(models.Model):
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE)
    key = models.CharField(max_length=128)
    request_hash = models.CharField(max_length=64)
    response_status_code = models.IntegerField(null=True, blank=True)
    response_body = models.JSONField(null=True, blank=True)
    resource_type = models.CharField(max_length=64, default="payout")
    resource_id = models.CharField(max_length=64, null=True, blank=True)
    state = models.CharField(max_length=32, choices=IdempotencyState.choices)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["merchant", "key"], name="unique_idempotency_key"
            )
        ]

    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()


class PayoutStateTransition(models.Model):
    payout = models.ForeignKey(Payout, on_delete=models.CASCADE)
    from_status = models.CharField(max_length=16, choices=PayoutStatus.choices)
    to_status = models.CharField(max_length=16, choices=PayoutStatus.choices)
    actor = models.CharField(max_length=32)
    metadata = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
