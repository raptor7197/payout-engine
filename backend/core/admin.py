from django.contrib import admin

from core.models import (
    BankAccount,
    IdempotencyKey,
    LedgerEntry,
    Merchant,
    MerchantBalance,
    Payout,
    PayoutStateTransition,
)

admin.site.register(Merchant)
admin.site.register(MerchantBalance)
admin.site.register(BankAccount)
admin.site.register(Payout)
admin.site.register(LedgerEntry)
admin.site.register(IdempotencyKey)
admin.site.register(PayoutStateTransition)
