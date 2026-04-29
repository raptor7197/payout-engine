from rest_framework import serializers

from core.models import BankAccount, LedgerEntry, Merchant, Payout


class BankAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankAccount
        fields = ["id", "account_masked", "ifsc", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]


class PayoutSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payout
        fields = [
            "id",
            "amount_paise",
            "status",
            "attempt_count",
            "failure_reason",
            "created_at",
            "updated_at",
            "processing_started_at",
            "completed_at",
            "failed_at",
        ]


class PayoutCreateSerializer(serializers.Serializer):
    amount_paise = serializers.IntegerField(min_value=1)
    bank_account_id = serializers.IntegerField()


class LedgerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = LedgerEntry
        fields = ["id", "entry_type", "amount_paise", "payout_id", "created_at"]


class MerchantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Merchant
        fields = ["id", "name", "email"]
