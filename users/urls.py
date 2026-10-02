from django.urls import path,include,re_path
from users import views

urlpatterns = [
   
     path('login/', views.user_login, name='login'),
    path('logout/', views.user_logout, name='logout'),
    path('csrf/', views.csrf_token_view, name='csrf_token'),
]
