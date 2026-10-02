
import os
from django.contrib import admin
from django.urls import include,path,re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from django.http import HttpResponse


DIST_DIR = os.path.join(settings.BASE_DIR, 'frontend', 'dist')

def serve_react(request, *args, **kwargs):
    index = os.path.join(DIST_DIR, 'index.html')
    if not os.path.exists(index):
        # Dev mode: React runs on Vite dev server at port 5173
        from django.shortcuts import redirect
        return redirect(f'http://localhost:5173{request.path}')
    with open(index, 'r', encoding='utf-8') as f:
        return HttpResponse(f.read(), content_type='text/html')

urlpatterns = [
    path('admin/', admin.site.urls),
     path("api/", include("api.urls")),
      path('main/', include('main.urls')),
       path('users/', include('users.urls')),
      re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
       re_path(r'^(?!api/).*$', serve_react),
]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)