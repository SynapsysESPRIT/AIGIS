from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('violence/', include('violence_app.urls')),
    path('nudity/', include('nudity_app.urls')),
    path('brainrot/', include('brainrot_app.urls')),
    path('text-classification/', include('text_app.urls')),
    path('audio_app/', include('audio_app.urls')),
    path('deepfake/', include('deepfake_app.urls')),
]
