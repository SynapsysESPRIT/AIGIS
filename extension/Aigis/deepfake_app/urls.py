from django.urls import path
from . import views

urlpatterns = [
    path('detect/', views.detect_deepfake, name='detect_deepfake'),
    path('count/', views.get_deepfake_count, name='get_deepfake_count'),
] 