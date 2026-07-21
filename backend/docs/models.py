"""Docs / Q&A models.

Provides two content surfaces:
  * Guide: administratively curated documentation articles.
  * Q&A:  user-asked questions, answered by admins / tool_admins.

Both share a hierarchical :class:`DocCategory` (kind='guide' or 'qa') for
left-sidebar navigation.  Bodies are Markdown; Mermaid fences are rendered
client-side.  Inline images live in :class:`DocAttachment` and are embedded
into markdown via ``![](url)``.
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class DocCategory(models.Model):
    """Hierarchical category for guide articles / Q&A questions."""

    KIND_CHOICES = [
        ("guide", "ガイド"),
        ("qa", "Q&A"),
    ]

    id = models.BigAutoField(primary_key=True)
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100)
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="children",
    )
    order = models.IntegerField(default=0)
    icon = models.CharField(max_length=10, blank=True, help_text="絵文字 1〜2 字")

    class Meta:
        ordering = ["kind", "order", "name"]
        constraints = [
            models.UniqueConstraint(fields=["kind", "slug"], name="uniq_kind_slug"),
        ]
        verbose_name = "ドキュメントカテゴリ"
        verbose_name_plural = "ドキュメントカテゴリ"

    def __str__(self) -> str:
        return f"[{self.kind}] {self.name}"


class GuideArticle(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(
        DocCategory,
        on_delete=models.PROTECT,
        related_name="guide_articles",
        limit_choices_to={"kind": "guide"},
    )
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=200)
    body = models.TextField(blank=True, help_text="Markdown")
    order = models.IntegerField(default=0)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="guide_articles",
    )
    is_published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["category__order", "order", "title"]
        constraints = [
            models.UniqueConstraint(
                fields=["category", "slug"], name="uniq_guide_category_slug"
            ),
        ]
        verbose_name = "ガイド記事"
        verbose_name_plural = "ガイド記事"

    def __str__(self) -> str:
        return self.title


class Question(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(
        DocCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="questions",
        limit_choices_to={"kind": "qa"},
    )
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, help_text="Markdown")
    tags = models.CharField(max_length=200, blank=True, help_text="カンマ区切り")
    asker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="questions_asked",
    )
    is_resolved = models.BooleanField(
        default=False, help_text="良い回答が付いたら管理者がチェック"
    )
    view_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "質問"
        verbose_name_plural = "質問"

    def __str__(self) -> str:
        return self.title


class Answer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name="answers"
    )
    body = models.TextField(help_text="Markdown")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="answers_given",
    )
    is_accepted = models.BooleanField(default=False, help_text="ベストアンサー印")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_accepted", "created_at"]
        verbose_name = "回答"
        verbose_name_plural = "回答"


class DocAttachment(models.Model):
    """Uploaded image for embedding in Markdown via ``![](url)``.

    Not tied to a specific parent object — the uploader gets back the URL
    and pastes it into whatever markdown body they are editing.  Trades
    lifecycle cleanliness for a much simpler API surface.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    image = models.ImageField(upload_to="docs/attachments/")
    uploader = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="doc_attachments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "ドキュメント添付画像"
        verbose_name_plural = "ドキュメント添付画像"
