from django.contrib.auth.decorators import login_required
from users.models import Roles, User, ActivityLog
from django.contrib.auth import logout, login, authenticate
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render, redirect
from django.middleware.csrf import get_token
from django.utils import timezone



import json
import logging

logger = logging.getLogger(__name__)


@login_required
def users(request, userid=False, action=False):
    """
    POS User Management
    Handles:
    - User listing
    - User creation
    - User editing
    - Password reset
    - Password change
    - Enable/disable users
    - User profiles
    """

    data = {
        "title": "User List",
        "message": False,
        "status": "success",
    }

    messages = {
        "passwordreset": "Could not reset password, try again",
        "edit": "User edit failed, try again",
        "changepassword": "Password change failed, try again",
    }

    # ─────────────────────────────────────────────────────────────────────
    # POST REQUESTS
    # ─────────────────────────────────────────────────────────────────────

    if request.method == "POST":

        try:

            # ─────────────────────────────────────────────────────────────
            # RESET USER PASSWORD
            # ─────────────────────────────────────────────────────────────

            if action == "resetpassword":

                try:
                    usr = User.objects.get(pk=userid)

                    # Development/simple password reset:
                    # password becomes the username
                    usr.set_password(usr.username)
                    usr.save()

                    data["message"] = "Password reset successful."
                    code = 200

                except User.DoesNotExist:
                    data["message"] = "User not found."
                    code = 404

                except Exception:
                    data["message"] = messages["passwordreset"]
                    code = 500

                return JsonResponse(data, status=code)

            # ─────────────────────────────────────────────────────────────
            # ENABLE / DISABLE USER
            # ─────────────────────────────────────────────────────────────

            if action in ["disable", "enable"]:

                try:
                    status = action == "enable"

                    usr = User.objects.get(pk=userid)
                    usr.is_active = status
                    usr.save(update_fields=["is_active"])

                    data["message"] = (
                        f"User {'enabled' if status else 'disabled'} successfully."
                    )

                    code = 200

                except User.DoesNotExist:
                    data["message"] = "User not found."
                    code = 404

                except Exception:
                    data["message"] = (
                        f"Could not {'enable' if status else 'disable'} user, "
                        "try again"
                    )
                    code = 500

                return JsonResponse(data, status=code)

            # ─────────────────────────────────────────────────────────────
            # CHANGE CURRENT USER PASSWORD
            # ─────────────────────────────────────────────────────────────

            if action == "changepassword":

                password = request.POST.get("passwd")

                if not password:
                    return JsonResponse(
                        {
                            "status": False,
                            "message": "Password is required",
                        },
                        status=400,
                    )

                usr = request.user
                usr.set_password(password)
                usr.save()

                # Keep current session alive after password change
                login(request, usr)

                return JsonResponse(
                    {
                        "status": True,
                        "message": "Password changed successfully",
                    }
                )

            # ─────────────────────────────────────────────────────────────
            # EDIT EXISTING USER
            # ─────────────────────────────────────────────────────────────

            if action == "edit":

                usr = User.objects.get(pk=userid)

            # ─────────────────────────────────────────────────────────────
            # CREATE NEW USER
            # ─────────────────────────────────────────────────────────────

            else:

                username = str(
                    request.POST.get("username", "")
                ).strip().lower()

                if not username:
                    return JsonResponse(
                        {
                            "status": "error",
                            "message": "Username is required",
                        },
                        status=400,
                    )

                # Check duplicate username
                if User.objects.filter(username=username).exists():

                    return JsonResponse(
                        {
                            "status": "error",
                            "message": "Username already exists",
                        },
                        status=400,
                    )

                usr = User()

                usr.username = username

                # Development default password
                usr.set_password(username)

                # If your User model has this field
                if hasattr(usr, "offdays"):
                    usr.offdays = 0

            # ─────────────────────────────────────────────────────────────
            # COMMON USER FIELDS
            # ─────────────────────────────────────────────────────────────

            usr.firstname = request.POST.get("firstname", "").strip()
            usr.lastname = request.POST.get("lastname", "").strip()
            usr.email = request.POST.get("email", "").strip()
            usr.address = request.POST.get("address", "N/A")

            # ─────────────────────────────────────────────────────────────
            # ROLE
            # ─────────────────────────────────────────────────────────────

            role_id = request.POST.get("userrole")

            if not role_id:
                return JsonResponse(
                    {
                        "status": "error",
                        "message": "User role is required",
                    },
                    status=400,
                )

            usr.role = Roles.objects.get(pk=role_id)

            # ─────────────────────────────────────────────────────────────
            # OPTIONAL FIELDS
            # ─────────────────────────────────────────────────────────────

            if hasattr(usr, "avatar"):
                avatar = request.POST.get("fl_avatar")

                if avatar:
                    usr.avatar = avatar

            if hasattr(usr, "can_login"):
                usr.can_login = True

            usr.is_active = True

            # IMPORTANT:
            # Don't make every POS user an administrator.
            #
            # Only Administrator role gets admin privileges.
            if hasattr(usr, "is_admin"):
                usr.is_admin = (
                    usr.role.role_name.lower() == "administrator"
                )

            usr.save()

            data["message"] = (
                "User updated successfully."
                if action == "edit"
                else "User created successfully."
            )

            data["status"] = "success"

            return JsonResponse(
                data,
                status=200 if action == "edit" else 201
            )

        except User.DoesNotExist:

            return JsonResponse(
                {
                    "status": "error",
                    "message": "User not found.",
                },
                status=404,
            )

        except Roles.DoesNotExist:

            return JsonResponse(
                {
                    "status": "error",
                    "message": "Selected role does not exist.",
                },
                status=400,
            )

        except Exception as e:

            logger.exception("User operation failed")

            return JsonResponse(
                {
                    "status": "error",
                    "message": f"User operation failed: {str(e)}",
                },
                status=500,
            )

    # ─────────────────────────────────────────────────────────────────────
    # GET REQUESTS
    # ─────────────────────────────────────────────────────────────────────

    # Edit user
    if action == "edit":

        data["roles"] = Roles.objects.all().order_by("-id")

        data["user"] = get_object_or_404(
            User,
            pk=userid
        )

        return render(
            request,
            "users/edit.html",
            data
        )

    # User profile
    if userid and not action:

        data["user"] = get_object_or_404(
            User,
            pk=userid
        )

        data["title"] = "User Profile"

        return render(
            request,
            "main/profile.html",
            data
        )

    # User list
    data["users"] = User.objects.all().order_by("-id")

    data["roles"] = Roles.objects.all().order_by("-id")

    return render(
        request,
        "users/users.html",
        data
    )


