from django.contrib.auth import authenticate, get_user_model, login, logout
from rest_framework import generics, status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsAdmin
from .serializers import (
    AdminUserCreateSerializer,
    AdminUserUpdateSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    MeUpdateSerializer,
    RegisterSerializer,
    UserSerializer,
)

User = get_user_model()


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            username=serializer.validated_data["username"],
            password=serializer.validated_data["password"],
        )
        if user is None:
            return Response(
                {"detail": "IDまたはパスワードが正しくありません。"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not user.is_active:
            return Response(
                {"detail": "このアカウントは無効です。"},
                status=status.HTTP_403_FORBIDDEN,
            )
        login(request, user)  # session auth
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {"token": token.key, "user": UserSerializer(user).data}
        )


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        if request.user.is_authenticated:
            # Invalidate token auth as well, if present.
            Token.objects.filter(user=request.user).delete()
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer
    queryset = User.objects.all()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {"token": token.key, "user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


# --------------------------------------------------------------------------- #
# Current user
# --------------------------------------------------------------------------- #
class MeView(APIView):
    """GET: 自分の情報を取得。PATCH: 表示名・メールを更新（自分自身のみ）。"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = MeUpdateSerializer(
            request.user, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class MePasswordView(APIView):
    """自分のパスワード変更。旧パスワードによる本人確認が必須。"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        old = serializer.validated_data["old_password"]
        new = serializer.validated_data["new_password"]
        if not request.user.check_password(old):
            return Response(
                {"detail": "現在のパスワードが正しくありません。"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        request.user.set_password(new)
        request.user.save(update_fields=["password"])
        # 既存トークンを無効化し、再ログインを促す
        Token.objects.filter(user=request.user).delete()
        return Response({"detail": "パスワードを更新しました。再ログインしてください。"})


# --------------------------------------------------------------------------- #
# Admin user management
# --------------------------------------------------------------------------- #
class AdminUserListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAdmin]
    queryset = User.objects.all().order_by("-date_joined")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return AdminUserCreateSerializer
        return UserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            UserSerializer(user).data, status=status.HTTP_201_CREATED
        )


class AdminUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """管理者: 個別ユーザーの取得・更新・削除。

    DELETE はソフトに `is_active=False` ではなく実削除。ただし自分自身は削除
    不可（管理者のロックアウト防止）。
    """

    permission_classes = [IsAdmin]
    queryset = User.objects.all()

    def get_serializer_class(self):
        if self.request.method in ("PATCH", "PUT"):
            return AdminUserUpdateSerializer
        return UserSerializer

    def update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        super().update(request, *args, **kwargs)
        instance = self.get_object()
        return Response(UserSerializer(instance).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.pk == request.user.pk:
            return Response(
                {"detail": "自分自身を削除することはできません。"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
