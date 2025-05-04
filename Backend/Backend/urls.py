from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('video/', include('video.urls')),
    path('image/', include('image.urls')),
    path('text/', include('text.urls')),
    path('audio/', include('audio.urls')),
]
