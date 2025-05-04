from django.urls import path
from . import views

urlpatterns = [
    path('classify_text/', views.classify_text),
] 