"""
create_test_users.py
====================
Development-only script to seed roles, users, and employees for the POS system.

Usage:
    python create_test_users.py

Roles (requires_login=Yes → gets a User account):
    ID 1 - Administrator       requires_login=True
    ID 2 - Branch Manager      requires_login=True
    ID 3 - Sales Clerk         requires_login=True
    ID 4 - Store Keeper        requires_login=True
    ID 5 - Cashier             requires_login=True

Roles (requires_login=No → HR-only, no User account):
    ID 6 - Cleaner             requires_login=False
    ID 7 - Groundsman          requires_login=False
    ID 8 - Security Guard      requires_login=False
"""

import os
import sys

# ── Django setup ─────────────────────────────────────────────────────────────

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.contrib.auth import get_user_model
from django.utils import timezone

from users.models import Roles
from api.models import Employee, Branch   # adjust import if Branch lives elsewhere

User = get_user_model()


# ── Roles ────────────────────────────────────────────────────────────────────
ROLES = [
    # (id, name, description, requires_login)
    (1, "Administrator",   "Full system access",              True),
    (2, "Branch Manager",  "Manages a branch and its staff",  True),
    (3, "Sales Clerk",     "Handles sales at the counter",    True),
    (4, "Store Keeper",    "Manages stock and inventory",     True),
    (5, "Cashier",         "Handles payments and receipts",   True),
    (6, "Cleaner",         "Cleaning and general upkeep",     False),
    (7, "Groundsman",      "Outdoor maintenance",             False),
    (8, "Security Guard",  "Premises security",               False),
    (9, "Driver",          "Delivers goods to customers and branches", False),
    (10, "Loader",         "Loads and unloads goods",         False),
    (11, "Veterinarian",   "Provides veterinary care",        True),
]



def seed_roles():
    print("\n" + "-" * 70)
    print("SEEDING ROLES")
    print("-" * 70)

    for role_id, name, description, requires_login in ROLES:
        role, created = Roles.objects.update_or_create(
            id=role_id,
            defaults={
                "role_name": name,
                "role_description": description,
                "requires_login": requires_login,
            },
        )
        tag = "Created" if created else "Updated"
        access = "system" if requires_login else "HR-only"
        print(f"  {tag:<8} [{role_id}] {name:<20} ({access})")


def get_role(role_id):
    try:
        return Roles.objects.get(id=role_id)
    except Roles.DoesNotExist:
        print(f"❌ Role ID={role_id} does not exist")
        return None


# ── Users (system-access roles only) ─────────────────────────────────────────

def create_or_update_user(
    username,
    password,
    firstname,
    lastname,
    email,
    phone,
    role_id,
    is_admin=False,
):
    role = get_role(role_id)
    if not role:
        return None

    if not role.requires_login:
        print(
            f"⚠️  Skipping user '{username}': role '{role.role_name}' "
            f"is HR-only (requires_login=False)."
        )
        return None

    user, created = User.objects.get_or_create(
        username=username,
        defaults={
            "firstname": firstname,
            "lastname": lastname,
            "email": email,
            "phone": phone,
            "role": role,
            "is_active": True,
            "is_admin": is_admin,
        },
    )

    if not created:
        user.firstname = firstname
        user.lastname = lastname
        user.email = email
        user.phone = phone
        user.role = role
        user.is_active = True
        user.is_admin = is_admin

    user.set_password(password)
    user.save()

    action = "Created" if created else "Updated"
    print(
        f"✅ {action:<8} "
        f"{username:<15} | "
        f"{role.role_name:<20} | "
        f"password: {password}"
    )
    return user


TEST_USERS = [
    # username, password, firstname, lastname, email, phone, role_id, is_admin
    ("admin",   "admin123",   "System", "Administrator", "admin@pos.local",   "0700000001", 1, True),
    ("manager", "manager123", "Branch", "Manager",       "manager@pos.local", "0700000002", 2, False),
    ("sales",   "sales123",   "Sales",  "Clerk",         "sales@pos.local",   "0700000003", 3, False),
    ("store",   "store123",   "Store",  "Keeper",        "store@pos.local",   "0700000004", 4, False),
    ("cashier", "cashier123", "Main",   "Cashier",       "cashier@pos.local", "0700000005", 5, False),
    ("vet", "vet123", "Main",   "Veterinarian",       "vet@pos.local", "0700000006", 11, False)
]


# ── Employees ────────────────────────────────────────────────────────────────

def ensure_branch():
    """Create a default branch if none exists — needed by employees."""
    branch, created = Branch.objects.get_or_create(
        code="HQ",
        defaults={"name": "Head Office", "location": "Main", "is_active": True},
    )
    if created:
        print(f"\n🏢 Created branch: {branch.name} ({branch.code})")
    return branch


