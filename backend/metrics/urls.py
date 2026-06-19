from django.urls import path

from . import views

urlpatterns = [
    path("activity/", views.ActivityLogView.as_view(), name="activity"),
    path(
        "dashboard/summary/",
        views.DashboardSummaryView.as_view(),
        name="dashboard-summary",
    ),
    path(
        "dashboard/funnel/",
        views.DashboardFunnelView.as_view(),
        name="dashboard-funnel",
    ),
    path(
        "dashboard/aspice-distribution/",
        views.DashboardAspiceDistributionView.as_view(),
        name="dashboard-aspice-distribution",
    ),
]
