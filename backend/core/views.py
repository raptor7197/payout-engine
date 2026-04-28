from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.auth import AllowUnauthenticated
from core.models import (
    BankAccount,
    IdempotencyState,
    LedgerEntry,
    MerchantBalance,
    Payout,
)
from core.serializers import (
    BankAccountSerializer,
    LedgerEntrySerializer,
    PayoutCreateSerializer,
    PayoutSerializer,
)
from core.services import (
    IdempotencyConflict,
    InsufficientFunds,
    create_payout_with_hold,
    credit_merchant,
    finalize_idempotency,
    hash_request,
    start_idempotent_request,
)


class HealthView(APIView):
    permission_classes = [AllowUnauthenticated]

    def get(self, request):
        return Response({"status": "ok"})


class MerchantSummaryView(APIView):
    def get(self, request):
        balance = MerchantBalance.objects.filter(merchant=request.user).first()
        return Response(
            {
                "merchant_id": request.user.id,
                "available_balance_paise": balance.available_balance_paise
                if balance
                else 0,
                "held_balance_paise": balance.held_balance_paise if balance else 0,
            }
        )


class BankAccountListCreateView(APIView):
    def get(self, request):
        accounts = BankAccount.objects.filter(merchant=request.user, is_active=True)
        serializer = BankAccountSerializer(accounts, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = BankAccountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        account = serializer.save(merchant=request.user)
        return Response(
            BankAccountSerializer(account).data, status=status.HTTP_201_CREATED
        )


class CreditCreateView(APIView):
    def post(self, request):
        amount_paise = int(request.data.get("amount_paise", 0))
        if amount_paise <= 0:
            return Response({"detail": "amount_paise must be > 0"}, status=400)
        credit_merchant(request.user, amount_paise, reference={"source": "manual"})
        return Response({"status": "credited"})


class LedgerListView(APIView):
    def get(self, request):
        entries = LedgerEntry.objects.filter(merchant=request.user).order_by(
            "-created_at"
        )
        serializer = LedgerEntrySerializer(entries, many=True)
        return Response(serializer.data)


class PayoutListCreateView(APIView):
    def get(self, request):
        payouts = Payout.objects.filter(merchant=request.user).order_by("-created_at")
        serializer = PayoutSerializer(payouts, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = PayoutCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        idempotency_key = request.headers.get("Idempotency-Key")
        if not idempotency_key:
            return Response(
                {"detail": "Idempotency-Key header is required"}, status=400
            )

        request_hash = hash_request(
            request.method, request.path, serializer.validated_data
        )

        with transaction.atomic():
            try:
                idempotency_record, created = start_idempotent_request(
                    request.user, idempotency_key, request_hash
                )
            except IdempotencyConflict as exc:
                return Response({"detail": str(exc)}, status=409)
            except IntegrityError:
                idempotency_record, created = start_idempotent_request(
                    request.user, idempotency_key, request_hash
                )

            if (
                idempotency_record.state == IdempotencyState.COMPLETED
                and idempotency_record.response_body is not None
            ):
                return Response(
                    idempotency_record.response_body,
                    status=idempotency_record.response_status_code,
                )

            if (
                not created
                and idempotency_record.state == IdempotencyState.IN_PROGRESS
                and idempotency_record.response_body is None
                and idempotency_record.resource_id is None
            ):
                return Response(
                    {"detail": "Idempotency key request in progress"}, status=409
                )

            try:
                bank_account = BankAccount.objects.get(
                    id=serializer.validated_data["bank_account_id"],
                    merchant=request.user,
                    is_active=True,
                )
            except BankAccount.DoesNotExist:
                response_body = {"detail": "Bank account not found"}
                finalize_idempotency(idempotency_record, 404, response_body)
                return Response(response_body, status=404)

            try:
                payout = create_payout_with_hold(
                    merchant=request.user,
                    amount_paise=serializer.validated_data["amount_paise"],
                    bank_account=bank_account,
                    idempotency_key=idempotency_key,
                )
            except InsufficientFunds as exc:
                response_body = {"detail": str(exc)}
                finalize_idempotency(idempotency_record, 400, response_body)
                return Response(response_body, status=400)

            response_body = PayoutSerializer(payout).data
            finalize_idempotency(
                idempotency_record, 201, response_body, resource_id=str(payout.id)
            )
            return Response(response_body, status=201)