def create_or_update_employee(
    user,               # may be None for HR-only staff
    first_name,
    last_name,
    position,
    department,
    role_id,
    phone="",
    email="",
    gender="",
    hire_date=None,
    employment_type=Employee.EmploymentType.FULL_TIME,
    status=Employee.Status.ACTIVE,
    basic_salary=None,
    requires_login_override=None,
    branch=None,
):
    role = get_role(role_id)
    if not role:
        return None

    hire_date = hire_date or timezone.localdate()

    # Match on linked user if given, else on (first_name, last_name, position).
    lookup = {"user": user} if user else {
        "first_name": first_name,
        "last_name": last_name,
        "position": position,
        "user__isnull": True,
    }

    defaults = {
        "first_name": first_name,
        "middle_name": "",
        "last_name": last_name,
        "gender": gender,
        "personal_email": email,
        "work_email": email,
        "phone": phone,
        "position": position,
        "department": department,
        "employment_type": employment_type,
        "status": status,
        "hire_date": hire_date,
        "role": role,
        "branch": branch,
        "basic_salary": basic_salary,
        "requires_login_override": requires_login_override,
        "user": user,
    }

    try:
        emp, created = Employee.objects.update_or_create(**lookup, defaults=defaults)
    except Employee.MultipleObjectsReturned:
        emp = Employee.objects.filter(**lookup).first()
        for k, v in defaults.items():
            setattr(emp, k, v)
        emp.save()
        created = False

    access = "system" if role.requires_login else "HR-only"
    tag = "Created" if created else "Updated"
    print(
        f"👤 {tag:<8} {emp.employee_number:<10} "
        f"{first_name} {last_name:<12} | "
        f"{role.role_name:<20} ({access})"
    )
    return emp


TEST_EMPLOYEES = [
    # user_username, first_name, last_name, position, department, role_id,
    # phone, email, gender, employment_type, status, salary
    ("admin",   "System", "Administrator", "System Administrator", "Administration", 1, "0700000001", "admin@pos.local",   "male",   "full_time", "active", 120000),
    ("manager", "Branch", "Manager",       "Branch Manager",       "Management",     2, "0700000002", "manager@pos.local", "male",   "full_time", "active",  80000),
    ("sales",   "Sales",  "Clerk",         "Sales Clerk",          "Sales",          3, "0700000003", "sales@pos.local",   "female", "full_time", "active",  45000),
    ("store",   "Store",  "Keeper",        "Store Keeper",         "Warehouse",      4, "0700000004", "store@pos.local",   "male",   "full_time", "active",  50000),
    ("cashier", "Main",   "Cashier",       "Cashier",              "Finance",        5, "0700000005", "cashier@pos.local", "female", "full_time", "active",  48000),
    ("veterinarian", "Mr.", "Kirui", "Veterinarian", "Veterinary", 11, "0700000006", "veterinarian@pos.local", "male", "full_time", "active", 60000),
    # HR-only staff — no linked User account.
    (None, "Mary",   "Wanjiku", "Cleaner",        "Facilities", 6, "0711000001", "", "female", "full_time", "active", 25000),
    (None, "John",   "Otieno",  "Groundsman",     "Facilities", 7, "0711000002", "", "male",   "full_time", "active", 27000),
    (None, "Peter",  "Mwangi",  "Security Guard", "Security",   8, "0711000003", "", "male",   "full_time", "active", 30000),
]


# ── Run Seeder ───────────────────────────────────────────────────────────────

print("\n" + "=" * 70)
print("POS — DEVELOPMENT SEEDER")
print("=" * 70)

# 1. Roles
seed_roles()

# 2. Branch
default_branch = ensure_branch()

# 3. Users
print("\n" + "-" * 70)
print("SEEDING SYSTEM USERS")
print("-" * 70)

users_by_username = {}
for user_data in TEST_USERS:
    try:
        u = create_or_update_user(*user_data)
        if u:
            users_by_username[u.username] = u
    except Exception as e:
        print(f"❌ Failed: {user_data[0]} → {e}")

# 4. Employees
print("\n" + "-" * 70)
print("SEEDING EMPLOYEES")
print("-" * 70)

for row in TEST_EMPLOYEES:
    (uname, first, last, position, department, role_id,
     phone, email, gender, etype, status, salary) = row
    try:
        linked_user = users_by_username.get(uname) if uname else None
        create_or_update_employee(
            user=linked_user,
            first_name=first,
            last_name=last,
            position=position,
            department=department,
            role_id=role_id,
            phone=phone,
            email=email,
            gender=gender,
            employment_type=etype,
            status=status,
            basic_salary=salary,
            branch=default_branch,
        )
    except Exception as e:
        print(f"❌ Failed employee {first} {last} → {e}")


# ── Summary ──────────────────────────────────────────────────────────────────

print("\n" + "=" * 70)
print("LOGIN CREDENTIALS (system users only)")
print("=" * 70)
print(f"{'Username':<15}{'Password':<15}{'Role'}")
print("-" * 60)

for username, password, _fn, _ln, _em, _ph, role_id, _adm in TEST_USERS:
    role = Roles.objects.filter(id=role_id).first()
    role_name = role.role_name if role else "Unknown"
    print(f"{username:<15}{password:<15}{role_name}")

print("\n" + "=" * 70)
print("HR-ONLY STAFF (no login — will not appear in the users module)")
print("=" * 70)
for row in TEST_EMPLOYEES:
    uname, first, last, position, _dept, role_id, *_ = row
    if uname:
        continue
    role = Roles.objects.filter(id=role_id).first()
    role_name = role.role_name if role else "Unknown"
    print(f"{first} {last:<15} | {role_name:<20} | {position}")

print("\n" + "=" * 70)
print("Development data seeded successfully.")
print("=" * 70)