# ─────────────────────────────────────────────────────────────────────────────
# LOGOUT
# ─────────────────────────────────────────────────────────────────────────────

def user_logout(request):

    if request.user.is_authenticated:

        try:
            ActivityLog.log(
                "logout",
                user=request.user,
                entity="User",
                entity_id=request.user.id,
                detail=f"{request.user.username} logged out",
                request=request,
            )
        except Exception:
            pass

    logout(request)

    return redirect("/login/")


# ─────────────────────────────────────────────────────────────────────────────
# CSRF
# ─────────────────────────────────────────────────────────────────────────────

def csrf_token_view(request):
    """
    GET /users/csrf/

    Returns CSRF token for the frontend.
    """

    token = get_token(request)

    response = JsonResponse(
        {
            "csrftoken": token
        }
    )

    response["X-CSRFToken"] = token

    return response


# ─────────────────────────────────────────────────────────────────────────────
# LOGIN
# ─────────────────────────────────────────────────────────────────────────────

def user_login(request):
    """
    Authenticate POS user and return user information.

    No agent, endpoint, queue or supervisor logic.
    """

    try:

        data = json.loads(request.body)

        username = data.get("username", "").strip()
        password = data.get("password", "").strip()

        if not username or not password:

            return JsonResponse(
                {
                    "status": "error",
                    "message": "Username and password required",
                },
                status=400,
            )

        user = authenticate(
            request,
            username=username,
            password=password,
        )

        # ─────────────────────────────────────────────────────────────────
        # INVALID LOGIN
        # ─────────────────────────────────────────────────────────────────

        if user is None:

            try:
                ActivityLog.log(
                    "login_failed",
                    user=None,
                    entity="User",
                    entity_id="",
                    detail=f"Failed login attempt for username: '{username}'",
                    request=request,
                )
            except Exception:
                pass

            return JsonResponse(
                {
                    "status": "error",
                    "message": "Invalid credentials",
                },
                status=401,
            )

        # ─────────────────────────────────────────────────────────────────
        # DISABLED ACCOUNT
        # ─────────────────────────────────────────────────────────────────

        if not user.is_active:

            try:
                ActivityLog.log(
                    "login_failed",
                    user=user,
                    entity="User",
                    entity_id=user.id,
                    detail=f"Login blocked — account disabled: '{username}'",
                    request=request,
                )
            except Exception:
                pass

            return JsonResponse(
                {
                    "status": "error",
                    "message": "Account is disabled",
                },
                status=403,
            )

        # ─────────────────────────────────────────────────────────────────
        # LOGIN
        # ─────────────────────────────────────────────────────────────────

        login(request, user)

        try:
            ActivityLog.log(
                "login",
                user=user,
                entity="User",
                entity_id=user.id,
                detail=f"{user.username} logged in",
                request=request,
            )
        except Exception:
            pass

        # ─────────────────────────────────────────────────────────────────
        # ROLE
        # ─────────────────────────────────────────────────────────────────

        role_name = ""

        try:

            if user.role:
                role_name = user.role.role_name

        except Exception:
            pass

        # ─────────────────────────────────────────────────────────────────
        # AVATAR
        # ─────────────────────────────────────────────────────────────────

        avatar_url = ""

        if hasattr(user, "avatar") and user.avatar:

            try:
                avatar_url = request.build_absolute_uri(
                    user.avatar.url
                )
            except Exception:
                pass

        # ─────────────────────────────────────────────────────────────────
        # POS RESPONSE
        # ─────────────────────────────────────────────────────────────────

        return JsonResponse(
            {
                "status": "success",

                "user": {
                    "id": user.id,
                    "username": user.username,

                    "full_name": (
                        f"{getattr(user, 'firstname', '')} "
                        f"{getattr(user, 'lastname', '')}"
                    ).strip() or user.username,

                    "email": user.email,

                    "role": role_name,

                    "avatar_url": avatar_url,
                },

                # Simple POS frontend entry point
                "redirect_to": "/",
            }
        )

    except json.JSONDecodeError:

        return JsonResponse(
            {
                "status": "error",
                "message": "Invalid JSON",
            },
            status=400,
        )

    except Exception as e:

        logger.exception("Login error")

        return JsonResponse(
            {
                "status": "error",
                "message": f"Login failed: {str(e)}",
            },
            status=500,
        )