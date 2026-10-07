from django.db.models import Q
from rest_framework.exceptions import PermissionDenied, ValidationError
from .utils import get_head_office_branch


def _is_admin(user):
    if getattr(user, "is_admin", False):
        return True
    try:
        return "admin" in (user.role.role_name or "").lower()
    except Exception:
        return False


def user_branch_id(user):
    bid = getattr(user, "branch_id", None)
    if bid:
        return bid
    try:
        return user.employee.branch_id
    except Exception:
        return None


def sees_all_branches(user):
    """Admins and Head Office staff see every branch."""
    if _is_admin(user):
        return True
    bid = user_branch_id(user)
    return bool(bid) and bid == get_head_office_branch().pk


def visible_branch_id(request):
    """
    None  -> no restriction (HO/admin with no ?branch= given)
    <id>  -> restrict to this branch (forced for branch users, optional for HO)
    """
    user = request.user
    if sees_all_branches(user):
        raw = request.query_params.get("branch")
        if not raw:
            return None
        try:
            return int(raw)
        except ValueError:
            raise ValidationError({"branch": "Invalid branch id."})
    bid = user_branch_id(user)
    if not bid:
        raise PermissionDenied("Your account isn't assigned to a branch.")
    return bid


def scope_by_branch(qs, request, *fields):
    """Filter qs to the caller's visible branch. Several fields are OR-ed (e.g. source/destination)."""
    bid = visible_branch_id(request)
    if bid is None:
        return qs
    q = Q()
    for f in fields:
        q |= Q(**{f: bid})
    return qs.filter(q)


def check_branch_access(user, branch_id):
    """Block writes against a branch the user doesn't belong to."""
    if sees_all_branches(user):
        return
    if str(branch_id) != str(user_branch_id(user)):
        raise PermissionDenied("You can only work with your own branch.")