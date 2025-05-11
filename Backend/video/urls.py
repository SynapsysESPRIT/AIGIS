from django.urls import path
from . import views

urlpatterns = [
    path('health/', views.health_check, name='health'),
    path('brainrot/', views.classify_video, name='brainrot'),
    path('violence/', views.detect_violence, name='violence'),
    path('violence-analyze/', views.analyze_video, name='violence_analyze'),
    path('deepfake/', views.detect_deepfake, name='deepfake'),
    path('deepfake-count/', views.get_deepfake_count, name='deepfake_count'),
    path('epilepsy/', views.detect_epilepsy, name='epilepsy'),
] 