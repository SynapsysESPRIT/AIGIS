from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('violence/', include('violence_app.urls')),
    path('nudity/', include('nudity_app.urls')),
    path('brainrot/', include('brainrot_app.urls')),
]
