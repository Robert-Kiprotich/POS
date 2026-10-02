from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from .models import Product, BranchStock
from .utils import get_head_office_branch

User = get_user_model()


@receiver(post_save, sender=Product)
def add_product_to_head_office(sender, instance, created, **kwargs):
    if created:
        BranchStock.objects.get_or_create(
            branch=get_head_office_branch(),
            product=instance,
            defaults={"stock_quantity": 0, "reorder_level": 5},
        )

@receiver(post_save, sender=User)
def bind_managers_to_head_office(sender, instance, created, **kwargs):
    role = (getattr(getattr(instance, "role", None), "role_name", "") or "").lower()
    if ("administrator" in role or "branch manager" in role) and instance.branch_id is None:
        sender.objects.filter(pk=instance.pk).update(branch=get_head_office_branch())