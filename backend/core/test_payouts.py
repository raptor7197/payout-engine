import threading

from core.models import BankAccount, Merchant, MerchantBalance, Payout
from core.services import credit_merchant
from django.test import TransactionTestCase
from rest_framework.test import APIClient


class PayoutConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.merchant = Merchant.objects.create(name="Test", email="test@example.com")
        MerchantBalance.objects.create(
            merchant=self.merchant, available_balance_paise=10000
        )
        self.bank_account = BankAccount.objects.create(
            merchant=self.merchant, account_masked="****1111", ifsc="TEST0001"
        )

    def test_concurrent_payouts_do_not_overdraft(self):
        client = APIClient()
        client.credentials(HTTP_X_MERCHANT_ID=str(self.merchant.id))

        responses = []

        def create_payout(idempotency_key):
            responses.append(
                client.post(
                    "/api/v1/payouts",
                    {
                        "amount_paise": 6000,
                        "bank_account_id": self.bank_account.id,
                    },
                    format="json",
                    HTTP_IDEMPOTENCY_KEY=idempotency_key,
                )
            )

        t1 = threading.Thread(target=create_payout, args=("key-1",))
        t2 = threading.Thread(target=create_payout, args=("key-2",))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        success_count = sum(1 for resp in responses if resp.status_code == 201)
        self.assertEqual(success_count, 1)


class PayoutIdempotencyTests(TransactionTestCase):
    def setUp(self):
        self.merchant = Merchant.objects.create(
            name="Test", email="idempotent@example.com"
        )
        self.bank_account = BankAccount.objects.create(
            merchant=self.merchant, account_masked="****2222", ifsc="TEST0002"
        )
        credit_merchant(self.merchant, 10000)

    def test_idempotent_payout_creation(self):
        client = APIClient()
        client.credentials(HTTP_X_MERCHANT_ID=str(self.merchant.id))
        payload = {"amount_paise": 5000, "bank_account_id": self.bank_account.id}

        response_one = client.post(
            "/api/v1/payouts",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="abc-123",
        )
        response_two = client.post(
            "/api/v1/payouts",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="abc-123",
        )

        self.assertEqual(response_one.status_code, response_two.status_code)
        self.assertEqual(response_one.data, response_two.data)
        self.assertEqual(Payout.objects.count(), 1)
