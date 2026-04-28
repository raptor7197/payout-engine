from core.models import BankAccount, Merchant
from core.services import credit_merchant
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Seed initial merchant, bank account, and balance"

    def handle(self, *args, **options):
        merchant, _ = Merchant.objects.get_or_create(
            email="merchant@example.com", defaults={"name": "Demo Merchant"}
        )
        BankAccount.objects.get_or_create(
            merchant=merchant,
            account_masked="****0000",
            ifsc="TEST0001",
        )
        credit_merchant(merchant, 100000, reference={"source": "seed"})

        # Additional seed data
        merchant2, _ = Merchant.objects.get_or_create(
            email="merchant2@example.com", defaults={"name": "Demo Merchant 2"}
        )
        BankAccount.objects.get_or_create(
            merchant=merchant2,
            account_masked="****1111",
            ifsc="TEST0002",
        )
        credit_merchant(merchant2, 50000, reference={"source": "seed"})

        merchant3, _ = Merchant.objects.get_or_create(
            email="merchant3@example.com", defaults={"name": "Demo Merchant 3"}
        )
        BankAccount.objects.get_or_create(
            merchant=merchant3,
            account_masked="****2222",
            ifsc="TEST0003",
        )
        credit_merchant(merchant3, 75000, reference={"source": "seed"})

        self.stdout.write(self.style.SUCCESS("Seed data created"))
