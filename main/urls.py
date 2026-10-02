from django.urls import path, include, re_path
from main import views

urlpatterns = [

    path('', views.home, name='index'),  
    path('logout/', views.spa_logout, name='spa-logout'),
]