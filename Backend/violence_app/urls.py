from django.urls import path
from . import views

urlpatterns = [
    path('detect/', views.detect_violence, name='detect_violence'),
    path('analyze/', views.analyze_video, name='analyze_video'),
]