from django.shortcuts import render, redirect
from django.contrib.auth import logout as auth_logout
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import json

#from main.models import Cases, QAScorecard
from users.models import User

@csrf_exempt
def spa_logout(request):
    """Log out and redirect to the React SPA login page."""
    auth_logout(request)
    return redirect('/login')


@login_required
def home(request):
    data = {}
    ur = 'counsellor_home' if request.user.role.role_name.lower() == 'counsellor' else 'home'
    data['layout'] = 'full-width' if request.user.role.role_name.lower() == 'counsellor' else 'mini'
    return render(request, f'main/{ur}.html', data)
