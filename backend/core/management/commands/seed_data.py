from core.models import BankAccount, Merchant
from core.services import credit_merchant
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Seed initial merchant, bank account, and balance"

    def handle(self, *args, **options):
        merchant_seeds = [
            ("merchant@example.com", "Demo Merchant", "****0000", "TEST0001", 100000),
            ("merchant2@example.com", "Demo Merchant 2", "****1111", "TEST0002", 50000),
            ("merchant3@example.com", "Demo Merchant 3", "****2222", "TEST0003", 75000),
            ("merchant4@example.com", "Demo Merchant 4", "****3333", "TEST0004", 60000),
            ("merchant5@example.com", "Demo Merchant 5", "****4444", "TEST0005", 125000),
            ("merchant6@example.com", "Demo Merchant 6", "****5555", "TEST0006", 90000),
        ]

        for email, name, account_masked, ifsc, opening_credit in merchant_seeds:
            merchant, _ = Merchant.objects.get_or_create(
                email=email, defaults={"name": name}
            )
            BankAccount.objects.get_or_create(
                merchant=merchant,
                account_masked=account_masked,
                ifsc=ifsc,
            )
            credit_merchant(merchant, opening_credit, reference={"source": "seed"})

        self.stdout.write(self.style.SUCCESS("Seed data created"))
