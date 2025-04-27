from django.urls import path, include

urlpatterns = [
    path('', include('brainrot_app.urls')),
    path('', include('nudity_app.urls')),
]
