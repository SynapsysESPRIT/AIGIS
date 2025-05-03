from django.urls import path
from . import views

urlpatterns = [
    path('classify_video/', views.classify_video),
]
