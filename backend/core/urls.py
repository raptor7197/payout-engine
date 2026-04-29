from django.urls import path

from core import views

urlpatterns = [
    path("health", views.HealthView.as_view()),
    path("merchants", views.MerchantListView.as_view()),
    path("merchant/summary", views.MerchantSummaryView.as_view()),
    path("bank-accounts", views.BankAccountListCreateView.as_view()),
    path("credits", views.CreditCreateView.as_view()),
    path("ledger", views.LedgerListView.as_view()),
    path("activity-log", views.ActivityLogView.as_view()),
    path("payouts", views.PayoutListCreateView.as_view()),
]
