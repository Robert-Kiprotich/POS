from .models import Branch

HEAD_OFFICE_NAME = "Head Office"

def get_head_office_branch():
    branch = Branch.objects.filter(name__iexact=HEAD_OFFICE_NAME).first()
    if branch:
        return branch
    return Branch.objects.create(
        name=HEAD_OFFICE_NAME, code="HQ", location="", phone="", is_active=True
    )