from django.urls import path

from . import views

# Note: /api/me/tools|likes|requests|incoming-requests live in the tools app
# (they query tool-related models) and are wired there.
urlpatterns = [
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/register/", views.RegisterView.as_view(), name="auth-register"),
    path("me/", views.MeView.as_view(), name="me"),
    path(
        "admin/users/",
        views.AdminUserListCreateView.as_view(),
        name="admin-users",
    ),
    path(
        "admin/users/<int:pk>/",
        views.AdminUserDetailView.as_view(),
        name="admin-user-detail",
    ),
]
